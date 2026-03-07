import PDFDocument from 'pdfkit';
import { createHash, randomBytes } from 'crypto';

import { ReceiptRepository, type Receipt } from '../repositories';
import { appConfig } from '../config/env';
import { logger } from '../utils/logger';

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
  taxRate?: number; // Tax rate as percentage (e.g., 8 for 8%)
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
  const secretKey = appConfig.jwtSecret;
  if (!secretKey) throw new Error('JWT_SECRET is required for receipt verification');
  const data = `${receiptNumber}:${customerId ?? 'guest'}:${total}:${createdAt}:${secretKey}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Normalize timestamp to ISO format for consistent hashing
 * Converts "+00:00" suffix to "Z" for consistency
 */
function normalizeTimestamp(timestamp: string): string {
  // Convert PostgreSQL format (+00:00) to JavaScript ISO format (Z)
  return new Date(timestamp).toISOString();
}

/**
 * Verify a receipt's authenticity using its hash
 */
export function verifyReceiptHash(receipt: Receipt): boolean {
  // Normalize the timestamp to ensure consistent format for hash comparison
  const normalizedCreatedAt = normalizeTimestamp(receipt.created_at);
  const expectedHash = generateVerificationHash(
    receipt.receipt_number,
    receipt.customer_id,
    receipt.total_usd,
    normalizedCreatedAt
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
  logger.info({
    purchaseType: data.purchaseType,
    referenceId: data.referenceId,
    total: data.total,
  }, 'Creating receipt record');

  const receiptNumber = generateReceiptNumber(data.purchaseType);
  logger.debug({ receiptNumber }, 'Generated receipt number');

  const createdAt = new Date().toISOString();
  const verificationHash = generateVerificationHash(
    receiptNumber,
    data.customerId ?? null,
    data.total,
    createdAt
  );
  logger.debug('Generated verification hash');

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
      created_at: createdAt, // Pass the same timestamp used for hash calculation
    });

    logger.info({ receiptId: receipt.receipt_id }, 'Receipt created successfully');
    return { receipt, receiptNumber };
  } catch (error) {
    const err = error as Error & { code?: string; details?: string; hint?: string; message?: string };
    logger.error({
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint,
    }, 'Failed to create receipt in database');
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
  taxAmount: number;
  taxRate?: number; // Tax rate as percentage (e.g., 8 for 8%)
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
      doc.font('Helvetica').fontSize(8).fillColor(textColor);
      const planLabel = `${data.planName} Membership`;
      const planLabelHeight = doc.heightOfString(planLabel, { width: 230 });
      doc
        .text(planLabel, margin + 8, y, { width: 230 })
        .text(`${data.durationMonths} month${data.durationMonths > 1 ? 's' : ''}`, 280, y)
        .text(`$${data.total.toFixed(2)}`, pageWidth - margin - 60, y, { align: 'right', width: 50 });

      y += Math.max(12, planLabelHeight + 4);
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

      // Tax line
      rY += 12;
      const taxLabel = data.taxRate ? `Tax (${data.taxRate}%)` : 'Tax';
      doc.fillColor(grayColor).fontSize(8).font('Helvetica').text(taxLabel, rightX, rY);
      doc.fillColor(textColor).text(`$${data.taxAmount.toFixed(2)}`, rightX + 150, rY, { align: 'right', width: 50 });

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
        logger.warn('PDF had multiple pages, truncating to 1');
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
  packageBasePrice?: number;
  eventDate: string;
  startTime: string;
  location: string;
  guestCount: number;
  subtotal: number;
  taxAmount?: number;
  taxRate?: number; // Tax rate as percentage (e.g., 8 for 8%)
  cleaningFee?: number;
  // Itemized extras
  extraChildren?: { count: number; unitPrice: number; total: number };
  extraAdults?: { count: number; unitPrice: number; total: number };
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
    features?: string[];
    additionalTerms?: Array<{ title: string; description: string }>;
    extraChildPrice?: number;
    extraAdultPrice?: number;
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

      // Package line item (base price)
      y += 25;
      const itemTextWidth = contentWidth - 90;
      const packagePrice = data.packageBasePrice ?? data.packageDetails?.priceUsd ?? data.subtotal;
      doc.font('Helvetica').fontSize(9).fillColor(textColor);
      const pkgNameHeight = doc.heightOfString(data.packageName, { width: itemTextWidth });
      doc
        .text(data.packageName, margin + 10, y, { width: itemTextWidth })
        .text(`$${packagePrice.toFixed(2)}`, margin + contentWidth - 75, y, { align: 'right', width: 65 });

      y += Math.max(16, pkgNameHeight + 6);

      // Extra Children
      if (data.extraChildren && data.extraChildren.count > 0) {
        const extraChildLabel = `Extra Children (${data.extraChildren.count} × $${data.extraChildren.unitPrice.toFixed(2)})`;
        doc.fillColor(grayColor)
          .text(extraChildLabel, margin + 10, y, { width: itemTextWidth })
          .text(`$${data.extraChildren.total.toFixed(2)}`, margin + contentWidth - 75, y, { align: 'right', width: 65 });
        y += 14;
      }

      // Extra Adults
      if (data.extraAdults && data.extraAdults.count > 0) {
        const extraAdultLabel = `Extra Adults (${data.extraAdults.count} × $${data.extraAdults.unitPrice.toFixed(2)})`;
        doc.fillColor(grayColor)
          .text(extraAdultLabel, margin + 10, y, { width: itemTextWidth })
          .text(`$${data.extraAdults.total.toFixed(2)}`, margin + contentWidth - 75, y, { align: 'right', width: 65 });
        y += 14;
      }

      // Add-ons
      if (data.addOns && data.addOns.length > 0) {
        for (const addon of data.addOns) {
          const addonTotal = addon.price * addon.quantity;
          const addonLabel = `${addon.name}${addon.quantity > 1 ? ` (${addon.quantity} × $${addon.price.toFixed(2)})` : ''}`;
          const addonHeight = doc.heightOfString(addonLabel, { width: itemTextWidth });
          doc.fillColor(grayColor)
            .text(addonLabel, margin + 10, y, { width: itemTextWidth })
            .text(`$${addonTotal.toFixed(2)}`, margin + contentWidth - 75, y, { align: 'right', width: 65 });
          y += Math.max(14, addonHeight + 4);
        }
      }

      // Divider
      y += 5;
      doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#e5e7eb').stroke();

      // Summary section
      y += 12;
      const sumX = margin + 320;
      const valX = margin + contentWidth - 75;

      // Subtotal
      doc.fillColor(grayColor).fontSize(9).font('Helvetica')
        .text('Subtotal', sumX, y);
      doc.fillColor(textColor).text(`$${data.subtotal.toFixed(2)}`, valX, y, { align: 'right', width: 65 });

      // Cleaning fee
      if (data.cleaningFee && data.cleaningFee > 0) {
        y += 14;
        doc.fillColor(grayColor).fontSize(9).font('Helvetica')
          .text('Cleaning Fee', sumX, y);
        doc.fillColor(textColor).text(`$${data.cleaningFee.toFixed(2)}`, valX, y, { align: 'right', width: 65 });
      }

      // Tax
      if (data.taxAmount !== undefined && data.taxAmount > 0) {
        y += 14;
        const taxLabel = data.taxRate ? `Tax (${data.taxRate}%)` : 'Tax';
        doc.fillColor(grayColor).fontSize(9).font('Helvetica')
          .text(taxLabel, sumX, y);
        doc.fillColor(textColor).text(`$${data.taxAmount.toFixed(2)}`, valX, y, { align: 'right', width: 65 });
      }

      // Total paid box (green success box)
      y += 18;
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
        doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('What\'s Included in Your Package', margin, y);

        y += 20;
        const pkg = data.packageDetails;
        const pkgName = data.packageName.toLowerCase();

        // Base info rows
        const baseInfo: Array<{ label: string; value: string; highlight?: boolean }> = [
          { label: 'Base Price', value: `$${pkg.priceUsd.toFixed(2)}` },
          { label: 'Children Included', value: `${pkg.baseChildren} kids` },
          { label: 'Party Room Time', value: `${pkg.baseRoomHours} hour${pkg.baseRoomHours > 1 ? 's' : ''}` },
          { label: 'All-Day Park Access', value: 'Unlimited' },
        ];

        // Add extra children if booked
        if (data.extraChildren && data.extraChildren.count > 0) {
          baseInfo.push({
            label: 'Extra Children Added',
            value: `${data.extraChildren.count} kid${data.extraChildren.count > 1 ? 's' : ''} (+$${data.extraChildren.total.toFixed(2)})`,
            highlight: true,
          });
        }

        // Add extra adults if booked
        if (data.extraAdults && data.extraAdults.count > 0) {
          baseInfo.push({
            label: 'Extra Guests Added',
            value: `${data.extraAdults.count} guest${data.extraAdults.count > 1 ? 's' : ''} (+$${data.extraAdults.total.toFixed(2)})`,
            highlight: true,
          });
        }

        doc.fontSize(10).font('Helvetica');
        for (const item of baseInfo) {
          const bgColor = item.highlight ? '#ecfdf5' : lightGray; // Light green for extras
          const valueColor = item.highlight ? successColor : primaryColor;
          doc.rect(margin, y, contentWidth, 28).fill(bgColor);
          doc.fillColor(textColor).font('Helvetica-Bold').text(item.label, margin + 15, y + 9);
          doc.fillColor(valueColor).font('Helvetica-Bold').text(item.value, margin + contentWidth - 200, y + 9, { align: 'right', width: 180 });
          y += 32;
        }

        // Package-specific features (from database)
        const features = pkg.features ?? [];
        if (features.length > 0) {
          y += 10;
          doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Package Features', margin, y);
          y += 18;
          doc.fontSize(9).font('Helvetica').fillColor(textColor);

          for (const feature of features) {
            doc.text(`• ${feature}`, margin + 10, y, { width: contentWidth - 20 });
            y += 16;
          }
        }

        // Additional Terms (from database)
        const additionalTerms = pkg.additionalTerms ?? [];
        if (additionalTerms.length > 0) {
          y += 15;
          doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Additional Terms', margin, y);
          y += 18;
          doc.fontSize(9).font('Helvetica').fillColor(textColor);

          for (let i = 0; i < additionalTerms.length; i++) {
            const term = additionalTerms[i]!;
            doc.font('Helvetica-Bold').text(`${i + 1}. ${term.title}`, margin + 10, y, { continued: true });
            doc.font('Helvetica').text(` — ${term.description}`, { width: contentWidth - 30 });
            y += 16;
          }
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

      // Items section title
      y = 195;
      doc
        .fillColor(primaryColor)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Purchase Details', 50, y);

      // Items table header
      y += 18;
      doc
        .rect(50, y, 495, 22)
        .fill(lightGray);

      doc
        .fillColor(textColor)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('Description', 60, y + 6)
        .text('Qty', 300, y + 6, { align: 'center', width: 40 })
        .text('Unit Price', 350, y + 6, { align: 'right', width: 70 })
        .text('Amount', 460, y + 6, { align: 'right', width: 75 });

      // Items
      y += 26;
      doc.font('Helvetica').fontSize(10);

      let itemsSubtotal = 0;
      for (const item of data.items) {
        // Measure description height to handle text wrapping
        doc.font('Helvetica-Bold').fontSize(10);
        const descHeight = doc.heightOfString(item.label, { width: 230 });

        // Item description (left column, constrained width)
        doc
          .fillColor(textColor)
          .text(item.label, 60, y, { width: 230 });

        // Qty, Unit Price, Amount on the same starting y
        doc
          .font('Helvetica')
          .fillColor(grayColor)
          .text(item.quantity.toString(), 300, y, { align: 'center', width: 40 })
          .text(`$${item.unitPrice.toFixed(2)}`, 350, y, { align: 'right', width: 70 });

        doc
          .fillColor(textColor)
          .font('Helvetica-Bold')
          .text(`$${item.total.toFixed(2)}`, 460, y, { align: 'right', width: 75 });

        itemsSubtotal += item.total;
        y += Math.max(18, descHeight + 6);

        // Show calculation breakdown for items with quantity > 1
        if (item.quantity > 1) {
          doc
            .fillColor(grayColor)
            .fontSize(8)
            .font('Helvetica')
            .text(`(${item.quantity} × $${item.unitPrice.toFixed(2)})`, 70, y);
          y += 14;
        }

        // Show entry codes if present
        if (item.codes && item.codes.length > 0) {
          doc.fontSize(8);
          doc
            .fillColor(primaryColor)
            .font('Helvetica-Bold')
            .text('Entry Codes:', 70, y);
          doc
            .fillColor(textColor)
            .font('Helvetica')
            .text(item.codes.join(', '), 140, y, { width: 340 });
          const codesHeight = doc.heightOfString(item.codes.join(', '), { width: 340 });
          y += Math.max(14, codesHeight + 4);
        }

        // Reset font size for next item
        doc.fontSize(10);

        // Light divider between items
        y += 4;
        doc
          .moveTo(60, y)
          .lineTo(535, y)
          .strokeColor('#e5e7eb')
          .lineWidth(0.5)
          .stroke();

        y += 10;
      }

      // Items subtotal line (if multiple items)
      if (data.items.length > 1) {
        doc
          .fillColor(grayColor)
          .fontSize(9)
          .font('Helvetica')
          .text('Items Subtotal', 350, y, { align: 'right', width: 100 });
        doc
          .fillColor(textColor)
          .font('Helvetica-Bold')
          .text(`$${itemsSubtotal.toFixed(2)}`, 460, y, { align: 'right', width: 75 });
        y += 18;
      }

      // Summary section with clear divider
      y += 5;
      doc
        .moveTo(300, y)
        .lineTo(545, y)
        .strokeColor('#cbd5e1')
        .lineWidth(1)
        .stroke();

      y += 12;
      const summaryX = 350;
      const valueX = 460;

      // Payment Summary header
      doc
        .fillColor(primaryColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Payment Summary', summaryX, y);

      y += 18;
      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text('Subtotal', summaryX, y);
      doc
        .fillColor(textColor)
        .text(`$${data.subtotal.toFixed(2)}`, valueX, y, { align: 'right', width: 75 });

      // Discounts (shown in green with savings highlight)
      for (const discount of data.discounts) {
        y += 16;
        doc
          .fillColor('#16a34a')
          .font('Helvetica')
          .text(discount.label, summaryX, y);
        doc
          .font('Helvetica-Bold')
          .text(`-$${discount.amount.toFixed(2)}`, valueX, y, { align: 'right', width: 75 });
      }

      // Tax
      if (data.taxAmount !== undefined && data.taxAmount > 0) {
        y += 16;
        const taxLabel = data.taxRate ? `Tax (${data.taxRate}%)` : 'Tax';
        doc
          .fillColor(grayColor)
          .font('Helvetica')
          .text(taxLabel, summaryX, y);
        doc
          .fillColor(textColor)
          .text(`$${data.taxAmount.toFixed(2)}`, valueX, y, { align: 'right', width: 75 });
      }

      // Total box with prominent styling
      y += 20;
      doc
        .rect(summaryX - 15, y - 3, 200, 32)
        .fill(primaryColor);

      doc
        .fillColor('#ffffff')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Total Paid', summaryX, y + 6);
      doc
        .fontSize(14)
        .text(`$${data.total.toFixed(2)}`, valueX, y + 4, { align: 'right', width: 75 });

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
