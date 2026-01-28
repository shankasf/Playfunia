import nodemailer from 'nodemailer';
import { appConfig } from '../config/env';

// Admin emails for receiving copies of all notifications
const ADMIN_EMAILS = 'playfunia@playfunia.com, sag1998kailash@gmail.com';

// Create reusable transporter - lazy initialized
let transporter: nodemailer.Transporter | null = null;
let transporterInitialized = false;

function getTransporter(): nodemailer.Transporter | null {
  // Only create once after proper initialization
  if (transporterInitialized) return transporter;

  if (!appConfig.smtpHost || !appConfig.smtpUser || !appConfig.smtpPass) {
    console.warn('[Email] SMTP not configured - emails will be logged only');
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

// Check if email service is configured
export function isEmailConfigured(): boolean {
  return !!(appConfig.smtpHost && appConfig.smtpUser && appConfig.smtpPass);
}

// Generate 6-digit OTP
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============= Calendar Helper Functions =============

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

// Format date for ICS in UTC (YYYYMMDDTHHMMSSZ)
function formatICSDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  // Use UTC time with Z suffix for proper timezone handling
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

// Generate ICS calendar file content
function generateICSContent(event: CalendarEventData): string {
  const { hours, minutes } = parseTime(event.startTime);
  const startDate = new Date(event.startDate);
  startDate.setHours(hours, minutes, 0, 0);

  const endDate = new Date(startDate.getTime() + event.durationMinutes * 60 * 1000);

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
DTSTART:${formatICSDate(startDate)}
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
  const startDate = new Date(event.startDate);
  startDate.setHours(hours, minutes, 0, 0);

  const endDate = new Date(startDate.getTime() + event.durationMinutes * 60 * 1000);

  const formatGoogleDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
    details: event.description,
    location: event.location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Generate Outlook/Office 365 calendar link
function generateOutlookCalendarLink(event: CalendarEventData): string {
  const { hours, minutes } = parseTime(event.startTime);
  const startDate = new Date(event.startDate);
  startDate.setHours(hours, minutes, 0, 0);

  const endDate = new Date(startDate.getTime() + event.durationMinutes * 60 * 1000);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: startDate.toISOString(),
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
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[Email] Would send to ${options.to}${options.bcc ? ` (bcc: ${options.bcc})` : ''}: ${options.subject}`);
    return true;
  }

  try {
    await transport.sendMail({
      from: `"${appConfig.smtpFromName}" <${appConfig.smtpFrom || appConfig.smtpUser}>`,
      to: options.to,
      bcc: options.bcc,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });
    console.log(`[Email] Sent to ${options.to}${options.bcc ? ` (bcc: ${options.bcc})` : ''}: ${options.subject}`);
    return true;
  } catch (error) {
    console.error(`[Email] Failed to send to ${options.to}:`, error);
    return false;
  }
}

// Send email verification OTP
export async function sendVerificationOTP(email: string, otp: string, firstName?: string): Promise<boolean> {
  const name = firstName || 'there';
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
  const name = firstName || 'there';
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

// Booking confirmation data interface
export interface BookingEmailData {
  reference: string;
  guestName: string;
  email: string;
  eventDate: string;
  startTime: string;
  location: string;
  packageName: string;
  guestCount: number;
  depositAmount: number;
  totalAmount: number;
  balanceRemaining: number;
  addOns?: Array<{ name: string; quantity: number; price: number }>;
  durationMinutes?: number; // Party duration for calendar event (defaults to 120)
  receiptPdf?: Buffer;
  receiptNumber?: string;
  // Package details for PDF
  packageDetails?: {
    priceUsd: number;
    baseChildren: number;
    baseRoomHours: number;
    includesFood: boolean;
    includesDrinks: boolean;
    includesDecor: boolean;
    notes?: string;
  };
}

// Send booking confirmation email
export async function sendBookingConfirmation(data: BookingEmailData): Promise<boolean> {
  const addOnsHtml = data.addOns?.length
    ? `<tr><td style="padding: 8px 0; color: #4b5563;">Add-ons</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.addOns.map(a => `${a.name} x${a.quantity}`).join(', ')}</td></tr>`
    : '';

  // Generate calendar event data
  const durationMinutes = data.durationMinutes || 120; // Default 2 hours
  const calendarEvent: CalendarEventData = {
    title: `Playfunia Party - ${data.packageName}`,
    description: `Party booking at Playfunia!\\n\\nReference: ${data.reference}\\nPackage: ${data.packageName}\\nGuests: ${data.guestCount}\\nBalance Due: $${data.balanceRemaining.toFixed(2)}\\n\\nWe can't wait to celebrate with you!`,
    location: `Playfunia - ${data.location}`,
    startDate: data.eventDate,
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
        <p style="color: #4b5563; font-size: 16px;">Hi ${data.guestName},</p>
        <p style="color: #4b5563; font-size: 16px;">Your party booking has been confirmed. Here are the details:</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563;">Reference</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b; font-weight: bold;">${data.reference}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Package</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.packageName}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Date</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.eventDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Time</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.startTime}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Location</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.location}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Guests</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.guestCount}</td></tr>
            ${addOnsHtml}
          </table>
        </div>

        ${calendarButtonsHtml}

        <div style="background: #d1fae5; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #166534; font-weight: bold;">Total Paid</td><td style="padding: 8px 0; text-align: right; color: #166534; font-weight: bold; font-size: 18px;">$${data.totalAmount.toFixed(2)}</td></tr>
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
    text: `Party Booking Confirmed!\n\nHi ${data.guestName},\n\nReference: ${data.reference}\nPackage: ${data.packageName}\nDate: ${data.eventDate} at ${data.startTime}\nLocation: ${data.location}\nGuests: ${data.guestCount}\n\nTotal Paid: $${data.totalAmount.toFixed(2)}\nPayment complete - no balance due${data.receiptNumber ? `\n\nReceipt #${data.receiptNumber} is attached.` : ''}\n\nWe can't wait to celebrate with you!`,
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
        <p style="color: #4b5563; font-size: 16px;">Hi ${data.customerName},</p>
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
              <td colspan="2" style="padding: 8px 0; color: #4b5563;">Tax (8%)</td>
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
    text: `Your Playfunia Tickets\n\nHi ${data.customerName},\n\nThank you for your purchase!\n\n${data.tickets.map(t => `${t.label} x${t.quantity}: $${(t.unitPrice * t.quantity).toFixed(2)}\nCodes: ${t.codes.join(', ')}`).join('\n\n')}\n\nSubtotal: $${data.subtotal.toFixed(2)}\nTax (8%): $${data.taxAmount.toFixed(2)}\nTotal: $${data.totalAmount.toFixed(2)}\n\nShow your ticket codes at the entrance. See you soon!`,
  });
}

// Membership confirmation data interface
export interface MembershipEmailData {
  email: string;
  customerName: string;
  tierName: string;
  startDate: string;
  expiryDate: string;
  visitsPerMonth: number | null;
  guestPassesPerMonth: number | null;
  discountPercent: number | null;
  benefits: string[] | null;
  autoRenew: boolean;
  monthlyPrice: number;
  receiptPdf?: Buffer;
  receiptNumber?: string;
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
        <p style="color: #4b5563; font-size: 16px;">Hi ${data.customerName},</p>
        <p style="color: #4b5563; font-size: 16px;">Welcome to the Playfunia family! Your membership is now active.</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #4b5563;">Membership Tier</td><td style="padding: 8px 0; text-align: right; color: #7c3aed; font-weight: bold;">${data.tierName}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Start Date</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.startDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Expires</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.expiryDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Allowed Visits Per Month</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b; font-weight: bold;">${data.visitsPerMonth ?? 'Unlimited'}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Guest Passes Per Month</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.guestPassesPerMonth ?? '0'}</td></tr>
            ${data.discountPercent ? `<tr><td style="padding: 8px 0; color: #4b5563;">Discount on Extras</td><td style="padding: 8px 0; text-align: right; color: #22c55e; font-weight: bold;">${data.discountPercent}% off</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #4b5563;">Monthly Price</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.monthlyPrice.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563;">Auto-Renew</td><td style="padding: 8px 0; text-align: right; color: #1e1b4b;">${data.autoRenew ? 'Yes' : 'No'}</td></tr>
          </table>
        </div>

        ${benefitsHtml}

        ${receiptInfoHtml}
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Enjoy unlimited fun with your membership! See you at Playfunia!</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Welcome to Playfunia ${data.tierName}!\n\nHi ${data.customerName},\n\nYour membership is now active.\n\nMembership Tier: ${data.tierName}\nStart Date: ${data.startDate}\nExpires: ${data.expiryDate}\nAllowed Visits Per Month: ${data.visitsPerMonth ?? 'Unlimited'}\nGuest Passes Per Month: ${data.guestPassesPerMonth ?? '0'}${data.discountPercent ? `\nDiscount on Extras: ${data.discountPercent}% off` : ''}\nMonthly Price: $${data.monthlyPrice.toFixed(2)}\nAuto-Renew: ${data.autoRenew ? 'Yes' : 'No'}${benefitsText}${data.receiptNumber ? `\n\nReceipt #${data.receiptNumber} is attached.` : ''}\n\nSee you at Playfunia!`,
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
  const preferredDateHtml = data.preferredDate
    ? `<tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Preferred Visit Date</td><td style="padding: 8px 0; color: #1e1b4b;">${data.preferredDate}</td></tr>`
    : '';

  const messageHtml = data.message
    ? `<tr><td colspan="2" style="padding: 8px 0; color: #4b5563; font-weight: 600;">Message</td></tr>
       <tr><td colspan="2" style="padding: 8px 16px; color: #1e1b4b; background: #f9fafb; border-radius: 8px;">${data.message.replace(/\n/g, '<br>')}</td></tr>`
    : '';

  return sendEmail({
    to: ADMIN_EMAILS,
    subject: `New Contact Inquiry from ${data.name}`,
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
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Name</td><td style="padding: 8px 0; color: #1e1b4b;">${data.name}</td></tr>
            <tr><td style="padding: 8px 0; color: #4b5563; font-weight: 600;">Email</td><td style="padding: 8px 0; color: #1e1b4b;"><a href="mailto:${data.email}" style="color: #7c3aed;">${data.email}</a></td></tr>
            ${preferredDateHtml}
            ${messageHtml}
          </table>
        </div>

        <p style="color: #6b7280; font-size: 14px;">Please respond to this inquiry within one business day.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">This message was sent from the Playfunia website contact form.</p>
      </div>
    `,
    text: `New Contact Inquiry\n\nName: ${data.name}\nEmail: ${data.email}${data.preferredDate ? `\nPreferred Date: ${data.preferredDate}` : ''}${data.message ? `\n\nMessage:\n${data.message}` : ''}\n\nPlease respond within one business day.`,
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
        <p style="color: #4b5563; font-size: 16px;">Hi ${data.customerName},</p>
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
              <td colspan="2" style="padding: 8px 0; color: #4b5563;">Tax (8%)</td>
              <td style="padding: 8px 0; text-align: right; color: #1e1b4b;">$${data.taxAmount.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #7c3aed;">
              <td colspan="2" style="padding: 12px 0; color: #1e1b4b; font-weight: bold;">Total</td>
              <td style="padding: 12px 0; text-align: right; color: #7c3aed; font-weight: bold; font-size: 18px;">$${data.total.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <p style="color: #6b7280; font-size: 14px;">Payment: ${data.paymentMethod}</p>
        <p style="color: #6b7280; font-size: 14px;">Date: ${data.orderDate}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Playfunia - Where fun happens!</p>
      </div>
    `,
    text: `Order Confirmed!\n\nOrder #${data.orderNumber}\n\nHi ${data.customerName},\n\nThank you for your order!\n\n${data.items.map(i => `${i.label} x${i.quantity}: $${i.total.toFixed(2)}${i.codes ? `\nCodes: ${i.codes.join(', ')}` : ''}`).join('\n')}\n\nSubtotal: $${data.subtotal.toFixed(2)}\nTax (8%): $${data.taxAmount.toFixed(2)}\nTotal: $${data.total.toFixed(2)}\nPayment: ${data.paymentMethod}\nDate: ${data.orderDate}`,
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
              <td colspan="2" style="padding: 8px 0; color: #4b5563;">Tax (8%)</td>
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
