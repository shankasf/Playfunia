import type { Request, Response, NextFunction } from 'express';

import { lookupReceipt, generateReceiptPDF, generateMembershipReceiptPDF, generateBookingReceiptPDF } from '../services/receipt.service';
import { ReceiptRepository } from '../repositories';
import { AppError } from '../utils/app-error';

/**
 * Verify a receipt by its receipt number
 * GET /api/receipts/verify/:receiptNumber
 */
export async function verifyReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const { receiptNumber } = req.params;

    if (!receiptNumber) {
      throw new AppError('Receipt number is required', 400);
    }

    const result = await lookupReceipt(receiptNumber);

    if (!result.found) {
      return res.status(404).json({
        found: false,
        valid: false,
        message: 'Receipt not found',
      });
    }

    if (!result.valid) {
      return res.status(400).json({
        found: true,
        valid: false,
        message: 'Receipt verification failed - receipt may have been tampered with',
      });
    }

    const receipt = result.receipt!;

    return res.json({
      found: true,
      valid: true,
      receipt: {
        receiptNumber: receipt.receipt_number,
        purchaseType: receipt.purchase_type,
        total: receipt.total_usd,
        subtotal: receipt.subtotal_usd,
        discount: receipt.discount_usd,
        tax: receipt.tax_usd,
        paymentMethod: receipt.payment_method,
        createdAt: receipt.created_at,
        customer: receipt.customers ? {
          name: receipt.customers.full_name,
          email: receipt.customers.email,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Download/regenerate PDF for a receipt
 * GET /api/receipts/:receiptNumber/pdf
 */
export async function downloadReceiptPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const receiptNumber = req.params.receiptNumber;

    if (!receiptNumber) {
      throw new AppError('Receipt number is required', 400);
    }

    const result = await lookupReceipt(receiptNumber);

    if (!result.found || !result.valid || !result.receipt) {
      throw new AppError('Receipt not found or invalid', 404);
    }

    const receipt = result.receipt;
    const metadata = receipt.metadata as Record<string, unknown>;
    const customerName = receipt.customers?.full_name ?? 'Customer';
    const customerEmail = receipt.customers?.email ?? '';
    const date = new Date(receipt.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let pdfBuffer: Buffer;

    switch (receipt.purchase_type) {
      case 'membership':
        pdfBuffer = await generateMembershipReceiptPDF({
          receiptNumber: receipt.receipt_number,
          date,
          customerName,
          customerEmail,
          planName: (metadata.planName as string) ?? 'Membership',
          monthlyPrice: (metadata.monthlyPrice as number) ?? 0,
          durationMonths: (metadata.durationMonths as number) ?? 1,
          subtotal: receipt.subtotal_usd,
          total: receipt.total_usd,
          paymentMethod: receipt.payment_method ?? 'Credit Card',
          paymentId: receipt.payment_id ?? '',
          startDate: (metadata.startDate as string) ?? '',
          expiryDate: (metadata.expiryDate as string) ?? '',
          benefits: (metadata.benefits as string[]) ?? undefined,
        });
        break;

      case 'booking':
        pdfBuffer = await generateBookingReceiptPDF({
          receiptNumber: receipt.receipt_number,
          date,
          customerName,
          customerEmail,
          bookingReference: (metadata.bookingReference as string) ?? '',
          packageName: (metadata.packageName as string) ?? 'Party Package',
          eventDate: (metadata.eventDate as string) ?? '',
          startTime: (metadata.startTime as string) ?? '',
          location: (metadata.location as string) ?? 'Albany',
          guestCount: (metadata.guestCount as number) ?? 0,
          subtotal: receipt.subtotal_usd,
          cleaningFee: (metadata.cleaningFee as number) ?? 0,
          addOns: (metadata.addOns as Array<{ name: string; price: number; quantity: number }>) ?? undefined,
          depositAmount: receipt.total_usd,
          balanceRemaining: (metadata.balanceRemaining as number) ?? 0,
          total: (metadata.totalAmount as number) ?? receipt.total_usd,
          paymentMethod: receipt.payment_method ?? 'Credit Card',
          paymentId: receipt.payment_id ?? '',
        });
        break;

      case 'ticket':
      default:
        // Use generic receipt PDF for tickets
        const items = (metadata.items as Array<{ label: string; quantity: number; unitPrice: number; total: number; codes?: string[] }>) ?? [{
          label: 'Ticket',
          quantity: 1,
          unitPrice: receipt.total_usd,
          total: receipt.total_usd,
        }];
        const discounts = (metadata.discounts as Array<{ label: string; amount: number }>) ?? [];

        pdfBuffer = await generateReceiptPDF({
          receiptNumber: receipt.receipt_number,
          date,
          customerName,
          customerEmail,
          items,
          subtotal: receipt.subtotal_usd,
          taxAmount: receipt.tax_usd,
          discounts,
          total: receipt.total_usd,
          paymentMethod: receipt.payment_method ?? 'Credit Card',
          paymentId: receipt.payment_id ?? '',
        });
        break;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="playfunia-receipt-${receiptNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

/**
 * Get receipts for a customer
 * GET /api/receipts/customer/:customerId
 */
export async function getCustomerReceipts(req: Request, res: Response, next: NextFunction) {
  try {
    const customerIdParam = req.params.customerId;
    if (!customerIdParam) {
      throw new AppError('Customer ID is required', 400);
    }

    const customerId = parseInt(customerIdParam, 10);

    if (isNaN(customerId)) {
      throw new AppError('Invalid customer ID', 400);
    }

    const receipts = await ReceiptRepository.findByCustomerId(customerId);

    return res.json({
      receipts: receipts.map(r => ({
        receiptNumber: r.receipt_number,
        purchaseType: r.purchase_type,
        total: r.total_usd,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
}
