import twilio from 'twilio';
import { appConfig } from '../config/env';

// Initialize Twilio client - lazy initialized
let twilioClient: twilio.Twilio | null = null;
let twilioInitialized = false;

function getTwilioClient(): twilio.Twilio | null {
  if (twilioInitialized) return twilioClient;

  if (!appConfig.twilioAccountSid) {
    console.warn('[SMS] TWILIO_ACCOUNT_SID not set - SMS will be logged only');
    twilioInitialized = true;
    return null;
  }

  // Twilio supports two auth flows; API keys (SK…) are preferred for prod
  // because they can be revoked without rotating the account auth token.
  const useApiKey = !!(appConfig.twilioApiKeySid && appConfig.twilioApiKeySecret);
  if (!useApiKey && !appConfig.twilioAuthToken) {
    console.warn('[SMS] No Twilio credentials (need TWILIO_AUTH_TOKEN or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET) - SMS will be logged only');
    twilioInitialized = true;
    return null;
  }

  // Either a Messaging Service SID (preferred for A2P 10DLC) or a from-number
  // is required for sends to succeed.
  if (!appConfig.twilioMessagingServiceSid && !appConfig.twilioPhoneNumber) {
    console.warn('[SMS] Twilio missing TWILIO_MESSAGING_SERVICE_SID and TWILIO_PHONE_NUMBER - SMS will be logged only');
    twilioInitialized = true;
    return null;
  }

  const sender = appConfig.twilioMessagingServiceSid
    ? `messagingServiceSid=${appConfig.twilioMessagingServiceSid}`
    : `from=${appConfig.twilioPhoneNumber}`;
  const auth = useApiKey ? `apiKey=${appConfig.twilioApiKeySid}` : 'authToken';
  console.log(`[SMS] Initializing Twilio client (${auth}, ${sender})`);

  if (useApiKey) {
    twilioClient = twilio(
      appConfig.twilioApiKeySid!,
      appConfig.twilioApiKeySecret!,
      { accountSid: appConfig.twilioAccountSid! },
    );
  } else {
    twilioClient = twilio(appConfig.twilioAccountSid!, appConfig.twilioAuthToken!);
  }
  twilioInitialized = true;
  return twilioClient;
}

// Check if SMS service is configured
export function isSmsConfigured(): boolean {
  const hasAuth =
    !!appConfig.twilioAuthToken ||
    !!(appConfig.twilioApiKeySid && appConfig.twilioApiKeySecret);
  const hasSender =
    !!appConfig.twilioMessagingServiceSid || !!appConfig.twilioPhoneNumber;
  return !!appConfig.twilioAccountSid && hasAuth && hasSender;
}

// Compliance footer required by carriers for A2P 10DLC campaigns.
// Matches the wording on the approved Playfunia campaign samples.
const STOP_FOOTER = 'Reply STOP to opt out.';

function withStopFooter(body: string): string {
  // Idempotent: don't double-append if a caller already included it.
  return /reply\s+stop/i.test(body) ? body : `${body} ${STOP_FOOTER}`;
}

// Normalize phone number to E.164 format
function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null;

  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // If it doesn't start with +, assume US number and add +1
  if (!cleaned.startsWith('+')) {
    // Remove leading 1 if present (for numbers like 1-234-567-8901)
    if (cleaned.startsWith('1') && cleaned.length === 11) {
      cleaned = '+' + cleaned;
    } else if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else {
      // Invalid number format
      return null;
    }
  }

  // Basic validation - E.164 numbers should be between 8 and 15 digits (plus the +)
  if (cleaned.length < 9 || cleaned.length > 16) {
    return null;
  }

  return cleaned;
}

export interface SendSmsResult {
  success: boolean;
  messageSid?: string;
}

// Build a per-message statusCallback URL for Twilio delivery webhooks. The
// notificationId query param lets the webhook route the update to the matching
// notification_queue row even before we've persisted the SID. Returns null
// when we don't have a public URL to point Twilio at.
function buildStatusCallbackUrl(notificationId?: number): string | undefined {
  if (!notificationId) return undefined;
  const base = appConfig.frontendUrl?.replace(/\/$/, '');
  if (!base) return undefined;
  return `${base}/api/webhooks/twilio/status?notificationId=${notificationId}`;
}

// Send SMS helper. Routes through the registered Messaging Service when
// TWILIO_MESSAGING_SERVICE_SID is set, otherwise falls back to the bare
// from-number (sandbox/dev). Always appends the STOP footer for customer
// transactional sends; OTP/staff helpers can opt out by passing
// `appendStopFooter: false`. When `notificationId` is supplied, a
// statusCallback is attached so Twilio can POST delivery updates back.
async function sendSms(options: {
  to: string;
  body: string;
  appendStopFooter?: boolean;
  notificationId?: number;
}): Promise<SendSmsResult> {
  const normalizedPhone = normalizePhoneNumber(options.to);

  if (!normalizedPhone) {
    console.log(`[SMS] Invalid phone number format: ${options.to}`);
    return { success: false };
  }

  const body = options.appendStopFooter === false
    ? options.body
    : withStopFooter(options.body);

  const client = getTwilioClient();

  if (!client) {
    console.log(`[SMS] Twilio not configured. Would send to ${normalizedPhone}: ${body}`);
    return { success: false };
  }

  try {
    const payload: {
      body: string;
      to: string;
      messagingServiceSid?: string;
      from?: string;
      statusCallback?: string;
    } = {
      body,
      to: normalizedPhone,
    };
    if (appConfig.twilioMessagingServiceSid) {
      payload.messagingServiceSid = appConfig.twilioMessagingServiceSid;
    } else {
      payload.from = appConfig.twilioPhoneNumber;
    }
    const statusCallback = buildStatusCallbackUrl(options.notificationId);
    if (statusCallback) {
      payload.statusCallback = statusCallback;
    }
    const message = await client.messages.create(payload);
    console.log(`[SMS] Sent to ${normalizedPhone} (sid=${message.sid})`);
    return { success: true, messageSid: message.sid };
  } catch (error) {
    console.error(`[SMS] Failed to send to ${normalizedPhone}:`, error);
    return { success: false };
  }
}

// Send verification OTP via SMS. OTP messages are exempt from the STOP footer
// because they are user-initiated authentication codes, not marketing.
export async function sendVerificationOtpSms(phone: string, otp: string, firstName?: string): Promise<SendSmsResult> {
  const name = firstName || 'there';
  return sendSms({
    to: phone,
    body: `Hi ${name}! Your Playfunia verification code is: ${otp}. This code expires in 10 minutes.`,
    appendStopFooter: false,
  });
}

// Send password reset OTP via SMS
export async function sendPasswordResetOtpSms(phone: string, otp: string, firstName?: string): Promise<SendSmsResult> {
  const name = firstName || 'there';
  return sendSms({
    to: phone,
    body: `Hi ${name}! Your Playfunia password reset code is: ${otp}. This code expires in 10 minutes.`,
    appendStopFooter: false,
  });
}

// Booking confirmation data interface
export interface BookingSmsData {
  phone: string;
  guestName: string;
  reference: string;
  eventDate: string;
  startTime: string;
  location: string;
  packageName: string;
  guestCount: number;
  depositAmount: number;
  balanceRemaining: number;
}

// Send booking confirmation SMS — matches approved sample #1.
export async function sendBookingConfirmationSms(data: BookingSmsData, notificationId?: number): Promise<SendSmsResult> {
  const location = data.location || 'Crossgates Mall, Albany NY';
  return sendSms({
    to: data.phone,
    body: `Playfunia Party Confirmed! Hi ${data.guestName}, your ${data.packageName} party is booked for ${data.eventDate} at ${data.startTime}. Ref: ${data.reference}. Guests: ${data.guestCount}. Balance due: $${data.balanceRemaining.toFixed(2)}. Location: ${location}.`,
    notificationId,
  });
}

// Ticket purchase confirmation data interface
export interface TicketSmsData {
  phone: string;
  customerName: string;
  tickets: Array<{
    label: string;
    quantity: number;
    codes: string[];
  }>;
  totalAmount: number;
}

// Send ticket confirmation SMS — matches approved sample #2.
export async function sendTicketConfirmationSms(data: TicketSmsData, notificationId?: number): Promise<SendSmsResult> {
  const ticketSummary = data.tickets.map(t => `${t.label} x${t.quantity}`).join(', ');
  const codes = data.tickets.flatMap(t => t.codes).join(', ');

  return sendSms({
    to: data.phone,
    body: `Playfunia Tickets! Hi ${data.customerName}, your tickets: ${ticketSummary}. Total: $${data.totalAmount.toFixed(2)}. Your entry codes: ${codes}. Show these at the front desk on arrival.`,
    notificationId,
  });
}

// Membership confirmation data interface
export interface MembershipSmsData {
  phone: string;
  customerName: string;
  tierName: string;
  startDate: string;
  expiryDate: string;
  visitsPerMonth: number | null;
  monthlyPrice: number;
  membershipId?: string | number;
}

// Send membership confirmation SMS — matches approved sample #4.
export async function sendMembershipConfirmationSms(data: MembershipSmsData, notificationId?: number): Promise<SendSmsResult> {
  const idLine = data.membershipId ? ` Your membership ID: #${data.membershipId}.` : '';
  return sendSms({
    to: data.phone,
    body: `Playfunia Membership Active! Hi ${data.customerName}, your ${data.tierName} membership is now active starting ${data.startDate}.${idLine} Enjoy your benefits at Playfunia!`,
    notificationId,
  });
}

// Queued membership confirmation data interface
export interface QueuedMembershipSmsData {
  phone: string;
  customerName: string;
  tierName: string;
  queuedStartDate: string;
  currentExpiryDate: string;
  monthlyPrice: number;
}

// Send queued membership confirmation SMS (when user already has active membership of same tier)
export async function sendQueuedMembershipConfirmationSms(data: QueuedMembershipSmsData, notificationId?: number): Promise<SendSmsResult> {
  return sendSms({
    to: data.phone,
    body: `Playfunia ${data.tierName} Membership Queued! Hi ${data.customerName}, you already have an active membership. Your new membership will start on ${data.queuedStartDate} (after current expires on ${data.currentExpiryDate}). $${data.monthlyPrice.toFixed(2)}/month.`,
    notificationId,
  });
}

// Order confirmation data interface
export interface OrderSmsData {
  phone: string;
  customerName: string;
  orderNumber: string;
  total: number;
  itemCount: number;
}

// Send order confirmation SMS
export async function sendOrderConfirmationSms(data: OrderSmsData, notificationId?: number): Promise<SendSmsResult> {
  return sendSms({
    to: data.phone,
    body: `Playfunia Order Confirmed! Hi ${data.customerName}, order #${data.orderNumber} for ${data.itemCount} item(s) totaling $${data.total.toFixed(2)} is confirmed. Thank you for your purchase!`,
    notificationId,
  });
}

// Send booking reminder SMS (for upcoming parties)
export async function sendBookingReminderSms(data: {
  phone: string;
  guestName: string;
  reference: string;
  eventDate: string;
  startTime: string;
  location: string;
  daysUntil: number;
}, notificationId?: number): Promise<SendSmsResult> {
  const timeText = data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`;

  return sendSms({
    to: data.phone,
    body: `Playfunia Reminder! Hi ${data.guestName}, your party (Ref: ${data.reference}) is ${timeText} on ${data.eventDate} at ${data.startTime}. Location: ${data.location}. We can't wait to celebrate with you!`,
    notificationId,
  });
}

// Send membership expiry reminder SMS
export async function sendMembershipExpiryReminderSms(data: {
  phone: string;
  customerName: string;
  tierName: string;
  expiryDate: string;
  daysRemaining: number;
}, notificationId?: number): Promise<SendSmsResult> {
  return sendSms({
    to: data.phone,
    body: `Playfunia Membership Alert! Hi ${data.customerName}, your ${data.tierName} membership expires on ${data.expiryDate} (${data.daysRemaining} day${data.daysRemaining === 1 ? '' : 's'}). Renew now to keep your benefits!`,
    notificationId,
  });
}

// Waiver confirmation SMS data interface
export interface WaiverSmsData {
  phone: string;
  guardianName: string;
  childCount: number;
  waiverCode: string;
  signedAt: string;
  childName?: string;
}

// Send waiver confirmation SMS — matches approved sample #3.
export async function sendWaiverConfirmationSms(data: WaiverSmsData, notificationId?: number): Promise<SendSmsResult> {
  const subject = data.childName
    ? data.childName
    : data.childCount === 1
      ? 'your child'
      : `${data.childCount} children`;
  return sendSms({
    to: data.phone,
    body: `Playfunia Waiver Confirmed! Hi ${data.guardianName}, your waiver has been successfully signed for ${subject}. Waiver Ref: #${data.waiverCode}. Please show this confirmation at check-in if needed.`,
    notificationId,
  });
}

// Birthday offer marketing SMS — sent after every waiver sign for new and
// returning customers. The body already ends with "Reply STOP to opt out."
// so withStopFooter() will not double-append.
export interface BirthdayOfferSmsData {
  phone: string;
  guardianName: string;
}

export async function sendBirthdayOfferSms(data: BirthdayOfferSmsData, notificationId?: number): Promise<SendSmsResult> {
  const firstName = (data.guardianName || '').trim().split(/\s+/)[0] || 'there';
  return sendSms({
    to: data.phone,
    body: `Playfunia Birthday Offer! 🎉 Hi ${firstName}, celebrating a birthday in May? Use code MAY10 and get 10% off your party booking! Book now at https://playfunia.com/book-party. Reply STOP to opt out.`,
    notificationId,
  });
}

// ---------------------------------------------------------------------------
// Employee / staff operational SMS — covers approved use cases:
//   • Work schedule assignments
//   • Task assignment alerts (sample #5)
//   • Clock-in / clock-out reminders
//
// Staff are opted in during onboarding when their profile is created in the
// employee management portal; callers should still no-op when no phone is on
// file. Staff messages are operational (not marketing) but the carrier still
// expects the STOP footer, so it is appended by sendSms() like customer sends.
// ---------------------------------------------------------------------------

// Send a staff task assignment alert — matches approved sample #5.
export async function sendStaffTaskAlertSms(data: {
  phone: string;
  staffName: string;
  taskTitle?: string;
}, notificationId?: number): Promise<SendSmsResult> {
  const detail = data.taskTitle ? ` Task: ${data.taskTitle}.` : '';
  return sendSms({
    to: data.phone,
    body: `Playfunia Staff Task Alert: Hi ${data.staffName}, a new task has been assigned to you.${detail} Please log in to the employee portal to review the task details and complete it on time.`,
    notificationId,
  });
}

// Send a work schedule assignment notification.
export async function sendStaffScheduleAssignmentSms(data: {
  phone: string;
  staffName: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  role?: string;
}, notificationId?: number): Promise<SendSmsResult> {
  const role = data.role ? ` as ${data.role}` : '';
  return sendSms({
    to: data.phone,
    body: `Playfunia Schedule: Hi ${data.staffName}, you are scheduled${role} on ${data.shiftDate} from ${data.startTime} to ${data.endTime}. Log in to the employee portal for details.`,
    notificationId,
  });
}

// Send a clock-in/out reminder.
export async function sendStaffClockReminderSms(data: {
  phone: string;
  staffName: string;
  reminderType: 'clock_in' | 'clock_out';
  shiftStartTime?: string;
}, notificationId?: number): Promise<SendSmsResult> {
  const action = data.reminderType === 'clock_in' ? 'clock in' : 'clock out';
  const when = data.reminderType === 'clock_in' && data.shiftStartTime
    ? ` Your shift starts at ${data.shiftStartTime}.`
    : '';
  return sendSms({
    to: data.phone,
    body: `Playfunia Reminder: Hi ${data.staffName}, please remember to ${action}.${when} Log in to the employee portal to update your time.`,
    notificationId,
  });
}
