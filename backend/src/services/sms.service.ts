import twilio from 'twilio';
import { appConfig } from '../config/env';

// Initialize Twilio client - lazy initialized
let twilioClient: twilio.Twilio | null = null;
let twilioInitialized = false;

function getTwilioClient(): twilio.Twilio | null {
  if (twilioInitialized) return twilioClient;

  if (!appConfig.twilioAccountSid || !appConfig.twilioAuthToken || !appConfig.twilioPhoneNumber) {
    console.warn('[SMS] Twilio not configured - SMS will be logged only');
    twilioInitialized = true;
    return null;
  }

  console.log(`[SMS] Initializing Twilio client with phone: ${appConfig.twilioPhoneNumber}`);
  twilioClient = twilio(appConfig.twilioAccountSid, appConfig.twilioAuthToken);
  twilioInitialized = true;
  return twilioClient;
}

// Check if SMS service is configured
export function isSmsConfigured(): boolean {
  return !!(appConfig.twilioAccountSid && appConfig.twilioAuthToken && appConfig.twilioPhoneNumber);
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

// Send SMS helper
async function sendSms(options: {
  to: string;
  body: string;
}): Promise<boolean> {
  const normalizedPhone = normalizePhoneNumber(options.to);

  if (!normalizedPhone) {
    console.log(`[SMS] Invalid phone number format: ${options.to}`);
    return false;
  }

  const client = getTwilioClient();

  if (!client) {
    console.log(`[SMS] Twilio not configured. Would send to ${normalizedPhone}: ${options.body}`);
    return false;
  }

  try {
    await client.messages.create({
      body: options.body,
      from: appConfig.twilioPhoneNumber,
      to: normalizedPhone,
    });
    console.log(`[SMS] Sent to ${normalizedPhone}`);
    return true;
  } catch (error) {
    console.error(`[SMS] Failed to send to ${normalizedPhone}:`, error);
    return false;
  }
}

// Send verification OTP via SMS
export async function sendVerificationOtpSms(phone: string, otp: string, firstName?: string): Promise<boolean> {
  const name = firstName || 'there';
  return sendSms({
    to: phone,
    body: `Hi ${name}! Your Playfunia verification code is: ${otp}. This code expires in 10 minutes.`,
  });
}

// Send password reset OTP via SMS
export async function sendPasswordResetOtpSms(phone: string, otp: string, firstName?: string): Promise<boolean> {
  const name = firstName || 'there';
  return sendSms({
    to: phone,
    body: `Hi ${name}! Your Playfunia password reset code is: ${otp}. This code expires in 10 minutes.`,
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

// Send booking confirmation SMS
export async function sendBookingConfirmationSms(data: BookingSmsData): Promise<boolean> {
  return sendSms({
    to: data.phone,
    body: `Playfunia Party Confirmed! Hi ${data.guestName}, your ${data.packageName} party is booked for ${data.eventDate} at ${data.startTime}. Ref: ${data.reference}. Guests: ${data.guestCount}. Balance due: $${data.balanceRemaining.toFixed(2)}. See you soon!`,
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

// Send ticket confirmation SMS
export async function sendTicketConfirmationSms(data: TicketSmsData): Promise<boolean> {
  const ticketSummary = data.tickets.map(t => `${t.quantity}x ${t.label}`).join(', ');
  const codes = data.tickets.flatMap(t => t.codes).join(', ');

  return sendSms({
    to: data.phone,
    body: `Playfunia Tickets! Hi ${data.customerName}, your tickets: ${ticketSummary}. Total: $${data.totalAmount.toFixed(2)}. Codes: ${codes}. Show these at entry. See you soon!`,
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
}

// Send membership confirmation SMS
export async function sendMembershipConfirmationSms(data: MembershipSmsData): Promise<boolean> {
  const visits = data.visitsPerMonth ? `${data.visitsPerMonth} visits/month` : 'Unlimited visits';

  return sendSms({
    to: data.phone,
    body: `Welcome to Playfunia ${data.tierName}! Hi ${data.customerName}, your membership is active from ${data.startDate} to ${data.expiryDate}. ${visits}. $${data.monthlyPrice.toFixed(2)}/month. See you soon!`,
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
export async function sendOrderConfirmationSms(data: OrderSmsData): Promise<boolean> {
  return sendSms({
    to: data.phone,
    body: `Playfunia Order Confirmed! Hi ${data.customerName}, order #${data.orderNumber} for ${data.itemCount} item(s) totaling $${data.total.toFixed(2)} is confirmed. Thank you for your purchase!`,
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
}): Promise<boolean> {
  const timeText = data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`;

  return sendSms({
    to: data.phone,
    body: `Playfunia Reminder! Hi ${data.guestName}, your party (Ref: ${data.reference}) is ${timeText} on ${data.eventDate} at ${data.startTime}. Location: ${data.location}. We can't wait to celebrate with you!`,
  });
}

// Send membership expiry reminder SMS
export async function sendMembershipExpiryReminderSms(data: {
  phone: string;
  customerName: string;
  tierName: string;
  expiryDate: string;
  daysRemaining: number;
}): Promise<boolean> {
  return sendSms({
    to: data.phone,
    body: `Playfunia Membership Alert! Hi ${data.customerName}, your ${data.tierName} membership expires on ${data.expiryDate} (${data.daysRemaining} days). Renew now to keep your benefits!`,
  });
}
