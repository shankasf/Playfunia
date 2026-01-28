import PDFDocument from 'pdfkit';
import { createHash, randomBytes } from 'crypto';

import { ReceiptRepository, type Receipt } from '../repositories';
import { appConfig } from '../config/env';

export interface ReceiptItem {
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
  codes?: string[];
}

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  customerName: string;
  customerEmail: string;
  items: ReceiptItem[];
  subtotal: number;
  taxAmount?: number;
  discounts: Array<{ label: string; amount: number }>;
  total: number;
  paymentMethod: string;
  paymentId: string;
}

// Receipt number prefixes by purchase type
type PurchaseType = 'membership' | 'ticket' | 'booking';
const RECEIPT_PREFIXES: Record<PurchaseType, string> = {
  membership: 'MR',
  ticket: 'TR',
  booking: 'BR',
};

/**
 * Generate a unique receipt number
 * Format: {PREFIX}-YYYYMMDDHHmm-XXXXXXXX
 */
export function generateReceiptNumber(purchaseType: PurchaseType): string {
  const prefix = RECEIPT_PREFIXES[purchaseType];
  const timestamp = new Date().toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 12); // YYYYMMDDHHmm
  const randomPart = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}-${randomPart}`;
}

/**
 * Generate verification hash for receipt authenticity
 * Uses SHA-256 of: {receiptNumber}:{customerId}:{total}:{createdAt}:{secretKey}
 */
export function generateVerificationHash(
  receiptNumber: string,
  customerId: number | null,
  total: number,
  createdAt: string
): string {
  const secretKey = appConfig.jwtSecret || 'playfunia-receipt-secret';
  const data = `${receiptNumber}:${customerId ?? 'guest'}:${total}:${createdAt}:${secretKey}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Verify a receipt's authenticity using its hash
 */
export function verifyReceiptHash(receipt: Receipt): boolean {
  const expectedHash = generateVerificationHash(
    receipt.receipt_number,
    receipt.customer_id,
    receipt.total_usd,
    receipt.created_at
  );
  return receipt.verification_hash === expectedHash;
}

/**
 * Create a receipt record in the database
 */
export async function createReceiptRecord(data: {
  purchaseType: PurchaseType;
  referenceId: number;
  customerId?: number | null;
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paymentMethod?: string;
  paymentId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ receipt: Receipt; receiptNumber: string }> {
  console.log('[ReceiptService] Creating receipt record:', {
    purchaseType: data.purchaseType,
    referenceId: data.referenceId,
    customerId: data.customerId,
    total: data.total,
  });

  const receiptNumber = generateReceiptNumber(data.purchaseType);
  console.log('[ReceiptService] Generated receipt number:', receiptNumber);

  const createdAt = new Date().toISOString();
  const verificationHash = generateVerificationHash(
    receiptNumber,
    data.customerId ?? null,
    data.total,
    createdAt
  );
  console.log('[ReceiptService] Generated verification hash');

  try {
    const receipt = await ReceiptRepository.create({
      receipt_number: receiptNumber,
      customer_id: data.customerId ?? null,
      purchase_type: data.purchaseType,
      reference_id: data.referenceId,
      subtotal_usd: data.subtotal,
      discount_usd: data.discount ?? 0,
      tax_usd: data.tax ?? 0,
      total_usd: data.total,
      payment_method: data.paymentMethod,
      payment_id: data.paymentId,
      verification_hash: verificationHash,
      metadata: data.metadata ?? {},
    });

    console.log('[ReceiptService] Receipt created successfully:', receipt.receipt_id);
    return { receipt, receiptNumber };
  } catch (error) {
    const err = error as Error & { code?: string; details?: string; hint?: string; message?: string };
    console.error('[ReceiptService] Failed to create receipt in database:', {
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint,
    });
    throw error;
  }
}

/**
 * Lookup and verify a receipt by receipt number
 */
export async function lookupReceipt(receiptNumber: string): Promise<{
  found: boolean;
  valid: boolean;
  receipt?: Receipt & { customers: { full_name: string; email: string | null } | null };
}> {
  const receipt = await ReceiptRepository.findByReceiptNumber(receiptNumber);

  if (!receipt) {
    return { found: false, valid: false };
  }

  const isValid = verifyReceiptHash(receipt);

  return {
    found: true,
    valid: isValid,
    receipt: isValid ? receipt : undefined,
  };
}

// ============= Membership Receipt PDF =============

export interface MembershipReceiptData {
  receiptNumber: string;
  date: string;
  customerName: string;
  customerEmail: string;
  planName: string;
  monthlyPrice: number;
  durationMonths: number;
  subtotal: number;
  total: number;
  paymentMethod: string;
  paymentId: string;
  startDate: string;
  expiryDate: string;
  benefits?: string[];
}

/**
 * Generate a PDF receipt for membership purchases
 * All content fits on a single page
 */
export async function generateMembershipReceiptPDF(data: MembershipReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        bufferPages: true, // Buffer pages to control output
        autoFirstPage: true,
        info: {
          Title: `Playfunia Membership Receipt - ${data.receiptNumber}`,
          Author: 'Playfunia',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#7c3aed';
      const textColor = '#1a1a2e';
      const grayColor = '#6b7280';
      const lightGray = '#f3f4f6';

      // Page dimensions
      const margin = 40;
      const pageWidth = 595;
      const contentWidth = pageWidth - (margin * 2);

      // ===== HEADER =====
      doc
        .fillColor(primaryColor)
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('Playfunia', margin, margin, { continued: false });

      doc
        .fillColor(grayColor)
        .fontSize(8)
        .font('Helvetica')
        .text('Indoor Play & Adventure Club', margin, margin + 24);

      // Receipt title - right side
      doc
        .fillColor(textColor)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('Membership Receipt', margin, margin, { align: 'right', width: contentWidth });

      doc
        .fillColor(grayColor)
        .fontSize(8)
        .font('Helvetica')
        .text(`#${data.receiptNumber}`, margin, margin + 18, { align: 'right', width: contentWidth })
        .text(data.date, margin, margin + 28, { align: 'right', width: contentWidth });

      // Divider
      let y = 85;
      doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#e5e7eb').stroke();

      // ===== CUSTOMER INFO =====
      y += 10;
      doc.fillColor(grayColor).fontSize(8).font('Helvetica').text('BILL TO', margin, y);
      y += 10;
      doc.fillColor(textColor).fontSize(10).font('Helvetica-Bold').text(data.customerName, margin, y);
      y += 12;
      doc.fillColor(grayColor).fontSize(8).font('Helvetica').text(data.customerEmail, margin, y);

      // ===== MEMBERSHIP TABLE =====
      y += 20;
      doc.rect(margin, y, contentWidth, 18).fill(lightGray);
      doc.fillColor(textColor).fontSize(8).font('Helvetica-Bold')
        .text('Membership Plan', margin + 8, y + 5)
        .text('Duration', 280, y + 5)
        .text('Total', pageWidth - margin - 60, y + 5, { align: 'right', width: 50 });

      y += 22;
      doc.font('Helvetica').fontSize(8).fillColor(textColor)
        .text(`${data.planName} Membership`, margin + 8, y)
        .text(`${data.durationMonths} month${data.durationMonths > 1 ? 's' : ''}`, 280, y)
        .text(`$${data.total.toFixed(2)}`, pageWidth - margin - 60, y, { align: 'right', width: 50 });

      y += 12;
      doc.fillColor(grayColor).fontSize(7).text(`$${data.monthlyPrice.toFixed(2)}/month`, margin + 12, y);

      // Divider
      y += 12;
      doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#e5e7eb').stroke();

      // ===== TWO COLUMN LAYOUT =====
      y += 12;
      const leftX = margin;
      const rightX = 300;
      const colStartY = y;

      // LEFT: Membership Period
      doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold').text('Membership Period', leftX, y);
      y += 12;
      doc.fillColor(grayColor).fontSize(8).font('Helvetica')
        .text(`Start: ${data.startDate}`, leftX + 4, y);
      y += 10;
      doc.text(`Expiry: ${data.expiryDate}`, leftX + 4, y);

      // LEFT: Benefits (compact, max 4)
      if (data.benefits && data.benefits.length > 0) {
        y += 14;
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold').text('Benefits', leftX, y);
        y += 10;
        doc.fillColor(grayColor).fontSize(7).font('Helvetica');
        const benefits = data.benefits!;
        const maxBenefits = Math.min(benefits.length, 4);
        for (let i = 0; i < maxBenefits; i++) {
          const b = benefits[i]!;
          // Truncate long benefits
          const benefit = b.length > 35 ? b.substring(0, 32) + '...' : b;
          doc.text(`• ${benefit}`, leftX + 4, y);
          y += 9;
        }
        if (benefits.length > 4) {
          doc.text(`  +${benefits.length - 4} more`, leftX + 4, y);
        }
      }

      // RIGHT: Payment Summary
      let rY = colStartY;
      doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold').text('Payment Summary', rightX, rY);
      rY += 14;
      doc.fillColor(grayColor).fontSize(8).font('Helvetica').text('Subtotal', rightX, rY);
      doc.fillColor(textColor).text(`$${data.subtotal.toFixed(2)}`, rightX + 150, rY, { align: 'right', width: 50 });

      // Total box
      rY += 16;
      doc.rect(rightX, rY, 210, 22).fill(primaryColor);
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
        .text('Total Paid', rightX + 8, rY + 6)
        .text(`$${data.total.toFixed(2)}`, rightX + 150, rY + 6, { align: 'right', width: 50 });

      // Payment info
      rY += 28;
      doc.fillColor(grayColor).fontSize(7).font('Helvetica')
        .text(`Payment: ${data.paymentMethod}`, rightX, rY)
        .text(`ID: ${data.paymentId}`, rightX, rY + 9);

      // ===== FOOTER (fixed at bottom) =====
      const footerY = 380;
      doc.moveTo(margin, footerY).lineTo(pageWidth - margin, footerY).strokeColor('#e5e7eb').stroke();
      doc.fillColor(grayColor).fontSize(7).font('Helvetica')
        .text('Thank you for joining the Playfunia family!', margin, footerY + 8, { align: 'center', width: contentWidth })
        .text('Questions? playfunia@playfunia.com | www.playfunia.com', margin, footerY + 18, { align: 'center', width: contentWidth });

      // Ensure only first page is output
      const range = doc.bufferedPageRange();
      if (range.count > 1) {
        // If multiple pages were created, we only want the first
        console.warn('[ReceiptService] PDF had multiple pages, truncating to 1');
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ============= Booking Receipt PDF =============

export interface BookingReceiptData {
  receiptNumber: string;
  date: string;
  customerName: string;
  customerEmail: string;
  bookingReference: string;
  packageName: string;
  eventDate: string;
  startTime: string;
  location: string;
  guestCount: number;
  subtotal: number;
  cleaningFee?: number;
  addOns?: Array<{ name: string; price: number; quantity: number }>;
  depositAmount: number;
  balanceRemaining: number;
  total: number;
  paymentMethod: string;
  paymentId: string;
  // Package details for comprehensive PDF
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

/**
 * Generate a PDF receipt for party booking deposits
 * Includes full package details on page 2 if package info is provided
 */
export async function generateBookingReceiptPDF(data: BookingReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Playfunia Booking Receipt - ${data.receiptNumber}`,
          Author: 'Playfunia',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#7c3aed';
      const textColor = '#1a1a2e';
      const grayColor = '#6b7280';
      const lightGray = '#f3f4f6';
      const warningColor = '#f59e0b';
      const successColor = '#22c55e';
      const margin = 50;
      const pageWidth = 595;
      const contentWidth = pageWidth - (margin * 2);

      // ==================== PAGE 1: RECEIPT ====================

      // Header
      doc
        .fillColor(primaryColor)
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('Playfunia', margin, margin);

      doc
        .fillColor(grayColor)
        .fontSize(9)
        .font('Helvetica')
        .text('Indoor Play & Adventure Club', margin, margin + 26);

      // Receipt title - right
      doc
        .fillColor(textColor)
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('Party Booking Receipt', margin, margin, { align: 'right', width: contentWidth });

      doc
        .fillColor(grayColor)
        .fontSize(9)
        .font('Helvetica')
        .text(`#${data.receiptNumber}`, margin, margin + 20, { align: 'right', width: contentWidth })
        .text(data.date, margin, margin + 32, { align: 'right', width: contentWidth });

      // Divider
      let y = 95;
      doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#e5e7eb').stroke();

      // Customer info (left) and Booking ref (right)
      y += 12;
      doc.fillColor(grayColor).fontSize(8).font('Helvetica').text('BILL TO', margin, y);
      doc.text('BOOKING REF', margin, y, { align: 'right', width: contentWidth });

      y += 12;
      doc.fillColor(textColor).fontSize(11).font('Helvetica-Bold').text(data.customerName, margin, y);
      doc.fillColor(primaryColor).text(data.bookingReference, margin, y, { align: 'right', width: contentWidth });

      y += 14;
      doc.fillColor(grayColor).fontSize(9).font('Helvetica').text(data.customerEmail, margin, y);

      // Party Details Box
      y += 25;
      doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('Party Details', margin, y);

      y += 15;
      doc.rect(margin, y, contentWidth, 70).fill(lightGray);

      const col1 = margin + 10;
      const col2 = margin + 260;

      y += 12;
      doc.fillColor(textColor).fontSize(9).font('Helvetica');
      doc.text('Package:', col1, y);
      doc.font('Helvetica-Bold').text(data.packageName, col1 + 60, y);
      doc.font('Helvetica').text('Date:', col2, y);
      doc.font('Helvetica-Bold').text(data.eventDate, col2 + 55, y);

      y += 18;
      doc.font('Helvetica').text('Time:', col1, y);
      doc.font('Helvetica-Bold').text(data.startTime, col1 + 60, y);
      doc.font('Helvetica').text('Location:', col2, y);
      doc.font('Helvetica-Bold').text(data.location, col2 + 55, y);

      y += 18;
      doc.font('Helvetica').text('Guests:', col1, y);
      doc.font('Helvetica-Bold').text(String(data.guestCount), col1 + 60, y);

      // Line items header
      y += 35;
      doc.rect(margin, y, contentWidth, 20).fill(lightGray);
      doc.fillColor(textColor).fontSize(9).font('Helvetica-Bold')
        .text('Item', margin + 10, y + 6)
        .text('Amount', margin + contentWidth - 75, y + 6, { align: 'right', width: 65 });

      // Package line item
      y += 25;
      doc.font('Helvetica').fontSize(9).fillColor(textColor)
        .text(data.packageName, margin + 10, y)
        .text(`$${data.subtotal.toFixed(2)}`, margin + contentWidth - 75, y, { align: 'right', width: 65 });

      y += 16;

      // Add-ons
      if (data.addOns && data.addOns.length > 0) {
        for (const addon of data.addOns) {
          const addonTotal = addon.price * addon.quantity;
          doc.fillColor(grayColor)
            .text(`  ${addon.name}${addon.quantity > 1 ? ` x${addon.quantity}` : ''}`, margin + 10, y)
            .text(`$${addonTotal.toFixed(2)}`, margin + contentWidth - 75, y, { align: 'right', width: 65 });
          y += 14;
        }
      }

      // Cleaning fee
      if (data.cleaningFee && data.cleaningFee > 0) {
        doc.fillColor(grayColor)
          .text('  Cleaning Fee', margin + 10, y)
          .text(`$${data.cleaningFee.toFixed(2)}`, margin + contentWidth - 75, y, { align: 'right', width: 65 });
        y += 14;
      }

      // Divider
      y += 5;
      doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#e5e7eb').stroke();

      // Summary section
      y += 12;
      const sumX = margin + 320;
      const valX = margin + contentWidth - 75;

      // Total paid box (green success box)
      y += 4;
      doc.rect(sumX - 10, y, 185, 35).fill(successColor);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica')
        .text('Total Paid', sumX, y + 8);
      doc.fontSize(14).font('Helvetica-Bold')
        .text(`$${data.total.toFixed(2)}`, valX, y + 6, { align: 'right', width: 65 });
      doc.fontSize(8).font('Helvetica')
        .text('Payment complete - no balance due', sumX, y + 24);

      // Payment info
      y += 50;
      doc.fillColor(grayColor).fontSize(8).font('Helvetica')
        .text(`Payment: ${data.paymentMethod}  |  Transaction ID: ${data.paymentId}`, margin, y);

      // Page 1 Footer
      y += 30;
      doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#e5e7eb').stroke();
      doc.fillColor(grayColor).fontSize(8).font('Helvetica')
        .text('We can\'t wait to celebrate with you!', margin, y + 10, { align: 'center', width: contentWidth })
        .text('playfunia@playfunia.com | www.playfunia.com', margin, y + 22, { align: 'center', width: contentWidth });

      // ==================== PAGE 2: PACKAGE DETAILS ====================
      if (data.packageDetails) {
        doc.addPage();

        // Header
        doc
          .fillColor(primaryColor)
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('Playfunia', margin, margin);

        doc
          .fillColor(grayColor)
          .fontSize(9)
          .font('Helvetica')
          .text('Indoor Play & Adventure Club', margin, margin + 26);

        // Page title
        doc
          .fillColor(textColor)
          .fontSize(16)
          .font('Helvetica-Bold')
          .text('Package Details', margin, margin, { align: 'right', width: contentWidth });

        doc
          .fillColor(grayColor)
          .fontSize(9)
          .font('Helvetica')
          .text(`Booking: ${data.bookingReference}`, margin, margin + 20, { align: 'right', width: contentWidth });

        // Divider
        y = 95;
        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#e5e7eb').stroke();

        // Package name header
        y += 20;
        doc.rect(margin, y, contentWidth, 40).fill(primaryColor);
        doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
          .text(data.packageName, margin, y + 12, { align: 'center', width: contentWidth });

        // Package info
        y += 55;
        doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Package Includes', margin, y);

        y += 20;
        const pkg = data.packageDetails;
        const checkMark = '✓';
        const crossMark = '✗';

        // Create a nice grid of included items
        doc.fontSize(10).font('Helvetica');

        const inclusions = [
          { label: 'Base Price', value: `$${pkg.priceUsd.toFixed(2)}`, always: true },
          { label: 'Children Included', value: `${pkg.baseChildren} kids`, always: true },
          { label: 'Party Room Time', value: `${pkg.baseRoomHours} hour${pkg.baseRoomHours > 1 ? 's' : ''}`, always: true },
          { label: 'Food & Pizza', value: pkg.includesFood ? checkMark : crossMark, included: pkg.includesFood },
          { label: 'Drinks & Beverages', value: pkg.includesDrinks ? checkMark : crossMark, included: pkg.includesDrinks },
          { label: 'Decorations', value: pkg.includesDecor ? checkMark : crossMark, included: pkg.includesDecor },
        ];

        for (const item of inclusions) {
          doc.rect(margin, y, contentWidth, 28).fill(lightGray);

          doc.fillColor(textColor).font('Helvetica-Bold').text(item.label, margin + 15, y + 9);

          if (item.always) {
            doc.fillColor(primaryColor).font('Helvetica-Bold').text(item.value, margin + contentWidth - 150, y + 9, { align: 'right', width: 130 });
          } else {
            const color = item.included ? successColor : '#dc2626';
            doc.fillColor(color).font('Helvetica-Bold').text(item.value, margin + contentWidth - 150, y + 9, { align: 'right', width: 130 });
          }

          y += 32;
        }

        // Notes section if available
        if (pkg.notes) {
          y += 15;
          doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Additional Notes', margin, y);

          y += 18;
          doc.rect(margin, y, contentWidth, 80).fill('#fef3c7');
          doc.fillColor('#92400e').fontSize(10).font('Helvetica')
            .text(pkg.notes, margin + 15, y + 12, { width: contentWidth - 30 });
          y += 90;
        }

        // Important reminders
        y += 20;
        doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Important Reminders', margin, y);

        y += 18;
        doc.fillColor(grayColor).fontSize(9).font('Helvetica');
        const reminders = [
          '• Please arrive 15 minutes before your scheduled party time',
          '• Bring socks for all children (required for play areas)',
          '• Let us know about any food allergies in advance',
          '• Decorations can be set up 30 minutes before the party starts',
        ];
        for (const reminder of reminders) {
          doc.text(reminder, margin + 10, y);
          y += 14;
        }

        // Page 2 Footer
        y = 750;
        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#e5e7eb').stroke();
        doc.fillColor(grayColor).fontSize(8).font('Helvetica')
          .text('Thank you for choosing Playfunia for your celebration!', margin, y + 10, { align: 'center', width: contentWidth })
          .text('playfunia@playfunia.com | www.playfunia.com', margin, y + 22, { align: 'center', width: contentWidth });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate a PDF receipt buffer
 */
export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Playfunia Receipt - ${data.receiptNumber}`,
          Author: 'Playfunia',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#7c3aed';
      const textColor = '#1a1a2e';
      const grayColor = '#6b7280';
      const lightGray = '#f3f4f6';

      // Header
      doc
        .fillColor(primaryColor)
        .fontSize(28)
        .font('Helvetica-Bold')
        .text('Playfunia', 50, 50);

      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text('Indoor Play & Adventure Club', 50, 82);

      // Receipt title
      doc
        .fillColor(textColor)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('Receipt', 400, 50, { align: 'right' });

      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text(`#${data.receiptNumber}`, 400, 75, { align: 'right' })
        .text(data.date, 400, 88, { align: 'right' });

      // Divider
      doc
        .moveTo(50, 115)
        .lineTo(545, 115)
        .strokeColor('#e5e7eb')
        .stroke();

      // Customer info
      let y = 135;
      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text('BILL TO', 50, y);

      y += 15;
      doc
        .fillColor(textColor)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(data.customerName, 50, y);

      y += 15;
      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text(data.customerEmail, 50, y);

      // Items table header
      y = 200;
      doc
        .rect(50, y, 495, 25)
        .fill(lightGray);

      doc
        .fillColor(textColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Item', 60, y + 8)
        .text('Qty', 320, y + 8, { align: 'center', width: 50 })
        .text('Price', 380, y + 8, { align: 'right', width: 70 })
        .text('Total', 460, y + 8, { align: 'right', width: 75 });

      // Items
      y += 30;
      doc.font('Helvetica').fontSize(10);

      for (const item of data.items) {
        doc
          .fillColor(textColor)
          .text(item.label, 60, y, { width: 250 })
          .text(item.quantity.toString(), 320, y, { align: 'center', width: 50 })
          .text(`$${item.unitPrice.toFixed(2)}`, 380, y, { align: 'right', width: 70 })
          .text(`$${item.total.toFixed(2)}`, 460, y, { align: 'right', width: 75 });

        y += 20;

        // Show entry codes if present
        if (item.codes && item.codes.length > 0) {
          doc
            .fillColor(grayColor)
            .fontSize(9)
            .text(`Entry codes: ${item.codes.join(', ')}`, 70, y, { width: 380 });
          y += 15;
        }

        // Divider between items
        doc
          .moveTo(50, y + 5)
          .lineTo(545, y + 5)
          .strokeColor('#e5e7eb')
          .stroke();

        y += 15;
      }

      // Summary section
      y += 10;
      const summaryX = 380;
      const valueX = 460;

      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text('Subtotal', summaryX, y)
        .fillColor(textColor)
        .text(`$${data.subtotal.toFixed(2)}`, valueX, y, { align: 'right', width: 75 });

      // Discounts
      for (const discount of data.discounts) {
        y += 18;
        doc
          .fillColor(grayColor)
          .text(discount.label, summaryX, y)
          .fillColor('#22c55e')
          .text(`-$${discount.amount.toFixed(2)}`, valueX, y, { align: 'right', width: 75 });
      }

      // Tax
      if (data.taxAmount !== undefined && data.taxAmount > 0) {
        y += 18;
        doc
          .fillColor(grayColor)
          .text('Tax (8%)', summaryX, y)
          .fillColor(textColor)
          .text(`$${data.taxAmount.toFixed(2)}`, valueX, y, { align: 'right', width: 75 });
      }

      // Total
      y += 25;
      doc
        .rect(summaryX - 10, y - 5, 175, 30)
        .fill(primaryColor);

      doc
        .fillColor('#ffffff')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Total Paid', summaryX, y + 3)
        .text(`$${data.total.toFixed(2)}`, valueX, y + 3, { align: 'right', width: 75 });

      // Payment info
      y += 50;
      doc
        .fillColor(grayColor)
        .fontSize(9)
        .font('Helvetica')
        .text('Payment Method: ' + data.paymentMethod, 50, y)
        .text('Transaction ID: ' + data.paymentId, 50, y + 12);

      // Footer
      const footerY = 750;
      doc
        .moveTo(50, footerY)
        .lineTo(545, footerY)
        .strokeColor('#e5e7eb')
        .stroke();

      doc
        .fillColor(grayColor)
        .fontSize(9)
        .font('Helvetica')
        .text('Thank you for choosing Playfunia!', 50, footerY + 15, { align: 'center', width: 495 })
        .text('Questions? Contact us at playfunia@playfunia.com', 50, footerY + 28, { align: 'center', width: 495 })
        .text('www.playfunia.com', 50, footerY + 41, { align: 'center', width: 495 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
