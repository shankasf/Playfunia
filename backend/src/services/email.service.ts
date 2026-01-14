// Email service - emails are now handled by Supabase Auth
// These functions are kept as stubs for backwards compatibility

// Generate 6-digit OTP
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send email verification OTP (stub - emails handled by Supabase)
export async function sendVerificationOTP(email: string, otp: string, firstName?: string): Promise<boolean> {
  console.log(`[Email] Verification OTP for ${email}: ${otp}${firstName ? ` (${firstName})` : ''}`);
  return true;
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
}

// Send booking confirmation email (stub)
export async function sendBookingConfirmation(data: BookingEmailData): Promise<boolean> {
  console.log(`[Email] Booking confirmation for ${data.email}: ${data.reference}`);
  console.log(`  - Guest: ${data.guestName}, Date: ${data.eventDate}, Package: ${data.packageName}`);
  return true;
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
  totalAmount: number;
  discounts?: Array<{ label: string; amount: number }>;
  purchaseDate: string;
}

// Send ticket confirmation email (stub)
export async function sendTicketConfirmation(data: TicketEmailData): Promise<boolean> {
  console.log(`[Email] Ticket confirmation for ${data.email}`);
  console.log(`  - Customer: ${data.customerName}, Total: $${data.totalAmount.toFixed(2)}`);
  return true;
}

// Membership confirmation data interface
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

// Send membership confirmation email (stub)
export async function sendMembershipConfirmation(data: MembershipEmailData): Promise<boolean> {
  console.log(`[Email] Membership confirmation for ${data.email}`);
  console.log(`  - Customer: ${data.customerName}, Tier: ${data.tierName}`);
  return true;
}

// Send password reset OTP (stub - handled by Supabase Auth)
export async function sendPasswordResetOTP(email: string, otp: string, firstName?: string): Promise<boolean> {
  console.log(`[Email] Password reset OTP for ${email}: ${otp}${firstName ? ` (${firstName})` : ''}`);
  return true;
}

// Check if email service is configured (always returns false since Resend is removed)
export function isEmailConfigured(): boolean {
  return false;
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
  discounts: Array<{ label: string; amount: number }>;
  total: number;
  paymentMethod: string;
  receiptPdf?: Buffer;
}

// Send order confirmation email (stub)
export async function sendOrderConfirmation(data: OrderConfirmationEmailData): Promise<boolean> {
  console.log(`[Email] Order confirmation for ${data.email}: Order #${data.orderNumber}`);
  console.log(`  - Customer: ${data.customerName}, Total: $${data.total.toFixed(2)}`);
  return true;
}
