import nodemailer from 'nodemailer';
import { randomInt } from 'crypto';
import { DateTime } from 'luxon';
import { appConfig } from '../config/env';
import { logger } from '../utils/logger';

// Admin emails for receiving copies of all notifications (from env config)
const ADMIN_EMAILS = appConfig.adminEmails;
// Waiver-specific admin emails (falls back to ADMIN_EMAILS if not configured)
const WAIVER_ADMIN_EMAILS = appConfig.waiverAdminEmails ?? ADMIN_EMAILS;
// Contact-form inbox — kept narrow so customer inquiries don't fan out to
// personal admin inboxes and so "Reply" lands on the customer's address.
const CONTACT_INBOX_EMAILS = appConfig.contactInboxEmails;

// Create reusable transporter - lazy initialized
let transporter: nodemailer.Transporter | null = null;
let transporterInitialized = false;
let smtpWarningLogged = false;

function getTransporter(): nodemailer.Transporter | null {
  // Only create once after proper initialization
  if (transporterInitialized) return transporter;

  if (!appConfig.smtpHost || !appConfig.smtpUser || !appConfig.smtpPass) {
    if (!smtpWarningLogged) {
      logger.warn('SMTP not configured - all emails (including OTP verification) will be logged only. Set SMTP_HOST, SMTP_USER, and SMTP_PASS to enable email delivery.');
      smtpWarningLogged = true;
    }
    transporterInitialized = true;
    return null;
  }

  const port = typeof appConfig.smtpPort === 'string' ? parseInt(appConfig.smtpPort, 10) : (appConfig.smtpPort || 587);
  const secure = appConfig.smtpSecure === true;

  console.log(`[Email] Creating SMTP transporter (AWS SES) - host: ${appConfig.smtpHost}, port: ${port}, secure: ${secure}`);

  transporter = nodemailer.createTransport({
    host: appConfig.smtpHost,
    port,
    secure,
    requireTLS: !secure, // Use STARTTLS when not using direct SSL
    auth: {
      user: appConfig.smtpUser,
      pass: appConfig.smtpPass,
    },
  });

  transporterInitialized = true;
  return transporter;
}

// Escape HTML special characters to prevent injection in email templates
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Check if email service is configured
export function isEmailConfigured(): boolean {
  return !!(appConfig.smtpHost && appConfig.smtpUser && appConfig.smtpPass);
}

// Generate 6-digit OTP using cryptographically secure randomness
export function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}

// ============= Calendar Helper Functions =============

// Business timezone - Albany, NY is Eastern Time
const BUSINESS_TIMEZONE = 'America/New_York';

interface CalendarEventData {
  title: string;
  description: string;
  location: string;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM or "2:00 PM" format
  durationMinutes: number;
  reference: string;
}

// Parse time string to 24-hour format
function parseTime(timeStr: string): { hours: number; minutes: number } {
  // Handle formats like "2:00 PM", "14:00", "2:00pm"
  const cleanTime = timeStr.trim().toUpperCase();
  const isPM = cleanTime.includes('PM');
  const isAM = cleanTime.includes('AM');
  const timePart = cleanTime.replace(/\s*(AM|PM)\s*/i, '');
  const parts = timePart.split(':');
  const hoursStr = parts[0] || '0';
  const minutesStr = parts[1] || '0';
  let hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return { hours, minutes };
}

// Extract YYYY-MM-DD from a date string that may be formatted (e.g. "Friday, February 7, 2026")
// Returns the original string if it already looks like YYYY-MM-DD
function extractISODate(dateStr: string): string {
  // Already in ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  // Try parsing as a human-readable date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return dateStr; // fallback — will fail downstream, but no worse than before
}

// Convert business time (Eastern) to UTC Date object
function businessTimeToUTC(dateStr: string, hours: number, minutes: number): Date {
  // Use Luxon for correct DST handling instead of hardcoded approximations
  const year = parseInt(dateStr.split('-')[0] || '2026', 10);
  const month = parseInt(dateStr.split('-')[1] || '1', 10);
  const day = parseInt(dateStr.split('-')[2] || '1', 10);

  const dt = DateTime.fromObject(
    { year, month, day, hour: hours, minute: minutes, second: 0 },
    { zone: BUSINESS_TIMEZONE }
  );

  return dt.toJSDate();
}

// Format date for ICS in UTC (YYYYMMDDTHHMMSSZ)
function formatICSDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  // Use UTC time with Z suffix for proper timezone handling
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

// Generate ICS calendar file content
function generateICSContent(event: CalendarEventData): string {
  const { hours, minutes } = parseTime(event.startTime);

  // Convert business time (Eastern) to UTC
  const startDateUTC = businessTimeToUTC(event.startDate, hours, minutes);
  const endDate = new Date(startDateUTC.getTime() + event.durationMinutes * 60 * 1000);

  const uid = `${event.reference}-${Date.now()}@playfunia.com`;
  const now = formatICSDate(new Date());

  // Escape special characters in description
  const escapedDescription = event.description
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Playfunia//Party Booking//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART:${formatICSDate(startDateUTC)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${event.title}
DESCRIPTION:${escapedDescription}
LOCATION:${event.location}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;
}

// Generate Google Calendar link
function generateGoogleCalendarLink(event: CalendarEventData): string {
  const { hours, minutes } = parseTime(event.startTime);

  // Convert business time (Eastern) to UTC
  const startDateUTC = businessTimeToUTC(event.startDate, hours, minutes);
  const endDate = new Date(startDateUTC.getTime() + event.durationMinutes * 60 * 1000);

  const formatGoogleDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleDate(startDateUTC)}/${formatGoogleDate(endDate)}`,
    details: event.description,
    location: event.location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Generate Outlook/Office 365 calendar link
function generateOutlookCalendarLink(event: CalendarEventData): string {
  const { hours, minutes } = parseTime(event.startTime);

  // Convert business time (Eastern) to UTC
  const startDateUTC = businessTimeToUTC(event.startDate, hours, minutes);
  const endDate = new Date(startDateUTC.getTime() + event.durationMinutes * 60 * 1000);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: startDateUTC.toISOString(),
    enddt: endDate.toISOString(),
    body: event.description,
    location: event.location,
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

// Attachment interface for emails
interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

// Send email helper
async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  bcc?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    logger.info({ to: options.to, subject: options.subject }, 'Email not sent (SMTP not configured)');
    return false;
  }

  try {
    await transport.sendMail({
      from: `"${appConfig.smtpFromName}" <${appConfig.smtpFrom || appConfig.smtpUser}>`,
      to: options.to,
      bcc: options.bcc,
      replyTo: options.replyTo,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });
    logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully');
    return true;
  } catch (error) {
    logger.error({ err: error, to: options.to, subject: options.subject }, 'Failed to send email');
    return false;
  }
}

// Send email verification OTP
export async function sendVerificationOTP(email: string, otp: string, firstName?: string): Promise<boolean> {
  const name = escapeHtml(firstName || 'there');
  return sendEmail({
    to: email,
    subject: 'Verify your Playfunia account',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <h2 style="color: #1e1b4b;">Hi ${name}!</h2>
        <p style="color: #4b5563; font-size: 16px;">Your verification code is:</p>
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; color: white; letter-spacing: 8px;">${otp}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Hi ${name}! Your Playfunia verification code is: ${otp}. This code expires in 10 minutes.`,
  });
}

// Send password reset OTP
export async function sendPasswordResetOTP(email: string, otp: string, firstName?: string): Promise<boolean> {
  const name = escapeHtml(firstName || 'there');
  return sendEmail({
    to: email,
    subject: 'Reset your Playfunia password',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <h2 style="color: #1e1b4b;">Hi ${name}!</h2>
        <p style="color: #4b5563; font-size: 16px;">Your password reset code is:</p>
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; color: white; letter-spacing: 8px;">${otp}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Hi ${name}! Your Playfunia password reset code is: ${otp}. This code expires in 10 minutes.`,
  });
}

// Notify a user that they've been granted team (admin/staff) access, with a
// plain-English summary of what they can and cannot do.
export async function sendTeamRoleAssignment(
  email: string,
  role: 'admin' | 'employee',
  firstName?: string,
): Promise<boolean> {
  const name = escapeHtml(firstName || 'there');
  const isAdmin = role === 'admin';
  const roleLabel = isAdmin ? 'Administrator' : 'Staff';
  const dashboardUrl = `${appConfig.frontendUrl.replace(/\/$/, '')}/admin`;

  const adminPoints = [
    'Full access to the operations dashboard and all management tools',
    'Manage bookings, tickets, memberships, customers and waivers',
    'Edit pricing, packages, promotions, coupons and content',
    'Access financial reports and manage team members & access',
  ];
  const staffCan = [
    'View party bookings, online ticket purchases, customers, memberships and waivers',
    'Redeem and verify online ticket codes',
    'Validate memberships and check members in',
    'Create walk-in bookings, issue tickets and create memberships',
  ];
  const staffCannot = [
    'Delete bookings, customers or other records',
    'Edit pricing, change packages or manage membership plans',
    'Access financial reports or revenue figures',
    'Manage content settings or other team members',
  ];

  const list = (items: string[], color: string, mark: string) =>
    items
      .map(
        (i) =>
          `<p style="color:#4b5563;margin:6px 0;font-size:14px;"><span style="color:${color};font-weight:bold;">${mark}</span> ${escapeHtml(i)}</p>`,
      )
      .join('');

  const accessHtml = isAdmin
    ? `<h3 style="color:#1e1b4b;font-size:15px;margin:18px 0 6px;">Your access</h3>${list(adminPoints, '#22c55e', '&#10003;')}`
    : `<h3 style="color:#1e1b4b;font-size:15px;margin:18px 0 6px;">What you can do</h3>${list(staffCan, '#22c55e', '&#10003;')}` +
      `<h3 style="color:#1e1b4b;font-size:15px;margin:18px 0 6px;">What you can&#39;t do</h3>${list(staffCannot, '#ef4444', '&#10007;')}`;

  const textSummary = isAdmin
    ? 'You have full management access to the dashboard.'
    : "You can view bookings, tickets, customers, memberships and waivers; redeem & verify tickets; check members in; and create walk-in bookings/tickets/memberships. You cannot delete records, edit pricing/packages, view financial reports, manage content, or manage team members.";

  return sendEmail({
    to: email,
    subject: `You've been granted ${roleLabel} access to Playfunia`,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#7c3aed;margin:0;">Playfunia</h1>
        </div>
        <h2 style="color:#1e1b4b;">Hi ${name}!</h2>
        <p style="color:#4b5563;font-size:16px;">You've been granted <strong>${roleLabel}</strong> access to the Playfunia operations dashboard.</p>
        ${accessHtml}
        <div style="text-align:center;margin:28px 0;">
          <a href="${dashboardUrl}" style="background:linear-gradient(135deg,#7c3aed,#ff6b9d);color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;display:inline-block;">Open the dashboard</a>
        </div>
        <p style="color:#6b7280;font-size:14px;">Sign in at <a href="${dashboardUrl}" style="color:#7c3aed;">${dashboardUrl}</a> with this email address. If you don't have a password yet, use "Forgot password" on the sign-in page to set one.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;">
        <p style="color:#9ca3af;font-size:12px;text-align:center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Hi ${name}! You've been granted ${roleLabel} access to the Playfunia dashboard. Sign in at ${dashboardUrl} with this email address (use "Forgot password" if you need to set one). ${textSummary}`,
  });
}

// Send a marketing/campaign email. Wraps the (plain-text) body in a branded
// template and appends a CAN-SPAM opt-out notice. Recipients are opt-in only.
export async function sendMarketingEmail(to: string, subject: string, body: string): Promise<boolean> {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return sendEmail({
    to,
    subject,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#7c3aed;margin:0;">Playfunia</h1>
        </div>
        ${paragraphs}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;">
        <p style="color:#9ca3af;font-size:12px;text-align:center;">
          You're receiving this because you opted in to Playfunia marketing.
          To stop receiving these emails, reply to this message or contact us.
        </p>
      </div>
    `,
    text: `${body}\n\n—\nYou're receiving this because you opted in to Playfunia marketing. Reply to opt out.`,
  });
}

// Booking confirmation data interface
export interface BookingEmailData {
  reference: string;
  guestName: string;
  email: string;
  eventDate: string;
  rawEventDate?: string; // YYYY-MM-DD format for calendar links
  startTime: string;
  location: string;
  packageName: string;
  packageBasePrice?: number;
  guestCount: number;
  depositAmount: number;
  subtotal?: number;
  cleaningFee?: number;
  taxAmount?: number;
  taxRate?: number; // Tax rate as percentage (e.g., 8 for 8%)
  totalAmount: number;
  balanceRemaining: number;
  // Itemized extras
  extraChildren?: { count: number; unitPrice: number; total: number };
  extraAdults?: { count: number; unitPrice: number; total: number };
  addOns?: Array<{ name: string; quantity: number; price: number }>;
  durationMinutes?: number; // Party duration for calendar event (defaults to 120)
  receiptPdf?: Buffer;
  receiptNumber?: string;
  // Customer contact
  phone?: string;
  // Children celebrating
  children?: Array<{ name: string; birthDate?: string }>;
  // Special requests / notes
  notes?: string;
  // Package details for PDF and email
  packageDetails?: {
    priceUsd: number;
    baseChildren: number;
    baseRoomHours: number;
    includesFood: boolean;
    includesDrinks: boolean;
    includesDecor: boolean;
    notes?: string;
    features?: string[];
    additionalTerms?: Array<{ title: string; description: string }>;
    extraChildPrice?: number;
    extraAdultPrice?: number;
  };
}

// Send booking confirmation email
export async function sendBookingConfirmation(data: BookingEmailData): Promise<boolean> {
  const addOnsHtml = data.addOns?.length
    ? `<tr><td style="padding: 8px 0; color: #4b5563;">Add-ons</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.addOns.map(a => `${a.name} x${a.quantity}`).join(', ')}</td></tr>`
    : '';

  // Children celebrating section
  const childrenHtml = data.children?.length
    ? `<div style="background: #faf5ff; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #7c3aed;">
        <h3 style="color: #7c3aed; margin: 0 0 10px 0; font-size: 14px;">Birthday Celebrant${data.children.length > 1 ? 's' : ''}</h3>
        ${data.children.map(c => `<p style="color: #4b5563; margin: 4px 0; font-size: 14px;"><strong>${escapeHtml(c.name)}</strong>${c.birthDate ? ` <span style="color: #6b7280;">(DOB: ${escapeHtml(c.birthDate)})</span>` : ''}</p>`).join('')}
      </div>`
    : '';

  // Phone number row
  const phoneHtml = data.phone
    ? `<tr><td style="padding: 8px 0; color: #4b5563;">Phone</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.phone)}</td></tr>`
    : '';

  // Package info section (one adult per child, extra pricing, features, additional terms)
  const pkgDetails = data.packageDetails;
  const packageInfoHtml = pkgDetails ? (() => {
    const extraChildPrice = pkgDetails.extraChildPrice ?? 40;
    const extraAdultPrice = pkgDetails.extraAdultPrice ?? 10;
    const features = (pkgDetails.features ?? []).map(f => f.split('|')[0] ?? '');
    const terms = pkgDetails.additionalTerms ?? [];
    const featuresHtml = features.length > 0
      ? `<div style="margin-top: 12px;">${features.map(f => `<p style="color: #4b5563; margin: 4px 0; font-size: 13px;">✓ ${escapeHtml(f)}</p>`).join('')}</div>`
      : '';
    const termsHtml = terms.length > 0
      ? `<div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #e5e7eb;"><p style="color: #7c3aed; font-weight: 600; font-size: 13px; margin: 0 0 6px 0;">Additional Terms</p>${terms.map((t, i) => `<p style="color: #4b5563; margin: 3px 0; font-size: 12px;">${i + 1}. <strong>${escapeHtml(t.title)}</strong> — ${escapeHtml(t.description)}</p>`).join('')}</div>`
      : '';
    return `<div style="background: #faf5ff; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #7c3aed;">
        <h3 style="color: #7c3aed; margin: 0 0 10px 0; font-size: 14px;">Package Info</h3>
        <p style="color: #4b5563; margin: 4px 0; font-size: 13px;">• One adult per child included</p>
        <p style="color: #4b5563; margin: 4px 0; font-size: 13px;">• Each additional kid is $${extraChildPrice.toFixed(0)}</p>
        <p style="color: #4b5563; margin: 4px 0; font-size: 13px;">• Each additional guest is $${extraAdultPrice.toFixed(0)}</p>
        ${featuresHtml}
        ${termsHtml}
      </div>`;
  })() : '';

  // Special requests section
  const notesHtml = data.notes
    ? `<div style="background: #fffbeb; padding: 15px 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <h3 style="color: #92400e; margin: 0 0 8px 0; font-size: 14px;">Special Requests / Notes</h3>
        <p style="color: #92400e; font-size: 14px; margin: 0;">${escapeHtml(data.notes)}</p>
      </div>`
    : '';

  // Generate calendar event data
  const durationMinutes = data.durationMinutes || 120; // Default 2 hours
  // Use rawEventDate (YYYY-MM-DD) for calendar links; fall back to extracting from eventDate
  const calendarDate = data.rawEventDate ?? extractISODate(data.eventDate);
  const calendarEvent: CalendarEventData = {
    title: `Playfunia Party - ${data.packageName}`,
    description: `Party booking at Playfunia!\\n\\nReference: ${data.reference}\\nPackage: ${data.packageName}\\nGuests: ${data.guestCount}\\nBalance Due: $${data.balanceRemaining.toFixed(2)}\\n\\nWe can't wait to celebrate with you!`,
    location: `Playfunia - ${data.location}`,
    startDate: calendarDate,
    startTime: data.startTime,
    durationMinutes,
    reference: data.reference,
  };

  // Generate calendar links
  const googleCalendarUrl = generateGoogleCalendarLink(calendarEvent);
  const outlookCalendarUrl = generateOutlookCalendarLink(calendarEvent);
  const icsContent = generateICSContent(calendarEvent);

  // Calendar buttons HTML
  const calendarButtonsHtml = `
        <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; margin: 20px 0; text-align: center;">
          <p style="color: #0369a1; font-weight: 600; margin: 0 0 15px 0; font-size: 14px;">Add to Your Calendar</p>
          <div style="display: inline-block;">
            <a href="${googleCalendarUrl}" target="_blank" style="display: inline-block; padding: 10px 20px; margin: 5px; background: #4285f4; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">Google Calendar</a>
            <a href="${outlookCalendarUrl}" target="_blank" style="display: inline-block; padding: 10px 20px; margin: 5px; background: #0078d4; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">Outlook</a>
          </div>
          <p style="color: #64748b; font-size: 12px; margin: 15px 0 0 0;">Or download the attached .ics file for Apple Calendar and others</p>
        </div>`;

  const receiptInfoHtml = data.receiptNumber
    ? `<div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #22c55e;">
        <p style="color: #166534; font-size: 13px; margin: 0; font-weight: 600;">📎 Receipt & Package Details Attached</p>
        <p style="color: #166534; font-size: 12px; margin: 8px 0 0 0;">Please refer to the attached PDF (Receipt #${data.receiptNumber}) for complete package information including what's included in your party package.</p>
      </div>`
    : '';

  const attachments: EmailAttachment[] = [
    {
      filename: `playfunia-party-${data.reference}.ics`,
      content: icsContent,
      contentType: 'text/calendar',
    },
  ];

  if (data.receiptPdf && data.receiptNumber) {
    attachments.push({
      filename: `playfunia-booking-receipt-${data.receiptNumber}.pdf`,
      content: data.receiptPdf,
      contentType: 'application/pdf',
    });
  }

  return sendEmail({
    to: data.email,
    bcc: ADMIN_EMAILS,
    subject: `🎉 ${data.packageName} Party Confirmed - ${data.reference}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: white; margin: 0;">Party Booking Confirmed!</h2>
        </div>
        <p style="color: #4b5563; font-size: 16px;">Hi ${escapeHtml(data.guestName)},</p>
        <p style="color: #4b5563; font-size: 16px;">Your party booking has been confirmed. Here are the details:</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563;">Reference</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b; font-weight: bold;">${escapeHtml(data.reference)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Package</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.packageName)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Date</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.eventDate)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Time</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.startTime)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Location</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.location)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Guests</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.guestCount}</td></tr>
            ${phoneHtml}
            ${addOnsHtml}
          </table>
        </div>

        ${packageInfoHtml}
        ${childrenHtml}
        ${notesHtml}

        ${calendarButtonsHtml}

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #1e1b4b; margin: 0 0 15px 0; font-size: 14px;">Payment Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${data.packageBasePrice !== undefined ? `<tr><td style="padding: 6px 0; color: #4b5563;">${escapeHtml(data.packageName)}</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${data.packageBasePrice.toFixed(2)}</td></tr>` : ''}
            ${data.extraChildren && data.extraChildren.count > 0 ? `<tr><td style="padding: 6px 0; color: #4b5563;">Extra Children (${data.extraChildren.count} × $${data.extraChildren.unitPrice.toFixed(2)})</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${data.extraChildren.total.toFixed(2)}</td></tr>` : ''}
            ${data.extraAdults && data.extraAdults.count > 0 ? `<tr><td style="padding: 6px 0; color: #4b5563;">Extra Adults (${data.extraAdults.count} × $${data.extraAdults.unitPrice.toFixed(2)})</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${data.extraAdults.total.toFixed(2)}</td></tr>` : ''}
            ${data.addOns?.map(a => `<tr><td style="padding: 6px 0; color: #4b5563;">${escapeHtml(a.name)}${a.quantity > 1 ? ` (${a.quantity} × $${a.price.toFixed(2)})` : ''}</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${(a.price * a.quantity).toFixed(2)}</td></tr>`).join('') ?? ''}
            <tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Subtotal</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b; font-weight: 600;">$${(data.subtotal ?? 0).toFixed(2)}</td></tr>
            ${data.cleaningFee !== undefined && data.cleaningFee > 0 ? `<tr><td style="padding: 6px 0; color: #4b5563;">Cleaning Fee</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${data.cleaningFee.toFixed(2)}</td></tr>` : ''}
            ${data.taxAmount !== undefined && data.taxAmount > 0 ? `<tr><td style="padding: 6px 0; color: #4b5563;">Tax${data.taxRate ? ` (${data.taxRate}%)` : ''}</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${data.taxAmount.toFixed(2)}</td></tr>` : ''}
          </table>
        </div>
        <div style="background: #d1fae5; padding: 15px 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #166534; font-weight: bold; font-size: 16px;">Total Paid</td><td style="padding: 8px 0; text-align: right; color: #166534; font-weight: bold; font-size: 18px;">$${data.totalAmount.toFixed(2)}</td></tr>
          </table>
          <p style="color: #166534; font-size: 13px; margin: 10px 0 0 0; text-align: center;">Payment complete - no balance due</p>
        </div>

        ${receiptInfoHtml}
        <p style="color: #6b7280; font-size: 14px;">We can't wait to celebrate with you! If you have any questions, please contact us.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    attachments,
    text: `Party Booking Confirmed!\n\nHi ${data.guestName},\n\nReference: ${data.reference}\nPackage: ${data.packageName}\nDate: ${data.eventDate} at ${data.startTime}\nLocation: ${data.location}\nGuests: ${data.guestCount}${data.phone ? `\nPhone: ${data.phone}` : ''}${pkgDetails ? `\n\nPackage Info:\n- One adult per child included\n- Each additional kid is $${(pkgDetails.extraChildPrice ?? 40).toFixed(0)}\n- Each additional guest is $${(pkgDetails.extraAdultPrice ?? 10).toFixed(0)}${(pkgDetails.features ?? []).length > 0 ? `\n${(pkgDetails.features ?? []).map(f => `- ${f.split('|')[0]}`).join('\n')}` : ''}${(pkgDetails.additionalTerms ?? []).length > 0 ? `\n\nAdditional Terms:\n${(pkgDetails.additionalTerms ?? []).map((t, i) => `${i + 1}. ${t.title} — ${t.description}`).join('\n')}` : ''}` : ''}${data.children?.length ? `\n\nBirthday Celebrant${data.children.length > 1 ? 's' : ''}:\n${data.children.map(c => `  - ${c.name}${c.birthDate ? ` (DOB: ${c.birthDate})` : ''}`).join('\n')}` : ''}${data.notes ? `\n\nSpecial Requests: ${data.notes}` : ''}\n\n${data.subtotal !== undefined ? `Subtotal: $${data.subtotal.toFixed(2)}\n` : ''}${data.cleaningFee !== undefined ? `Cleaning Fee: $${data.cleaningFee.toFixed(2)}\n` : ''}${data.taxAmount !== undefined ? `Tax${data.taxRate ? ` (${data.taxRate}%)` : ''}: $${data.taxAmount.toFixed(2)}\n` : ''}Total Paid: $${data.totalAmount.toFixed(2)}\nPayment complete - no balance due${data.receiptNumber ? `\n\nReceipt #${data.receiptNumber} is attached.` : ''}\n\nWe can't wait to celebrate with you!`,
  });
}

// Booking reminder email data interface
export interface BookingReminderEmailData {
  email: string;
  guestName: string;
  reference: string;
  packageName: string;
  eventDate: string;       // Formatted display date (e.g. "Saturday, February 14, 2026")
  startTime: string;
  location: string;
  guestCount: number;
  balanceRemaining: number;
  daysUntil: number;        // 0 = day of, 1 = tomorrow, 2, 7
  reminderType: 'day_of' | 'one_day' | 'two_days' | 'seven_days';
}

// Send booking reminder email for upcoming parties
export async function sendBookingReminder(data: BookingReminderEmailData): Promise<boolean> {
  // Dynamic countdown message
  let countdownText: string;
  let subjectTiming: string;
  switch (data.daysUntil) {
    case 0:
      countdownText = "Your Party is TODAY!";
      subjectTiming = "Today";
      break;
    case 1:
      countdownText = "Your Party is Tomorrow!";
      subjectTiming = "Tomorrow";
      break;
    default:
      countdownText = `Your Party is in ${data.daysUntil} Days!`;
      subjectTiming = `in ${data.daysUntil} Days`;
      break;
  }

  // Balance notice (amber card, only if balance > 0)
  const balanceHtml = data.balanceRemaining > 0
    ? `<div style="background: #fffbeb; border: 1px solid #f59e0b; padding: 15px 20px; border-radius: 12px; margin: 20px 0;">
        <p style="color: #92400e; font-weight: 600; margin: 0 0 5px 0;">Balance Remaining</p>
        <p style="color: #92400e; font-size: 22px; font-weight: bold; margin: 0;">$${data.balanceRemaining.toFixed(2)}</p>
        <p style="color: #92400e; font-size: 13px; margin: 8px 0 0 0;">Please arrange payment before or on the day of your party.</p>
      </div>`
    : '';

  return sendEmail({
    to: data.email,
    bcc: ADMIN_EMAILS,
    subject: `Reminder: Your Playfunia Party is ${subjectTiming}! - ${data.reference}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: white; margin: 0;">${countdownText}</h2>
        </div>
        <p style="color: #4b5563; font-size: 16px;">Hi ${escapeHtml(data.guestName)},</p>
        <p style="color: #4b5563; font-size: 16px;">Just a friendly reminder about your upcoming party at Playfunia!</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563;">Reference</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b; font-weight: bold;">${escapeHtml(data.reference)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Package</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.packageName)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Date</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.eventDate)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Time</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.startTime)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Location</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.location)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Guests</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.guestCount}</td></tr>
          </table>
        </div>

        ${balanceHtml}

        <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #1e1b4b; margin: 0 0 15px 0; font-size: 16px;">What to Expect</h3>
          <ul style="margin: 0; padding-left: 20px; color: #4b5563; line-height: 1.8;">
            <li>Please arrive <strong>15 minutes early</strong> for setup</li>
            <li>All guests must have a signed <strong>waiver</strong> (can be completed online or on-site)</li>
            <li><strong>Grip socks</strong> are required for all play areas</li>
            <li>Your package includes everything listed at time of booking</li>
          </ul>
        </div>

        <p style="color: #6b7280; font-size: 14px;">We can't wait to celebrate with you! If you have any questions, please contact us.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Party Reminder: ${countdownText}\n\nHi ${data.guestName},\n\nJust a friendly reminder about your upcoming party at Playfunia!\n\nReference: ${data.reference}\nPackage: ${data.packageName}\nDate: ${data.eventDate}\nTime: ${data.startTime}\nLocation: ${data.location}\nGuests: ${data.guestCount}\n${data.balanceRemaining > 0 ? `\nBalance Remaining: $${data.balanceRemaining.toFixed(2)}\nPlease arrange payment before or on the day of your party.\n` : ''}\nWhat to Expect:\n- Please arrive 15 minutes early for setup\n- All guests must have a signed waiver\n- Grip socks are required for all play areas\n- Your package includes everything listed at time of booking\n\nWe can't wait to celebrate with you!`,
  });
}

// Ticket purchase confirmation data interface
export interface TicketEmailData {
  email: string;
  customerName: string;
  tickets: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
    codes: string[];
  }>;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  discounts?: Array<{ label: string; amount: number }>;
  purchaseDate: string;
}

// Send ticket confirmation email
export async function sendTicketConfirmation(data: TicketEmailData): Promise<boolean> {
  const ticketsHtml = data.tickets
    .map(t => `
      <tr>
        <td style="padding: 8px 0; color: #4b5563;">${t.label}</td>
        <td style="padding: 8px 0; text-align: center; color: #1e1b4b;">${t.quantity}</td>
        <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${(t.unitPrice * t.quantity).toFixed(2)}</td>
      </tr>
      ${t.codes.map(code => `<tr><td colspan="3" style="padding: 4px 0 4px 20px; color: #7c3aed; font-family: monospace;">Code: ${code}</td></tr>`).join('')}
    `)
    .join('');

  return sendEmail({
    to: data.email,
    bcc: ADMIN_EMAILS,
    subject: 'Your Playfunia Tickets',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: white; margin: 0;">Your Tickets Are Ready!</h2>
        </div>
        <p style="color: #4b5563; font-size: 16px;">Hi ${escapeHtml(data.customerName)},</p>
        <p style="color: #4b5563; font-size: 16px;">Thank you for your purchase! Here are your tickets:</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <th style="padding: 8px 0; text-align: left; color: #6b7280;">Ticket</th>
              <th style="padding: 8px 0; text-align: center; color: #6b7280;">Qty</th>
              <th style="padding: 8px 0; text-align: right; color: #6b7280;">Price</th>
            </tr>
            ${ticketsHtml}
            <tr>
              <td colspan="2" style="padding: 8px 0; color: #4b5563;">Subtotal</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding: 8px 0; color: #4b5563;">Tax</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.taxAmount.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #7c3aed;">
              <td colspan="2" style="padding: 12px 0; color: #1e1b4b; font-weight: bold;">Total</td>
              <td style="padding: 12px 0; text-align: right; color: #7c3aed; font-weight: bold; font-size: 18px;">$${data.totalAmount.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <p style="color: #6b7280; font-size: 14px;">Show your ticket codes at the entrance. See you soon!</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Your Playfunia Tickets\n\nHi ${data.customerName},\n\nThank you for your purchase!\n\n${data.tickets.map(t => `${t.label} x${t.quantity}: $${(t.unitPrice * t.quantity).toFixed(2)}\nCodes: ${t.codes.join(', ')}`).join('\n\n')}\n\nSubtotal: $${data.subtotal.toFixed(2)}\nTax: $${data.taxAmount.toFixed(2)}\nTotal: $${data.totalAmount.toFixed(2)}\n\nShow your ticket codes at the entrance. See you soon!`,
  });
}

// Membership confirmation data interface
export interface MembershipEmailData {
  email: string;
  customerName: string;
  parentFullName?: string;
  tierName: string;
  displayId?: string;
  startDate: string;
  expiryDate: string;
  visitsPerMonth: number | null;
  guestPassesPerMonth: number | null;
  discountPercent: number | null;
  benefits: string[] | null;
  autoRenew: boolean;
  monthlyPrice: number;
  durationMonths?: number;
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number; // Tax rate as percentage (e.g., 8 for 8%)
  total?: number;
  receiptPdf?: Buffer;
  receiptNumber?: string;
  childName?: string;
  childBirthDate?: string;
  maxChildren?: number;
  maxAdults?: number;
  loginPassword?: string;
}

// Send membership confirmation email
export async function sendMembershipConfirmation(data: MembershipEmailData): Promise<boolean> {
  const benefitsHtml = data.benefits?.length
    ? `<div style="margin-top: 20px;">
        <h3 style="color: #1e1b4b; font-size: 16px; margin: 0 0 12px 0;">Your Membership Benefits:</h3>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
          ${data.benefits.map(b => `<li style="padding: 4px 0;">${b}</li>`).join('')}
        </ul>
      </div>`
    : '';

  const benefitsText = data.benefits?.length
    ? `\n\nYour Membership Benefits:\n${data.benefits.map(b => `- ${b}`).join('\n')}`
    : '';

  const receiptInfoHtml = data.receiptNumber
    ? `<p style="color: #6b7280; font-size: 13px; margin-top: 15px;">Receipt #${data.receiptNumber} is attached to this email.</p>`
    : '';

  const attachments: EmailAttachment[] = [];
  if (data.receiptPdf && data.receiptNumber) {
    attachments.push({
      filename: `playfunia-membership-receipt-${data.receiptNumber}.pdf`,
      content: data.receiptPdf,
      contentType: 'application/pdf',
    });
  }

  return sendEmail({
    to: data.email,
    bcc: ADMIN_EMAILS,
    subject: `Welcome to Playfunia ${data.tierName} Membership!`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: white; margin: 0;">Welcome to ${data.tierName}!</h2>
        </div>
        <p style="color: #4b5563; font-size: 16px;">Hi ${escapeHtml(data.customerName)},</p>
        <p style="color: #4b5563; font-size: 16px;">Welcome to the Playfunia family! Your membership is now active.</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            ${data.displayId ? `<tr><td style="padding: 8px 0; color: #4b5563;">Membership ID</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b; font-weight: bold;">${data.displayId}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #4b5563;">Plan</td><td style="padding: 8px 0; text-align: right; color: #7c3aed; font-weight: bold;">${data.tierName}</td></tr>
            ${data.parentFullName ? `<tr><td style="padding: 8px 0; color: #4b5563;">Account Holder</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.parentFullName)}</td></tr>` : ''}
            ${data.childName ? `<tr><td style="padding: 8px 0; color: #4b5563;">Child Name</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${escapeHtml(data.childName)}</td></tr>` : ''}
            ${data.childBirthDate ? `<tr><td style="padding: 8px 0; color: #4b5563;">Child Date of Birth</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.childBirthDate}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #4b5563;">Start Date</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.startDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Expires</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.expiryDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Duration</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.durationMonths ?? 1} month${(data.durationMonths ?? 1) > 1 ? 's' : ''} (30 days)</td></tr>
            ${data.maxChildren ? `<tr><td style="padding: 8px 0; color: #4b5563;">Included</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.maxChildren} Kid${data.maxChildren > 1 ? 's' : ''} + ${data.maxAdults ?? data.maxChildren} Adult${(data.maxAdults ?? data.maxChildren) > 1 ? 's' : ''}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #4b5563;">Visits Per Month</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b; font-weight: bold;">${data.visitsPerMonth ?? 'Unlimited'}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Monthly Price</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.monthlyPrice.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Auto-Renew</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.autoRenew ? 'Yes' : 'No'}</td></tr>
          </table>
        </div>

        ${data.subtotal !== undefined && data.taxAmount !== undefined && data.total !== undefined ? `
        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #1e1b4b; font-size: 16px; margin: 0 0 12px 0;">Payment Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #4b5563;">Subtotal${data.durationMonths ? ` (${data.durationMonths} month${data.durationMonths > 1 ? 's' : ''})` : ''}</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${data.subtotal.toFixed(2)}</td></tr>
            <tr><td style="padding: 6px 0; color: #4b5563;">Tax${data.taxRate ? ` (${data.taxRate}%)` : ''}</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${data.taxAmount.toFixed(2)}</td></tr>
            <tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 10px 0; color: #1e1b4b; font-weight: bold;">Total Paid</td><td style="padding: 10px 0; text-align: right; color: #7c3aed; font-weight: bold; font-size: 18px;">$${data.total.toFixed(2)}</td></tr>
          </table>
        </div>
        ` : ''}

        ${benefitsHtml}

        ${data.loginPassword ? `
        <div style="background: #eff6ff; border: 1px solid #3b82f6; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #1e40af; font-size: 16px; margin: 0 0 12px 0;">Your Login Credentials</h3>
          <p style="color: #4b5563; margin: 0 0 8px 0;">You can log in to your Playfunia account to manage your membership, check in, and more.</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #4b5563; font-weight: bold;">Email:</td><td style="padding: 6px 0; color: #1e1b4b;">${data.email}</td></tr>
            <tr><td style="padding: 6px 0; color: #4b5563; font-weight: bold;">Password:</td><td style="padding: 6px 0; color: #1e1b4b;">${escapeHtml(data.loginPassword)}</td></tr>
          </table>
          <p style="color: #6b7280; font-size: 12px; margin: 10px 0 0 0;">We recommend changing your password after your first login.</p>
        </div>
        ` : ''}

        ${receiptInfoHtml}
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Enjoy unlimited fun with your membership! See you at Playfunia!</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Welcome to Playfunia ${data.tierName}!\n\nHi ${data.customerName},\n\nYour membership is now active.\n\nMembership Tier: ${data.tierName}\nStart Date: ${data.startDate}\nExpires: ${data.expiryDate}\nAllowed Visits Per Month: ${data.visitsPerMonth ?? 'Unlimited'}\nGuest Passes Per Month: ${data.guestPassesPerMonth ?? '0'}${data.discountPercent ? `\nDiscount on Extras: ${data.discountPercent}% off` : ''}\nMonthly Price: $${data.monthlyPrice.toFixed(2)}\nAuto-Renew: ${data.autoRenew ? 'Yes' : 'No'}${data.subtotal !== undefined && data.taxAmount !== undefined && data.total !== undefined ? `\n\nPayment Summary:\nSubtotal${data.durationMonths ? ` (${data.durationMonths} month${data.durationMonths > 1 ? 's' : ''})` : ''}: $${data.subtotal.toFixed(2)}\nTax${data.taxRate ? ` (${data.taxRate}%)` : ''}: $${data.taxAmount.toFixed(2)}\nTotal Paid: $${data.total.toFixed(2)}` : ''}${benefitsText}${data.loginPassword ? `\n\nYour Login Credentials:\nEmail: ${data.email}\nPassword: ${data.loginPassword}\nPlease change your password after first login.` : ''}${data.receiptNumber ? `\n\nReceipt #${data.receiptNumber} is attached.` : ''}\n\nSee you at Playfunia!`,
    attachments: attachments.length > 0 ? attachments : undefined,
  });
}

// Queued membership confirmation data interface
export interface QueuedMembershipEmailData {
  email: string;
  customerName: string;
  tierName: string;
  queuedStartDate: string;
  queuedExpiryDate: string;
  currentExpiryDate: string;
  visitsPerMonth: number | null;
  guestPassesPerMonth: number | null;
  discountPercent: number | null;
  benefits: string[] | null;
  monthlyPrice: number;
  durationMonths?: number;
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number; // Tax rate as percentage (e.g., 8 for 8%)
  total?: number;
  receiptPdf?: Buffer;
  receiptNumber?: string;
}

// Send queued membership confirmation email (when user already has active membership of same tier)
export async function sendQueuedMembershipConfirmation(data: QueuedMembershipEmailData): Promise<boolean> {
  const benefitsHtml = data.benefits?.length
    ? `<div style="margin-top: 20px;">
        <h3 style="color: #1e1b4b; font-size: 16px; margin: 0 0 12px 0;">Your Membership Benefits:</h3>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
          ${data.benefits.map(b => `<li style="padding: 4px 0;">${b}</li>`).join('')}
        </ul>
      </div>`
    : '';

  const benefitsText = data.benefits?.length
    ? `\n\nYour Membership Benefits:\n${data.benefits.map(b => `- ${b}`).join('\n')}`
    : '';

  const receiptInfoHtml = data.receiptNumber
    ? `<p style="color: #6b7280; font-size: 13px; margin-top: 15px;">Receipt #${data.receiptNumber} is attached to this email.</p>`
    : '';

  const attachments: EmailAttachment[] = [];
  if (data.receiptPdf && data.receiptNumber) {
    attachments.push({
      filename: `playfunia-membership-receipt-${data.receiptNumber}.pdf`,
      content: data.receiptPdf,
      contentType: 'application/pdf',
    });
  }

  return sendEmail({
    to: data.email,
    bcc: ADMIN_EMAILS,
    subject: `Your Playfunia ${data.tierName} Membership Has Been Queued`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: linear-gradient(135deg, #f59e0b, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: white; margin: 0;">Membership Queued</h2>
        </div>
        <p style="color: #4b5563; font-size: 16px;">Hi ${escapeHtml(data.customerName)},</p>
        <p style="color: #4b5563; font-size: 16px;">Thank you for your purchase! You already have an active <strong>${data.tierName}</strong> membership.</p>

        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="color: #92400e; margin: 0; font-size: 14px;">
            <strong>Your new membership has been queued</strong> and will automatically activate when your current membership expires on <strong>${data.currentExpiryDate}</strong>.
          </p>
        </div>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #1e1b4b; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 0.5px;">Queued Membership Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563;">Membership Tier</td><td style="padding: 8px 0; text-align: right; color: #7c3aed; font-weight: bold;">${data.tierName}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Will Start On</td><td style="padding: 8px 0; text-align: right; color: #059669; font-weight: bold;">${data.queuedStartDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Will Expire On</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.queuedExpiryDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Visits Per Month</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b; font-weight: bold;">${data.visitsPerMonth ?? 'Unlimited'}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Guest Passes Per Month</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.guestPassesPerMonth ?? '0'}</td></tr>
            ${data.discountPercent ? `<tr><td style="padding: 8px 0; color: #4b5563;">Discount on Extras</td><td style="padding: 8px 0; text-align: right; color: #22c55e; font-weight: bold;">${data.discountPercent}% off</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #4b5563;">Monthly Price</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.monthlyPrice.toFixed(2)}</td></tr>
          </table>
        </div>

        ${data.subtotal !== undefined && data.taxAmount !== undefined && data.total !== undefined ? `
        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #1e1b4b; font-size: 16px; margin: 0 0 12px 0;">Payment Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #4b5563;">Subtotal${data.durationMonths ? ` (${data.durationMonths} month${data.durationMonths > 1 ? 's' : ''})` : ''}</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${data.subtotal.toFixed(2)}</td></tr>
            <tr><td style="padding: 6px 0; color: #4b5563;">Tax${data.taxRate ? ` (${data.taxRate}%)` : ''}</td><td style="padding: 6px 0; text-align: right; color: #1e1b4b;">$${data.taxAmount.toFixed(2)}</td></tr>
            <tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 10px 0; color: #1e1b4b; font-weight: bold;">Total Paid</td><td style="padding: 10px 0; text-align: right; color: #7c3aed; font-weight: bold; font-size: 18px;">$${data.total.toFixed(2)}</td></tr>
          </table>
        </div>
        ` : ''}

        ${benefitsHtml}

        ${receiptInfoHtml}
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Continue enjoying your current membership - we'll send you a reminder when your queued membership activates!</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Playfunia ${data.tierName} Membership Queued\n\nHi ${data.customerName},\n\nThank you for your purchase! You already have an active ${data.tierName} membership.\n\nYour new membership has been queued and will automatically activate when your current membership expires on ${data.currentExpiryDate}.\n\nQueued Membership Details:\nMembership Tier: ${data.tierName}\nWill Start On: ${data.queuedStartDate}\nWill Expire On: ${data.queuedExpiryDate}\nVisits Per Month: ${data.visitsPerMonth ?? 'Unlimited'}\nGuest Passes Per Month: ${data.guestPassesPerMonth ?? '0'}${data.discountPercent ? `\nDiscount on Extras: ${data.discountPercent}% off` : ''}\nMonthly Price: $${data.monthlyPrice.toFixed(2)}${data.subtotal !== undefined && data.taxAmount !== undefined && data.total !== undefined ? `\n\nPayment Summary:\nSubtotal${data.durationMonths ? ` (${data.durationMonths} month${data.durationMonths > 1 ? 's' : ''})` : ''}: $${data.subtotal.toFixed(2)}\nTax${data.taxRate ? ` (${data.taxRate}%)` : ''}: $${data.taxAmount.toFixed(2)}\nTotal Paid: $${data.total.toFixed(2)}` : ''}${benefitsText}${data.receiptNumber ? `\n\nReceipt #${data.receiptNumber} is attached.` : ''}\n\nContinue enjoying your current membership - we'll send you a reminder when your queued membership activates!\n\nSee you at Playfunia!`,
    attachments: attachments.length > 0 ? attachments : undefined,
  });
}

// Contact form inquiry data interface
export interface ContactInquiryEmailData {
  name: string;
  email: string;
  preferredDate?: string;
  message?: string;
}

// Send contact form inquiry to admin
export async function sendContactInquiry(data: ContactInquiryEmailData): Promise<boolean> {
  const safeName = escapeHtml(data.name);
  const safeEmail = escapeHtml(data.email);
  const preferredDateHtml = data.preferredDate
    ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Preferred Visit Date</td><td style="padding: 8px 0; color: #1e1b4b;">${escapeHtml(data.preferredDate)}</td></tr>`
    : '';

  const messageHtml = data.message
    ? `<tr><td colspan="2" style="padding: 8px 0; color: #4b5563; font-weight: 600;">Message</td></tr>
       <tr><td colspan="2" style="padding: 8px 16px; color: #1e1b4b; background: #f9fafb; border-radius: 8px;">${escapeHtml(data.message).replace(/\n/g, '<br>')}</td></tr>`
    : '';

  return sendEmail({
    to: CONTACT_INBOX_EMAILS,
    replyTo: `"${data.name}" <${data.email}>`,
    subject: `New Contact Inquiry from ${safeName}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: white; margin: 0;">New Contact Inquiry</h2>
        </div>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Name</td><td style="padding: 8px 0; color: #1e1b4b;">${safeName}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Email</td><td style="padding: 8px 0; color: #1e1b4b;"><a href="mailto:${safeEmail}" style="color: #7c3aed;">${safeEmail}</a></td></tr>
            ${preferredDateHtml}
            ${messageHtml}
          </table>
        </div>

        <p style="color: #6b7280; font-size: 14px;">Please respond to this inquiry within one business day. Hitting <strong>Reply</strong> will send your response directly to the customer.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">This message was sent from the Playfunia website contact form.</p>
      </div>
    `,
    text: `New Contact Inquiry\n\nName: ${data.name}\nEmail: ${data.email}${data.preferredDate ? `\nPreferred Date: ${data.preferredDate}` : ''}${data.message ? `\n\nMessage:\n${data.message}` : ''}\n\nPlease respond within one business day. Hitting Reply will send your response directly to the customer.`,
  });
}

// Order confirmation data interface
export interface OrderConfirmationEmailData {
  email: string;
  customerName: string;
  orderNumber: string;
  orderDate: string;
  items: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
    total: number;
    codes?: string[];
  }>;
  subtotal: number;
  taxAmount: number;
  discounts: Array<{ label: string; amount: number }>;
  total: number;
  paymentMethod: string;
  receiptPdf?: Buffer;
  // Additional fields for admin notification
  customerPhone?: string;
  customerId?: string;
  paymentId?: string;
}

// Send order confirmation email
export async function sendOrderConfirmation(data: OrderConfirmationEmailData): Promise<boolean> {
  const itemsHtml = data.items
    .map(item => `
      <tr>
        <td style="padding: 8px 0; color: #4b5563;">${item.label}</td>
        <td style="padding: 8px 0; text-align: center; color: #1e1b4b;">${item.quantity}</td>
        <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${item.total.toFixed(2)}</td>
      </tr>
      ${item.codes?.map(code => `<tr><td colspan="3" style="padding: 4px 0 4px 20px; color: #7c3aed; font-family: monospace;">Code: ${code}</td></tr>`).join('') || ''}
    `)
    .join('');

  const discountsHtml = data.discounts
    .map(d => `<tr><td colspan="2" style="padding: 4px 0; color: #059669;">${d.label}</td><td style="padding: 4px 0; text-align: right; color: #059669;">-$${d.amount.toFixed(2)}</td></tr>`)
    .join('');

  // Receipt attachment info HTML - only show if receipt is attached
  const receiptInfoHtml = data.receiptPdf
    ? `<div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #22c55e;">
        <p style="color: #166534; font-size: 13px; margin: 0; font-weight: 600;">📎 Official Receipt Attached</p>
        <p style="color: #166534; font-size: 12px; margin: 8px 0 0 0;">Please refer to the attached PDF receipt (${data.orderNumber}) for your records. This receipt contains a verification code that can be used to confirm authenticity.</p>
      </div>`
    : '';

  // Build attachments array
  const attachments: EmailAttachment[] = [];
  if (data.receiptPdf) {
    attachments.push({
      filename: `playfunia-receipt-${data.orderNumber}.pdf`,
      content: data.receiptPdf,
      contentType: 'application/pdf',
    });
  }

  return sendEmail({
    to: data.email,
    bcc: ADMIN_EMAILS,
    subject: `Order Confirmation - ${data.orderNumber}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: white; margin: 0;">Order Confirmed!</h2>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Order #${data.orderNumber}</p>
        </div>
        <p style="color: #4b5563; font-size: 16px;">Hi ${escapeHtml(data.customerName)},</p>
        <p style="color: #4b5563; font-size: 16px;">Thank you for your order! Here's your receipt:</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <th style="padding: 8px 0; text-align: left; color: #6b7280;">Item</th>
              <th style="padding: 8px 0; text-align: center; color: #6b7280;">Qty</th>
              <th style="padding: 8px 0; text-align: right; color: #6b7280;">Price</th>
            </tr>
            ${itemsHtml}
            ${discountsHtml}
            <tr>
              <td colspan="2" style="padding: 8px 0; color: #4b5563;">Subtotal</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding: 8px 0; color: #4b5563;">Tax</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.taxAmount.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #7c3aed;">
              <td colspan="2" style="padding: 12px 0; color: #1e1b4b; font-weight: bold;">Total</td>
              <td style="padding: 12px 0; text-align: right; color: #7c3aed; font-weight: bold; font-size: 18px;">$${data.total.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        ${receiptInfoHtml}
        <p style="color: #6b7280; font-size: 14px;">Payment: ${data.paymentMethod}</p>
        <p style="color: #6b7280; font-size: 14px;">Date: ${data.orderDate}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Order Confirmed!\n\nOrder #${data.orderNumber}\n\nHi ${data.customerName},\n\nThank you for your order!\n\n${data.items.map(i => `${i.label} x${i.quantity}: $${i.total.toFixed(2)}${i.codes ? `\nCodes: ${i.codes.join(', ')}` : ''}`).join('\n')}\n\nSubtotal: $${data.subtotal.toFixed(2)}\nTax: $${data.taxAmount.toFixed(2)}\nTotal: $${data.total.toFixed(2)}\nPayment: ${data.paymentMethod}\nDate: ${data.orderDate}${data.receiptPdf ? `\n\nOfficial receipt (${data.orderNumber}) is attached.` : ''}`,
    attachments: attachments.length > 0 ? attachments : undefined,
  });
}

// ============= Admin Notification Emails =============
// These are sent to admins with internal/operational details

// Admin notification for booking confirmation
export interface AdminBookingNotificationData {
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerId?: string;
  eventDate: string;
  startTime: string;
  location: string;
  packageName: string;
  guestCount: number;
  totalAmount: number;
  paymentId?: string;
  paymentMethod?: string;
  addOns?: Array<{ name: string; quantity: number; price: number }>;
  notes?: string;
  childrenNames?: string[];
  isGuestBooking: boolean;
}

// Send admin notification for new booking
export async function sendAdminBookingNotification(data: AdminBookingNotificationData): Promise<boolean> {
  const addOnsHtml = data.addOns?.length
    ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Add-ons</td><td style="padding: 8px 0; color: #1e1b4b;">${data.addOns.map(a => `${a.name} x${a.quantity} ($${a.price})`).join(', ')}</td></tr>`
    : '';

  const childrenHtml = data.childrenNames?.length
    ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Children</td><td style="padding: 8px 0; color: #1e1b4b;">${data.childrenNames.join(', ')}</td></tr>`
    : '';

  const notesHtml = data.notes
    ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Special Requests</td><td style="padding: 8px 0; color: #1e1b4b;">${data.notes}</td></tr>`
    : '';

  return sendEmail({
    to: ADMIN_EMAILS,
    subject: `🎉 NEW BOOKING: ${data.packageName} - ${data.eventDate} - ${data.reference}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="background: #059669; padding: 15px 20px; border-radius: 12px 12px 0 0;">
          <h2 style="color: white; margin: 0; font-size: 18px;">🎉 New Party Booking Received</h2>
        </div>

        <div style="background: #f0fdf4; padding: 20px; border: 1px solid #bbf7d0; border-top: none;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #166534; font-weight: bold; font-size: 16px;" colspan="2">Reference: ${data.reference}</td></tr>
            <tr><td style="padding: 4px 0; color: #166534;" colspan="2">Amount: $${data.totalAmount.toFixed(2)} (PAID)</td></tr>
          </table>
        </div>

        <div style="background: #fef3c7; padding: 15px 20px; border: 1px solid #fde68a; border-top: none;">
          <h3 style="color: #92400e; margin: 0 0 10px 0; font-size: 14px;">📞 CUSTOMER CONTACT INFO</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #78350f; font-weight: 600; width: 140px;">Name</td><td style="padding: 6px 0; color: #1e1b4b;">${data.customerName} ${data.isGuestBooking ? '<span style="background:#f97316;color:white;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:8px;">GUEST</span>' : ''}</td></tr>
            <tr><td style="padding: 6px 0; color: #78350f; font-weight: 600;">Email</td><td style="padding: 6px 0; color: #1e1b4b;"><a href="mailto:${data.customerEmail}" style="color: #7c3aed;">${data.customerEmail}</a></td></tr>
            <tr><td style="padding: 6px 0; color: #78350f; font-weight: 600;">Phone</td><td style="padding: 6px 0; color: #1e1b4b;">${data.customerPhone ? `<a href="tel:${data.customerPhone}" style="color: #7c3aed;">${data.customerPhone}</a>` : 'Not provided'}</td></tr>
            ${data.customerId ? `<tr><td style="padding: 6px 0; color: #78350f; font-weight: 600;">Customer ID</td><td style="padding: 6px 0; color: #6b7280; font-family: monospace; font-size: 12px;">${data.customerId}</td></tr>` : ''}
          </table>
        </div>

        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
          <h3 style="color: #1e1b4b; margin: 0 0 15px 0; font-size: 14px;">📅 BOOKING DETAILS</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600; width: 140px;">Package</td><td style="padding: 8px 0; color: #1e1b4b; font-weight: bold;">${data.packageName}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Date</td><td style="padding: 8px 0; color: #1e1b4b; font-weight: bold;">${data.eventDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Time</td><td style="padding: 8px 0; color: #1e1b4b; font-weight: bold;">${data.startTime}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Location</td><td style="padding: 8px 0; color: #1e1b4b;">${data.location}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Guests</td><td style="padding: 8px 0; color: #1e1b4b;">${data.guestCount}</td></tr>
            ${childrenHtml}
            ${addOnsHtml}
            ${notesHtml}
          </table>
        </div>

        <div style="background: #eff6ff; padding: 15px 20px; border: 1px solid #bfdbfe; border-top: none; border-radius: 0 0 12px 12px;">
          <h3 style="color: #1e40af; margin: 0 0 10px 0; font-size: 14px;">💳 PAYMENT INFO</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #1e40af; font-weight: 600; width: 140px;">Amount</td><td style="padding: 6px 0; color: #1e1b4b; font-weight: bold;">$${data.totalAmount.toFixed(2)}</td></tr>
            <tr><td style="padding: 6px 0; color: #1e40af; font-weight: 600;">Method</td><td style="padding: 6px 0; color: #1e1b4b;">${data.paymentMethod || 'Square'}</td></tr>
            ${data.paymentId ? `<tr><td style="padding: 6px 0; color: #1e40af; font-weight: 600;">Payment ID</td><td style="padding: 6px 0; color: #6b7280; font-family: monospace; font-size: 12px;">${data.paymentId}</td></tr>` : ''}
          </table>
        </div>

        <div style="margin-top: 20px; padding: 15px; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
          <p style="color: #991b1b; font-size: 13px; margin: 0; font-weight: 600;">⚡ ACTION REQUIRED</p>
          <p style="color: #7f1d1d; font-size: 13px; margin: 8px 0 0 0;">Please confirm party room availability and prepare for this booking. Contact the customer if any clarification is needed.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 11px; text-align: center;">This is an automated admin notification from Playfunia booking system.</p>
      </div>
    `,
    text: `NEW PARTY BOOKING\n\nReference: ${data.reference}\nAmount: $${data.totalAmount.toFixed(2)} (PAID)\n\nCUSTOMER CONTACT:\nName: ${data.customerName}${data.isGuestBooking ? ' (GUEST)' : ''}\nEmail: ${data.customerEmail}\nPhone: ${data.customerPhone || 'Not provided'}\n${data.customerId ? `Customer ID: ${data.customerId}\n` : ''}\nBOOKING DETAILS:\nPackage: ${data.packageName}\nDate: ${data.eventDate}\nTime: ${data.startTime}\nLocation: ${data.location}\nGuests: ${data.guestCount}\n${data.childrenNames?.length ? `Children: ${data.childrenNames.join(', ')}\n` : ''}${data.addOns?.length ? `Add-ons: ${data.addOns.map(a => `${a.name} x${a.quantity}`).join(', ')}\n` : ''}${data.notes ? `Notes: ${data.notes}\n` : ''}\nPAYMENT:\nAmount: $${data.totalAmount.toFixed(2)}\nMethod: ${data.paymentMethod || 'Square'}\n${data.paymentId ? `Payment ID: ${data.paymentId}\n` : ''}`,
  });
}

// Admin notification for ticket purchase
export interface AdminTicketNotificationData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerId?: string;
  tickets: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
    codes: string[];
  }>;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  discounts?: Array<{ label: string; amount: number }>;
  paymentId?: string;
  paymentMethod?: string;
  purchaseDate: string;
  isGuestPurchase: boolean;
}

// Send admin notification for ticket purchase
export async function sendAdminTicketNotification(data: AdminTicketNotificationData): Promise<boolean> {
  const ticketsHtml = data.tickets
    .map(t => `
      <tr>
        <td style="padding: 8px 0; color: #4b5563;">${t.label}</td>
        <td style="padding: 8px 0; text-align: center; color: #1e1b4b;">${t.quantity}</td>
        <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${(t.unitPrice * t.quantity).toFixed(2)}</td>
      </tr>
      <tr><td colspan="3" style="padding: 4px 0 12px 20px; color: #7c3aed; font-family: monospace; font-size: 12px;">Codes: ${t.codes.join(', ')}</td></tr>
    `)
    .join('');

  const discountsHtml = data.discounts?.length
    ? data.discounts.map(d => `<tr><td colspan="2" style="padding: 4px 0; color: #059669;">${d.label}</td><td style="padding: 4px 0; text-align: right; color: #059669;">-$${d.amount.toFixed(2)}</td></tr>`).join('')
    : '';

  return sendEmail({
    to: ADMIN_EMAILS,
    subject: `🎟️ NEW TICKET ORDER: ${data.orderNumber} - $${data.totalAmount.toFixed(2)}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="background: #7c3aed; padding: 15px 20px; border-radius: 12px 12px 0 0;">
          <h2 style="color: white; margin: 0; font-size: 18px;">🎟️ New Ticket Purchase</h2>
        </div>

        <div style="background: #f5f3ff; padding: 20px; border: 1px solid #ddd6fe; border-top: none;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #5b21b6; font-weight: bold; font-size: 16px;" colspan="2">Order: ${data.orderNumber}</td></tr>
            <tr><td style="padding: 4px 0; color: #5b21b6;" colspan="2">Total: $${data.totalAmount.toFixed(2)} (PAID)</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;" colspan="2">Date: ${data.purchaseDate}</td></tr>
          </table>
        </div>

        <div style="background: #fef3c7; padding: 15px 20px; border: 1px solid #fde68a; border-top: none;">
          <h3 style="color: #92400e; margin: 0 0 10px 0; font-size: 14px;">📞 CUSTOMER CONTACT INFO</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #78350f; font-weight: 600; width: 140px;">Name</td><td style="padding: 6px 0; color: #1e1b4b;">${data.customerName} ${data.isGuestPurchase ? '<span style="background:#f97316;color:white;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:8px;">GUEST</span>' : ''}</td></tr>
            <tr><td style="padding: 6px 0; color: #78350f; font-weight: 600;">Email</td><td style="padding: 6px 0; color: #1e1b4b;"><a href="mailto:${data.customerEmail}" style="color: #7c3aed;">${data.customerEmail}</a></td></tr>
            <tr><td style="padding: 6px 0; color: #78350f; font-weight: 600;">Phone</td><td style="padding: 6px 0; color: #1e1b4b;">${data.customerPhone ? `<a href="tel:${data.customerPhone}" style="color: #7c3aed;">${data.customerPhone}</a>` : 'Not provided'}</td></tr>
            ${data.customerId ? `<tr><td style="padding: 6px 0; color: #78350f; font-weight: 600;">Customer ID</td><td style="padding: 6px 0; color: #6b7280; font-family: monospace; font-size: 12px;">${data.customerId}</td></tr>` : ''}
          </table>
        </div>

        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
          <h3 style="color: #1e1b4b; margin: 0 0 15px 0; font-size: 14px;">🎟️ TICKETS PURCHASED</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <th style="padding: 8px 0; text-align: left; color: #6b7280;">Ticket</th>
              <th style="padding: 8px 0; text-align: center; color: #6b7280;">Qty</th>
              <th style="padding: 8px 0; text-align: right; color: #6b7280;">Price</th>
            </tr>
            ${ticketsHtml}
            ${discountsHtml}
            <tr style="border-top: 1px solid #e5e7eb;">
              <td colspan="2" style="padding: 8px 0; color: #4b5563;">Subtotal</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding: 8px 0; color: #4b5563;">Tax</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.taxAmount.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #7c3aed;">
              <td colspan="2" style="padding: 12px 0; color: #1e1b4b; font-weight: bold;">Total</td>
              <td style="padding: 12px 0; text-align: right; color: #7c3aed; font-weight: bold; font-size: 18px;">$${data.totalAmount.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <div style="background: #eff6ff; padding: 15px 20px; border: 1px solid #bfdbfe; border-top: none; border-radius: 0 0 12px 12px;">
          <h3 style="color: #1e40af; margin: 0 0 10px 0; font-size: 14px;">💳 PAYMENT INFO</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #1e40af; font-weight: 600; width: 140px;">Method</td><td style="padding: 6px 0; color: #1e1b4b;">${data.paymentMethod || 'Square'}</td></tr>
            ${data.paymentId ? `<tr><td style="padding: 6px 0; color: #1e40af; font-weight: 600;">Payment ID</td><td style="padding: 6px 0; color: #6b7280; font-family: monospace; font-size: 12px;">${data.paymentId}</td></tr>` : ''}
          </table>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 11px; text-align: center;">This is an automated admin notification from Playfunia booking system.</p>
      </div>
    `,
    text: `NEW TICKET ORDER\n\nOrder: ${data.orderNumber}\nTotal: $${data.totalAmount.toFixed(2)} (PAID)\nDate: ${data.purchaseDate}\n\nCUSTOMER CONTACT:\nName: ${data.customerName}${data.isGuestPurchase ? ' (GUEST)' : ''}\nEmail: ${data.customerEmail}\nPhone: ${data.customerPhone || 'Not provided'}\n${data.customerId ? `Customer ID: ${data.customerId}\n` : ''}\nTICKETS:\n${data.tickets.map(t => `${t.label} x${t.quantity}: $${(t.unitPrice * t.quantity).toFixed(2)}\nCodes: ${t.codes.join(', ')}`).join('\n\n')}\n\nSubtotal: $${data.subtotal.toFixed(2)}\nTax: $${data.taxAmount.toFixed(2)}\nTotal: $${data.totalAmount.toFixed(2)}\n\nPayment: ${data.paymentMethod || 'Square'}\n${data.paymentId ? `Payment ID: ${data.paymentId}\n` : ''}`,
  });
}

// Admin notification for membership purchase
export interface AdminMembershipNotificationData {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerId?: string;
  tierName: string;
  startDate: string;
  expiryDate: string;
  visitsPerMonth: number | null;
  monthlyPrice: number;
  totalPaid: number;
  durationMonths: number;
  autoRenew: boolean;
  paymentId?: string;
  paymentMethod?: string;
  isGuestPurchase: boolean;
}

// Send admin notification for membership purchase
export async function sendAdminMembershipNotification(data: AdminMembershipNotificationData): Promise<boolean> {
  return sendEmail({
    to: ADMIN_EMAILS,
    subject: `⭐ NEW MEMBERSHIP: ${data.tierName} - ${data.customerName}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 15px 20px; border-radius: 12px 12px 0 0;">
          <h2 style="color: white; margin: 0; font-size: 18px;">⭐ New Membership Activated</h2>
        </div>

        <div style="background: #faf5ff; padding: 20px; border: 1px solid #e9d5ff; border-top: none;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #7c3aed; font-weight: bold; font-size: 18px;" colspan="2">${data.tierName}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b21a8;" colspan="2">Total Paid: $${data.totalPaid.toFixed(2)}</td></tr>
          </table>
        </div>

        <div style="background: #fef3c7; padding: 15px 20px; border: 1px solid #fde68a; border-top: none;">
          <h3 style="color: #92400e; margin: 0 0 10px 0; font-size: 14px;">📞 CUSTOMER CONTACT INFO</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #78350f; font-weight: 600; width: 140px;">Name</td><td style="padding: 6px 0; color: #1e1b4b;">${data.customerName} ${data.isGuestPurchase ? '<span style="background:#f97316;color:white;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:8px;">GUEST</span>' : ''}</td></tr>
            <tr><td style="padding: 6px 0; color: #78350f; font-weight: 600;">Email</td><td style="padding: 6px 0; color: #1e1b4b;"><a href="mailto:${data.customerEmail}" style="color: #7c3aed;">${data.customerEmail}</a></td></tr>
            <tr><td style="padding: 6px 0; color: #78350f; font-weight: 600;">Phone</td><td style="padding: 6px 0; color: #1e1b4b;">${data.customerPhone ? `<a href="tel:${data.customerPhone}" style="color: #7c3aed;">${data.customerPhone}</a>` : 'Not provided'}</td></tr>
            ${data.customerId ? `<tr><td style="padding: 6px 0; color: #78350f; font-weight: 600;">Customer ID</td><td style="padding: 6px 0; color: #6b7280; font-family: monospace; font-size: 12px;">${data.customerId}</td></tr>` : ''}
          </table>
        </div>

        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
          <h3 style="color: #1e1b4b; margin: 0 0 15px 0; font-size: 14px;">📋 MEMBERSHIP DETAILS</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600; width: 160px;">Tier</td><td style="padding: 8px 0; color: #7c3aed; font-weight: bold;">${data.tierName}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Start Date</td><td style="padding: 8px 0; color: #1e1b4b;">${data.startDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Expires</td><td style="padding: 8px 0; color: #1e1b4b;">${data.expiryDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Duration</td><td style="padding: 8px 0; color: #1e1b4b;">${data.durationMonths} month${data.durationMonths > 1 ? 's' : ''}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Visits Per Month</td><td style="padding: 8px 0; color: #1e1b4b; font-weight: bold;">${data.visitsPerMonth ?? 'Unlimited'}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Monthly Rate</td><td style="padding: 8px 0; color: #1e1b4b;">$${data.monthlyPrice.toFixed(2)}/month</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Auto-Renew</td><td style="padding: 8px 0; color: #1e1b4b;">${data.autoRenew ? '<span style="color:#059669;font-weight:bold;">Yes</span>' : 'No'}</td></tr>
          </table>
        </div>

        <div style="background: #eff6ff; padding: 15px 20px; border: 1px solid #bfdbfe; border-top: none; border-radius: 0 0 12px 12px;">
          <h3 style="color: #1e40af; margin: 0 0 10px 0; font-size: 14px;">💳 PAYMENT INFO</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #1e40af; font-weight: 600; width: 140px;">Amount Paid</td><td style="padding: 6px 0; color: #1e1b4b; font-weight: bold;">$${data.totalPaid.toFixed(2)}</td></tr>
            <tr><td style="padding: 6px 0; color: #1e40af; font-weight: 600;">Method</td><td style="padding: 6px 0; color: #1e1b4b;">${data.paymentMethod || 'Square'}</td></tr>
            ${data.paymentId ? `<tr><td style="padding: 6px 0; color: #1e40af; font-weight: 600;">Payment ID</td><td style="padding: 6px 0; color: #6b7280; font-family: monospace; font-size: 12px;">${data.paymentId}</td></tr>` : ''}
          </table>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 11px; text-align: center;">This is an automated admin notification from Playfunia booking system.</p>
      </div>
    `,
    text: `NEW MEMBERSHIP ACTIVATED\n\nTier: ${data.tierName}\nTotal Paid: $${data.totalPaid.toFixed(2)}\n\nCUSTOMER CONTACT:\nName: ${data.customerName}${data.isGuestPurchase ? ' (GUEST)' : ''}\nEmail: ${data.customerEmail}\nPhone: ${data.customerPhone || 'Not provided'}\n${data.customerId ? `Customer ID: ${data.customerId}\n` : ''}\nMEMBERSHIP DETAILS:\nTier: ${data.tierName}\nStart: ${data.startDate}\nExpires: ${data.expiryDate}\nDuration: ${data.durationMonths} month(s)\nVisits Per Month: ${data.visitsPerMonth ?? 'Unlimited'}\nMonthly Rate: $${data.monthlyPrice.toFixed(2)}\nAuto-Renew: ${data.autoRenew ? 'Yes' : 'No'}\n\nPAYMENT:\nAmount: $${data.totalPaid.toFixed(2)}\nMethod: ${data.paymentMethod || 'Square'}\n${data.paymentId ? `Payment ID: ${data.paymentId}\n` : ''}`,
  });
}

// ============= Job Application Notification =============
export interface JobApplicationNotificationData {
  jobTitle: string;
  department: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  dateOfBirth?: string;
  schedulePreference?: string;
  availableStartDate?: string;
  hasExperienceWithChildren: boolean;
  coverLetter?: string;
  howHeard?: string;
  gender?: string;
  pronouns?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  resumeFile?: {
    filename: string;
    content: Buffer;
    contentType: string;
  };
  videoLink?: string;
}

export async function sendJobApplicationNotification(data: JobApplicationNotificationData): Promise<boolean> {
  const esc = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const safeName = esc(data.applicantName);
  const safeEmail = esc(data.applicantEmail);
  const safePhone = esc(data.applicantPhone);
  const safeDob = data.dateOfBirth ? esc(data.dateOfBirth) : null;
  const safeSchedule = data.schedulePreference ? esc(data.schedulePreference) : null;
  const safeHowHeard = data.howHeard ? esc(data.howHeard) : null;
  const safeGender = data.gender ? esc(data.gender) : null;
  const safePronouns = data.pronouns ? esc(data.pronouns) : null;
  const safeEcName = data.emergencyContactName ? esc(data.emergencyContactName) : null;
  const safeEcPhone = data.emergencyContactPhone ? esc(data.emergencyContactPhone) : null;

  const coverLetterHtml = data.coverLetter
    ? `<tr><td colspan="2" style="padding: 8px 0; color: #4b5563; font-weight: 600;">Cover Letter</td></tr>
       <tr><td colspan="2" style="padding: 8px 16px; color: #1e1b4b; background: #f9fafb; border-radius: 8px; white-space: pre-wrap;">${esc(data.coverLetter).replace(/\n/g, '<br>')}</td></tr>`
    : '';

  const attachments: EmailAttachment[] = data.resumeFile
    ? [{
        filename: data.resumeFile.filename,
        content: data.resumeFile.content,
        contentType: data.resumeFile.contentType,
      }]
    : [];

  return sendEmail({
    to: ADMIN_EMAILS,
    subject: `New Job Application: ${esc(data.jobTitle)} - ${safeName}`,
    attachments,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: white; margin: 0;">New Job Application</h2>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">${esc(data.jobTitle)} - ${esc(data.department)}</p>
        </div>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #1e1b4b; margin: 0 0 12px 0;">Applicant Information</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600; width: 180px;">Name</td><td style="padding: 8px 0; color: #1e1b4b;">${safeName}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Email</td><td style="padding: 8px 0; color: #1e1b4b;"><a href="mailto:${safeEmail}" style="color: #7c3aed;">${safeEmail}</a></td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Phone</td><td style="padding: 8px 0; color: #1e1b4b;"><a href="tel:${safePhone}" style="color: #7c3aed;">${safePhone}</a></td></tr>
            ${safeDob ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Date of Birth</td><td style="padding: 8px 0; color: #1e1b4b;">${safeDob}</td></tr>` : ''}
            ${safeGender ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Gender</td><td style="padding: 8px 0; color: #1e1b4b;">${safeGender}</td></tr>` : ''}
            ${safePronouns ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Pronouns</td><td style="padding: 8px 0; color: #1e1b4b;">${safePronouns}</td></tr>` : ''}
          </table>
        </div>

        <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #1e1b4b; margin: 0 0 12px 0;">Experience & Availability</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600; width: 180px;">Experience with Children</td><td style="padding: 8px 0; color: #1e1b4b;">${data.hasExperienceWithChildren ? '<span style="color:#059669;font-weight:bold;">Yes</span>' : 'No'}</td></tr>
            ${safeSchedule ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Schedule Preference</td><td style="padding: 8px 0; color: #1e1b4b;">${safeSchedule}</td></tr>` : ''}
            ${data.availableStartDate ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Available Start Date</td><td style="padding: 8px 0; color: #1e1b4b;">${esc(data.availableStartDate)}</td></tr>` : ''}
            ${safeHowHeard ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">How They Heard About Us</td><td style="padding: 8px 0; color: #1e1b4b;">${safeHowHeard}</td></tr>` : ''}
          </table>
        </div>

        ${safeEcName ? `
        <div style="background: #fef3c7; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #1e1b4b; margin: 0 0 12px 0;">Emergency Contact</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600; width: 180px;">Name</td><td style="padding: 8px 0; color: #1e1b4b;">${safeEcName}</td></tr>
            ${safeEcPhone ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Phone</td><td style="padding: 8px 0; color: #1e1b4b;">${safeEcPhone}</td></tr>` : ''}
          </table>
        </div>
        ` : ''}

        ${coverLetterHtml ? `
        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            ${coverLetterHtml}
          </table>
        </div>
        ` : ''}

        ${data.videoLink ? `
        <div style="background: #ede9fe; padding: 20px; border-radius: 12px; margin: 20px 0; text-align: center;">
          <h3 style="color: #1e1b4b; margin: 0 0 12px 0;">Video Introduction</h3>
          <a href="${esc(data.videoLink)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Watch Video</a>
        </div>
        ` : '<p style="color: #9ca3af;">No video was provided.</p>'}

        ${data.resumeFile ? '<p style="color: #059669; font-weight: 600;">Resume attached to this email.</p>' : '<p style="color: #9ca3af;">No resume was uploaded.</p>'}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">This is an automated notification from the Playfunia careers page.</p>
      </div>
    `,
    text: `NEW JOB APPLICATION: ${data.jobTitle} (${data.department})\n\nAPPLICANT:\nName: ${data.applicantName}\nEmail: ${data.applicantEmail}\nPhone: ${data.applicantPhone}${data.dateOfBirth ? `\nDOB: ${data.dateOfBirth}` : ''}\n\nEXPERIENCE:\nExperience with Children: ${data.hasExperienceWithChildren ? 'Yes' : 'No'}${data.schedulePreference ? `\nSchedule Preference: ${data.schedulePreference}` : ''}${data.availableStartDate ? `\nAvailable Start: ${data.availableStartDate}` : ''}${data.howHeard ? `\nHow Heard: ${data.howHeard}` : ''}${data.emergencyContactName ? `\n\nEMERGENCY CONTACT:\nName: ${data.emergencyContactName}\nPhone: ${data.emergencyContactPhone || 'Not provided'}` : ''}${data.coverLetter ? `\n\nCOVER LETTER:\n${data.coverLetter}` : ''}${data.videoLink ? `\n\nVIDEO INTRODUCTION:\n${data.videoLink}` : ''}\n\nResume: ${data.resumeFile ? 'Attached' : 'Not uploaded'}`,
  });
}

// ============= Job Application Confirmation (to Applicant) =============
export interface JobApplicationConfirmationData {
  applicantFirstName: string;
  applicantEmail: string;
  jobTitle: string;
  department: string;
  applicationDate: string; // ISO datetime
}

export async function sendJobApplicationConfirmation(data: JobApplicationConfirmationData): Promise<boolean> {
  const safeName = escapeHtml(data.applicantFirstName);
  const safeTitle = escapeHtml(data.jobTitle);
  const safeDept = escapeHtml(data.department);

  const appliedDate = DateTime.fromISO(data.applicationDate).setZone(BUSINESS_TIMEZONE);
  const formattedDate = appliedDate.toFormat('MMMM d, yyyy');

  return sendEmail({
    to: data.applicantEmail,
    subject: `Application Received - ${safeTitle} at Playfunia`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>

        <div style="background: linear-gradient(135deg, #7c3aed, #ff6b9d); padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h2 style="color: white; margin: 0; font-size: 22px;">Application Received!</h2>
        </div>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi ${safeName},</p>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          Thank you for applying to join the Playfunia team! We've received your application and wanted to confirm the details:
        </p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; color: #4b5563; font-weight: 600;">Position</td>
              <td style="padding: 10px 0; text-align: right; color: #1e1b4b; font-weight: 600;">${safeTitle}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #4b5563; font-weight: 600;">Department</td>
              <td style="padding: 10px 0; text-align: right; color: #1e1b4b;">${safeDept}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #4b5563; font-weight: 600;">Date Applied</td>
              <td style="padding: 10px 0; text-align: right; color: #1e1b4b;">${formattedDate}</td>
            </tr>
          </table>
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="color: #166534; margin: 0 0 12px 0; font-size: 15px;">What happens next?</h3>
          <ol style="color: #4b5563; margin: 0; padding-left: 20px; line-height: 1.8;">
            <li>Our hiring team will review your application</li>
            <li>If your qualifications match, we'll reach out to schedule an interview</li>
            <li>You'll hear back from us within 5-7 business days</li>
          </ol>
        </div>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          In the meantime, feel free to follow us on
          <a href="https://instagram.com/playfunia_" style="color: #7c3aed; text-decoration: none; font-weight: 600;">Instagram</a>
          to get a sneak peek of life at Playfunia!
        </p>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          We appreciate your interest in joining our team and look forward to reviewing your application.
        </p>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          Warm regards,<br>
          <strong style="color: #1e1b4b;">The Playfunia Team</strong>
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          This is an automated confirmation from Playfunia. Please do not reply to this email.
          If you have questions, contact us at <a href="mailto:info@playfunia.com" style="color: #7c3aed;">info@playfunia.com</a>.
        </p>
      </div>
    `,
    text: `Hi ${data.applicantFirstName}!\n\nThank you for applying to join the Playfunia team! We've received your application.\n\nPosition: ${data.jobTitle}\nDepartment: ${data.department}\nDate Applied: ${formattedDate}\n\nWhat happens next?\n1. Our hiring team will review your application\n2. If your qualifications match, we'll reach out to schedule an interview\n3. You'll hear back from us within 5-7 business days\n\nWe appreciate your interest and look forward to reviewing your application.\n\nWarm regards,\nThe Playfunia Team\n\nQuestions? Email us at info@playfunia.com`,
  });
}

// ============= Job Application Status Change Notification =============
export interface JobApplicationStatusChangeData {
  applicantFirstName: string;
  applicantEmail: string;
  jobTitle: string;
  previousStatus: string;
  newStatus: string;
}

const STATUS_DISPLAY: Record<string, string> = {
  new: 'Received',
  reviewed: 'Under Review',
  interview_scheduled: 'Interview Scheduled',
  offered: 'Offer Extended',
  hired: 'Hired',
  rejected: 'Not Selected',
  withdrawn: 'Withdrawn',
};

const STATUS_MESSAGES: Record<string, string> = {
  reviewed: 'Our hiring team is currently reviewing your application. We\'ll be in touch soon with next steps.',
  interview_scheduled: 'Great news! We\'d like to move forward and schedule an interview with you. A member of our team will reach out shortly with available times.',
  offered: 'Congratulations! We\'re excited to extend an offer to you. A member of our team will be in touch with the details.',
  hired: 'Welcome to the Playfunia family! We\'re thrilled to have you on board. Our team will reach out with onboarding details.',
  rejected: 'After careful consideration, we\'ve decided to move forward with other candidates for this position. We truly appreciate your interest in Playfunia and encourage you to apply for future openings.',
  withdrawn: 'Your application has been marked as withdrawn. If this was a mistake or you\'d like to reapply, please don\'t hesitate to reach out.',
};

const STATUS_COLORS: Record<string, string> = {
  reviewed: '#2563eb',
  interview_scheduled: '#7c3aed',
  offered: '#0891b2',
  hired: '#059669',
  rejected: '#dc2626',
  withdrawn: '#64748b',
};

export async function sendJobApplicationStatusChange(data: JobApplicationStatusChangeData): Promise<boolean> {
  const safeName = escapeHtml(data.applicantFirstName);
  const safeTitle = escapeHtml(data.jobTitle);
  const displayStatus = STATUS_DISPLAY[data.newStatus] ?? data.newStatus;
  const statusMessage = STATUS_MESSAGES[data.newStatus] ?? `Your application status has been updated to: ${displayStatus}.`;
  const bannerColor = STATUS_COLORS[data.newStatus] ?? '#7c3aed';

  // Send to applicant
  const applicantEmail = sendEmail({
    to: data.applicantEmail,
    subject: `Application Update: ${safeTitle} - ${displayStatus}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>

        <div style="background: ${bannerColor}; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h2 style="color: white; margin: 0; font-size: 22px;">Application Status Update</h2>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">${safeTitle}</p>
        </div>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi ${safeName},</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
          <p style="color: #64748b; font-size: 13px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">Current Status</p>
          <p style="color: ${bannerColor}; font-size: 20px; font-weight: 700; margin: 0;">${escapeHtml(displayStatus)}</p>
        </div>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          ${escapeHtml(statusMessage)}
        </p>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-top: 24px;">
          Thank you for your patience,<br>
          <strong style="color: #1e1b4b;">The Playfunia Team</strong>
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          If you have questions, contact us at <a href="mailto:info@playfunia.com" style="color: #7c3aed;">info@playfunia.com</a>.
        </p>
      </div>
    `,
    text: `Hi ${data.applicantFirstName}!\n\nYour application for ${data.jobTitle} at Playfunia has been updated.\n\nStatus: ${displayStatus}\n\n${statusMessage}\n\nThank you for your patience,\nThe Playfunia Team\n\nQuestions? Email us at info@playfunia.com`,
  });

  // Send to admins
  const adminEmail = sendEmail({
    to: ADMIN_EMAILS,
    subject: `Application Status Changed: ${escapeHtml(data.applicantFirstName)} - ${safeTitle} (${displayStatus})`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: #f1f5f9; padding: 20px; border-radius: 12px;">
          <h3 style="margin: 0 0 12px 0; color: #1e293b;">Application Status Changed</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Applicant</td><td style="padding: 8px 0; color: #1e1b4b;">${safeName} (${escapeHtml(data.applicantEmail)})</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Position</td><td style="padding: 8px 0; color: #1e1b4b;">${safeTitle}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Previous Status</td><td style="padding: 8px 0; color: #1e1b4b;">${escapeHtml(STATUS_DISPLAY[data.previousStatus] ?? data.previousStatus)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">New Status</td><td style="padding: 8px 0; color: ${bannerColor}; font-weight: 700;">${escapeHtml(displayStatus)}</td></tr>
          </table>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Automated notification from Playfunia admin.</p>
      </div>
    `,
    text: `APPLICATION STATUS CHANGED\n\nApplicant: ${data.applicantFirstName} (${data.applicantEmail})\nPosition: ${data.jobTitle}\nPrevious Status: ${STATUS_DISPLAY[data.previousStatus] ?? data.previousStatus}\nNew Status: ${displayStatus}`,
  });

  const [applicantResult, adminResult] = await Promise.all([applicantEmail, adminEmail]);
  return applicantResult || adminResult;
}

// Waiver confirmation data interface
export interface WaiverConfirmationEmailData {
  email: string;
  guardianName: string;
  childNames: string[];
  childCount: number;
  signedAt: string;       // ISO datetime
  waiverId: number;       // submission_id
  waiverCode: string;     // short code e.g. "A7K3Q9"
  location: string;       // "Playfunia"
  pdfBuffer?: Buffer;     // Signed waiver PDF attachment
}

// Send waiver confirmation email
export async function sendWaiverConfirmation(data: WaiverConfirmationEmailData): Promise<boolean> {
  const safeName = escapeHtml(data.guardianName);
  const safeCode = escapeHtml(data.waiverCode);
  const safeLocation = escapeHtml(data.location);
  const childNamesHtml = data.childNames.map(n => `<li style="padding: 4px 0; color: #1e1b4b;">${escapeHtml(n)}</li>`).join('');
  const childNamesText = data.childNames.join(', ');

  // Format signedAt in Eastern Time
  const signedDate = DateTime.fromISO(data.signedAt).setZone(BUSINESS_TIMEZONE);
  const formattedDate = signedDate.toFormat('MM/dd/yyyy h:mm a') + ' ET';

  // Build attachments array if PDF is available
  const attachments: EmailAttachment[] = [];
  if (data.pdfBuffer) {
    attachments.push({
      filename: `Playfunia-Waiver-${data.waiverCode}.pdf`,
      content: data.pdfBuffer,
      contentType: 'application/pdf',
    });
  }

  return sendEmail({
    to: data.email,
    bcc: WAIVER_ADMIN_EMAILS,
    subject: `Waiver Confirmation - ${safeCode}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Playfunia</h1>
        </div>
        <div style="background: linear-gradient(135deg, #1aa45d, #2ed573); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: white; margin: 0;">Waiver Confirmed!</h2>
        </div>
        <p style="color: #4b5563; font-size: 16px;">Hi ${safeName},</p>
        <p style="color: #4b5563; font-size: 16px;">Your waiver has been successfully signed and recorded. ${data.pdfBuffer ? 'A signed copy of your waiver is attached to this email.' : ''} Here are the details:</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #4b5563;">Waiver Reference</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b; font-weight: bold; font-size: 18px; letter-spacing: 2px;">${safeCode}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #4b5563;">Date & Time</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #4b5563;">Location</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${safeLocation}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #4b5563;">Children (${data.childCount})</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">
                <ul style="list-style: none; padding: 0; margin: 0; text-align: right;">${childNamesHtml}</ul>
              </td>
            </tr>
          </table>
        </div>

        <div style="background: #fffbeb; border: 1px solid #f59e0b; padding: 16px; border-radius: 12px; margin: 20px 0;">
          <p style="color: #92400e; font-weight: 600; margin: 0 0 8px 0; font-size: 14px;">Important Reminder</p>
          <p style="color: #92400e; margin: 0; font-size: 14px;">Waivers must be completed on the same day as your visit. Please show this confirmation (or your waiver code <strong>${safeCode}</strong>) to staff at the door.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Hi ${data.guardianName}! Your Playfunia waiver has been confirmed.\n\nWaiver Reference: ${data.waiverCode}\nDate & Time: ${formattedDate}\nLocation: ${data.location}\nChildren (${data.childCount}): ${childNamesText}\n\nIMPORTANT: Waivers must be completed on the same day as your visit. Please show your waiver code ${data.waiverCode} to staff at the door.\n\nPlayfunia - Where fun happens!`,
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}

// ============= Membership Expiration Reminders =============

interface MembershipExpirationReminderData {
  email: string;
  customerName: string;
  tierName: string;
  expirationDate: string;
  daysRemaining: number;
  autoRenew: boolean;
  displayId?: string;
}

export async function sendMembershipExpirationReminder(data: MembershipExpirationReminderData): Promise<boolean> {
  const safeName = escapeHtml(data.customerName);
  const safeTier = escapeHtml(data.tierName);
  const safeDate = escapeHtml(data.expirationDate);
  const safeDisplayId = data.displayId ? escapeHtml(data.displayId) : '';

  const urgencyColor = data.daysRemaining === 0 ? '#dc2626' : data.daysRemaining === 1 ? '#f59e0b' : '#3b82f6';
  const urgencyText = data.daysRemaining === 0 ? 'expires today'
    : data.daysRemaining === 1 ? 'expires tomorrow'
    : `expires in ${data.daysRemaining} days`;

  const renewalNote = data.autoRenew
    ? `<p style="color: #059669; font-size: 14px;">Auto-renew is <strong>enabled</strong>. Visit Playfunia to renew your membership and continue enjoying benefits.</p>`
    : `<p style="color: #dc2626; font-size: 14px;">Auto-renew is <strong>disabled</strong>. Renew your membership to keep your benefits!</p>`;

  return sendEmail({
    to: data.email,
    bcc: ADMIN_EMAILS || undefined,
    subject: `Your Playfunia ${safeTier} membership ${urgencyText}`,
    html: `
      <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
        <div style="background: linear-gradient(135deg, ${urgencyColor}, #7c3aed); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Membership Expiring Soon</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Your ${safeTier} ${urgencyText}</p>
        </div>

        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
          <p style="font-size: 16px; color: #374151;">Hi ${safeName},</p>
          <p style="font-size: 14px; color: #6b7280;">This is a friendly reminder that your Playfunia membership is coming up for renewal.</p>

          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Plan</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #111827;">${safeTier}</td></tr>
              ${safeDisplayId ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Membership ID</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #111827;">${safeDisplayId}</td></tr>` : ''}
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Expiration Date</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${urgencyColor};">${safeDate}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Auto-Renew</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #111827;">${data.autoRenew ? 'Enabled' : 'Disabled'}</td></tr>
            </table>
          </div>

          ${renewalNote}

          <div style="text-align: center; margin: 24px 0;">
            <a href="https://playfunia.com/memberships" style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Renew Membership</a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
        </div>
      </div>
    `,
    text: `Hi ${data.customerName}! Your Playfunia ${data.tierName} membership ${urgencyText}. Expiration date: ${data.expirationDate}. ${data.autoRenew ? 'Auto-renew is enabled.' : 'Auto-renew is disabled. Visit playfunia.com/memberships to renew.'} Playfunia - Where fun happens!`,
  });
}

interface MembershipExpiredNoticeData {
  email: string;
  customerName: string;
  tierName: string;
  displayId?: string;
}

export async function sendMembershipExpiredNotice(data: MembershipExpiredNoticeData): Promise<boolean> {
  const safeName = escapeHtml(data.customerName);
  const safeTier = escapeHtml(data.tierName);

  return sendEmail({
    to: data.email,
    bcc: ADMIN_EMAILS || undefined,
    subject: `Your Playfunia ${safeTier} membership has expired`,
    html: `
      <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc2626, #7c3aed); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Membership Expired</h1>
        </div>

        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
          <p style="font-size: 16px; color: #374151;">Hi ${safeName},</p>
          <p style="font-size: 14px; color: #6b7280;">Your Playfunia <strong>${safeTier}</strong> membership has expired. We'd love to have you back!</p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="https://playfunia.com/memberships" style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Get a New Membership</a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
        </div>
      </div>
    `,
    text: `Hi ${data.customerName}! Your Playfunia ${data.tierName} membership has expired. Visit playfunia.com/memberships to get a new one. Playfunia - Where fun happens!`,
  });
}
