import { Resend } from 'resend';
import { appConfig } from '../config/env';

// Initialize Resend client
let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (resend) return resend;

  if (!appConfig.resendApiKey) {
    console.warn('Email service not configured. Set RESEND_API_KEY environment variable.');
    return null;
  }

  resend = new Resend(appConfig.resendApiKey);
  return resend;
}

function getFromAddress(): string {
  const name = appConfig.emailFromName || 'Playfunia';
  const email = appConfig.emailFrom || 'noreply@playfunia.com';
  return `${name} <${email}>`;
}

// Generate 6-digit OTP
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Email templates
function getBaseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playfunia</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f8f9fa;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 28px;
      font-weight: 700;
    }
    .content {
      padding: 30px 25px;
    }
    .otp-box {
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      border-radius: 12px;
      padding: 25px;
      text-align: center;
      margin: 25px 0;
    }
    .otp-code {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #7c3aed;
      font-family: 'Courier New', monospace;
    }
    .info-box {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e9ecef;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #6b7280;
      font-size: 14px;
    }
    .info-value {
      font-weight: 600;
      color: #1f2b66;
    }
    .total-row {
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
      color: #ffffff;
      padding: 15px 20px;
      border-radius: 10px;
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
      font-size: 18px;
      font-weight: 700;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 14px 30px;
      border-radius: 25px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
    }
    .footer {
      background: #f8f9fa;
      padding: 25px;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
    }
    .footer a {
      color: #7c3aed;
      text-decoration: none;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 15px;
    }
    h2 {
      color: #1f2b66;
      margin-top: 0;
    }
    p {
      color: #4b5563;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Playfunia</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Questions? Contact us at <a href="mailto:info@playfunia.com">info@playfunia.com</a></p>
      <p>&copy; ${new Date().getFullYear()} Playfunia. All rights reserved.</p>
      <p>Indoor Play & Adventure Club</p>
    </div>
  </div>
</body>
</html>
`;
}

// Send email verification OTP
export async function sendVerificationOTP(email: string, otp: string, firstName?: string): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.log(`[Email Mock] Verification OTP for ${email}: ${otp}`);
    return true;
  }

  const content = `
    <h2>Verify Your Email</h2>
    <p>Hi${firstName ? ` ${firstName}` : ''},</p>
    <p>Welcome to Playfunia! Please use the verification code below to complete your registration:</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
    </div>
    <p>This code will expire in <strong>10 minutes</strong>.</p>
    <p>If you didn't create an account with Playfunia, you can safely ignore this email.</p>
  `;

  try {
    const { error } = await client.emails.send({
      from: getFromAddress(),
      to: email,
      subject: 'Verify Your Email - Playfunia',
      html: getBaseTemplate(content),
    });

    if (error) {
      console.error('Failed to send verification email:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}

// Send booking confirmation email
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
}

export async function sendBookingConfirmation(data: BookingEmailData): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.log(`[Email Mock] Booking confirmation for ${data.email}: ${data.reference}`);
    return true;
  }

  let addOnsHtml = '';
  if (data.addOns && data.addOns.length > 0) {
    addOnsHtml = data.addOns.map(addon => `
      <div class="info-row">
        <span class="info-label">${addon.name} x${addon.quantity}</span>
        <span class="info-value">$${(addon.price * addon.quantity).toFixed(2)}</span>
      </div>
    `).join('');
  }

  const content = `
    <div class="success-icon">🎉</div>
    <h2>Party Booking Confirmed!</h2>
    <p>Hi ${data.guestName},</p>
    <p>Great news! Your party booking at Playfunia has been confirmed. We can't wait to celebrate with you!</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Booking Reference</span>
        <span class="info-value">${data.reference}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date</span>
        <span class="info-value">${data.eventDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Time</span>
        <span class="info-value">${data.startTime}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Location</span>
        <span class="info-value">${data.location}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Package</span>
        <span class="info-value">${data.packageName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Guests</span>
        <span class="info-value">${data.guestCount} kids</span>
      </div>
      ${addOnsHtml}
    </div>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Deposit Paid</span>
        <span class="info-value" style="color: #22c55e;">$${data.depositAmount.toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Balance Due at Event</span>
        <span class="info-value">$${data.balanceRemaining.toFixed(2)}</span>
      </div>
      <div class="total-row">
        <span>Total</span>
        <span>$${data.totalAmount.toFixed(2)}</span>
      </div>
    </div>

    <p>A Playfunia host will reach out soon with more details about your party. If you have any questions, feel free to contact us!</p>
  `;

  try {
    const { error } = await client.emails.send({
      from: getFromAddress(),
      to: data.email,
      subject: `Party Booking Confirmed - ${data.reference} | Playfunia`,
      html: getBaseTemplate(content),
    });

    if (error) {
      console.error('Failed to send booking confirmation:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send booking confirmation:', error);
    return false;
  }
}

// Send ticket purchase confirmation
export interface TicketEmailData {
  email: string;
  customerName: string;
  tickets: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
    codes: string[];
  }>;
  totalAmount: number;
  discounts?: Array<{ label: string; amount: number }>;
  purchaseDate: string;
}

export async function sendTicketConfirmation(data: TicketEmailData): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.log(`[Email Mock] Ticket confirmation for ${data.email}`);
    return true;
  }

  const ticketsHtml = data.tickets.map(ticket => `
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">${ticket.label}</span>
        <span class="info-value">${ticket.quantity} x $${ticket.unitPrice.toFixed(2)}</span>
      </div>
      <div style="margin-top: 10px;">
        <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280;">Entry Codes:</p>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${ticket.codes.map(code => `
            <span style="background: linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(109, 40, 217, 0.05) 100%);
                         border: 1px dashed #7c3aed; border-radius: 8px; padding: 8px 12px;
                         font-family: monospace; font-weight: 700; color: #7c3aed;">${code}</span>
          `).join('')}
        </div>
      </div>
    </div>
  `).join('');

  let discountsHtml = '';
  if (data.discounts && data.discounts.length > 0) {
    discountsHtml = data.discounts.map(d => `
      <div class="info-row">
        <span class="info-label">${d.label}</span>
        <span class="info-value" style="color: #22c55e;">-$${d.amount.toFixed(2)}</span>
      </div>
    `).join('');
  }

  const content = `
    <div class="success-icon">🎟️</div>
    <h2>Your Tickets Are Ready!</h2>
    <p>Hi ${data.customerName},</p>
    <p>Thank you for your purchase! Here are your entry tickets for Playfunia:</p>

    ${ticketsHtml}

    <div class="info-box">
      ${discountsHtml}
      <div class="total-row">
        <span>Total Paid</span>
        <span>$${data.totalAmount.toFixed(2)}</span>
      </div>
    </div>

    <p><strong>How to use your tickets:</strong></p>
    <ul style="color: #4b5563;">
      <li>Show the entry codes above at the front desk</li>
      <li>Each code is valid for one child's admission</li>
      <li>Tickets are valid for 30 days from purchase</li>
      <li>Grip socks are required (available for purchase if needed)</li>
    </ul>

    <p>See you soon at Playfunia!</p>
  `;

  try {
    const { error } = await client.emails.send({
      from: getFromAddress(),
      to: data.email,
      subject: 'Your Playfunia Tickets Are Ready!',
      html: getBaseTemplate(content),
    });

    if (error) {
      console.error('Failed to send ticket confirmation:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send ticket confirmation:', error);
    return false;
  }
}

// Send membership activation confirmation
export interface MembershipEmailData {
  email: string;
  customerName: string;
  tierName: string;
  startDate: string;
  expiryDate: string;
  visitsPerMonth: number | null;
  autoRenew: boolean;
  monthlyPrice: number;
}

export async function sendMembershipConfirmation(data: MembershipEmailData): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.log(`[Email Mock] Membership confirmation for ${data.email}`);
    return true;
  }

  const content = `
    <div class="success-icon">⭐</div>
    <h2>Welcome to ${data.tierName} Membership!</h2>
    <p>Hi ${data.customerName},</p>
    <p>Congratulations! Your Playfunia membership is now active. Get ready for unlimited fun!</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Membership Tier</span>
        <span class="info-value">${data.tierName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Start Date</span>
        <span class="info-value">${data.startDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Valid Until</span>
        <span class="info-value">${data.expiryDate}</span>
      </div>
      ${data.visitsPerMonth ? `
      <div class="info-row">
        <span class="info-label">Visits Per Month</span>
        <span class="info-value">${data.visitsPerMonth === -1 ? 'Unlimited' : data.visitsPerMonth}</span>
      </div>
      ` : ''}
      <div class="info-row">
        <span class="info-label">Auto-Renewal</span>
        <span class="info-value">${data.autoRenew ? 'Enabled' : 'Disabled'}</span>
      </div>
      <div class="total-row">
        <span>Monthly Rate</span>
        <span>$${data.monthlyPrice.toFixed(2)}/mo</span>
      </div>
    </div>

    <p><strong>Membership Benefits:</strong></p>
    <ul style="color: #4b5563;">
      <li>Priority booking for parties</li>
      <li>Exclusive member discounts</li>
      <li>Early access to special events</li>
      <li>Free grip socks included</li>
    </ul>

    <p>Thank you for joining the Playfunia family!</p>
  `;

  try {
    const { error } = await client.emails.send({
      from: getFromAddress(),
      to: data.email,
      subject: `Welcome to ${data.tierName} Membership - Playfunia`,
      html: getBaseTemplate(content),
    });

    if (error) {
      console.error('Failed to send membership confirmation:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send membership confirmation:', error);
    return false;
  }
}

// Send password reset OTP
export async function sendPasswordResetOTP(email: string, otp: string, firstName?: string): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.log(`[Email Mock] Password reset OTP for ${email}: ${otp}`);
    return true;
  }

  const content = `
    <h2>Reset Your Password</h2>
    <p>Hi${firstName ? ` ${firstName}` : ''},</p>
    <p>We received a request to reset your password. Use the code below to proceed:</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
    </div>
    <p>This code will expire in <strong>10 minutes</strong>.</p>
    <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
  `;

  try {
    const { error } = await client.emails.send({
      from: getFromAddress(),
      to: email,
      subject: 'Reset Your Password - Playfunia',
      html: getBaseTemplate(content),
    });

    if (error) {
      console.error('Failed to send password reset email:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

// Check if email service is configured
export function isEmailConfigured(): boolean {
  return Boolean(appConfig.resendApiKey);
}

// Send order confirmation with PDF receipt
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
  discounts: Array<{ label: string; amount: number }>;
  total: number;
  paymentMethod: string;
  receiptPdf?: Buffer;
}

export async function sendOrderConfirmation(data: OrderConfirmationEmailData): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.log(`[Email Mock] Order confirmation for ${data.email}: Order #${data.orderNumber}`);
    return true;
  }

  const itemsHtml = data.items.map(item => `
    <div class="info-row">
      <span class="info-label">${item.label} x${item.quantity}</span>
      <span class="info-value">$${item.total.toFixed(2)}</span>
    </div>
    ${item.codes && item.codes.length > 0 ? `
      <div style="margin: 8px 0 12px 0; padding: 10px; background: rgba(124, 58, 237, 0.05); border-radius: 8px;">
        <p style="margin: 0 0 6px; font-size: 11px; color: #6b7280; text-transform: uppercase;">Entry Codes</p>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${item.codes.map(code => `
            <span style="background: #fff; border: 1px dashed #7c3aed; border-radius: 6px; padding: 6px 10px;
                         font-family: monospace; font-weight: 700; color: #7c3aed; font-size: 13px;">${code}</span>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `).join('');

  const discountsHtml = data.discounts.length > 0 ? data.discounts.map(d => `
    <div class="info-row">
      <span class="info-label">${d.label}</span>
      <span class="info-value" style="color: #22c55e;">-$${d.amount.toFixed(2)}</span>
    </div>
  `).join('') : '';

  const content = `
    <div class="success-icon">✓</div>
    <h2>Order Confirmed!</h2>
    <p>Hi ${data.customerName},</p>
    <p>Thank you for your purchase! Your order has been confirmed and payment received.</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Order Number</span>
        <span class="info-value">${data.orderNumber}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date</span>
        <span class="info-value">${data.orderDate}</span>
      </div>
    </div>

    <div class="info-box">
      <h3 style="margin: 0 0 12px; font-size: 14px; color: #1f2b66;">Order Details</h3>
      ${itemsHtml}
      ${discountsHtml}
      <div class="total-row">
        <span>Total Paid</span>
        <span>$${data.total.toFixed(2)}</span>
      </div>
    </div>

    <p style="font-size: 13px; color: #6b7280;">
      Payment Method: ${data.paymentMethod}<br>
      ${data.receiptPdf ? 'A PDF receipt is attached to this email for your records.' : ''}
    </p>

    <p><strong>What's next?</strong></p>
    <ul style="color: #4b5563;">
      <li>Show your entry codes at the front desk</li>
      <li>Each code is valid for one child's admission</li>
      <li>Tickets are valid for 30 days from purchase</li>
      <li>Grip socks are required (available for purchase if needed)</li>
    </ul>

    <p>See you soon at Playfunia!</p>
  `;

  try {
    const emailOptions: {
      from: string;
      to: string;
      subject: string;
      html: string;
      attachments?: Array<{ filename: string; content: Buffer }>;
    } = {
      from: getFromAddress(),
      to: data.email,
      subject: `Order Confirmed - #${data.orderNumber} | Playfunia`,
      html: getBaseTemplate(content),
    };

    if (data.receiptPdf) {
      emailOptions.attachments = [
        {
          filename: `Playfunia_Receipt_${data.orderNumber}.pdf`,
          content: data.receiptPdf,
        },
      ];
    }

    console.log(`[Email] Attempting to send order confirmation to ${data.email} for order #${data.orderNumber}`);

    const { data: responseData, error } = await client.emails.send(emailOptions);

    if (error) {
      console.error('[Email] Failed to send order confirmation:', JSON.stringify(error));
      return false;
    }

    console.log(`[Email] Order confirmation sent successfully to ${data.email} for order #${data.orderNumber}`, responseData);
    return true;
  } catch (error) {
    console.error('Failed to send order confirmation:', error);
    return false;
  }
}
