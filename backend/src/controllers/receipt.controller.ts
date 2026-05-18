import type { Request, Response, NextFunction } from 'express';

import { lookupReceipt, generateReceiptPDF, generateMembershipReceiptPDF, generateBookingReceiptPDF } from '../services/receipt.service';
import { ReceiptRepository, UserRepository } from '../repositories';
import { supabase } from '../config/supabase';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { appConfig } from '../config/env';
import type { SupabaseAuthenticatedRequest } from '../middleware/supabase-auth.middleware';

type AuthenticatedRequest = SupabaseAuthenticatedRequest;

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
        createdAt: receipt.created_at,
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
      timeZone: 'America/New_York',
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
          taxAmount: receipt.tax_usd,
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
          customerPhone: (metadata.customerPhone as string) ?? undefined,
          bookingReference: (metadata.bookingReference as string) ?? '',
          packageName: (metadata.packageName as string) ?? 'Party Package',
          packageBasePrice: (metadata.packageBasePrice as number) ?? undefined,
          eventDate: (metadata.eventDate as string) ?? '',
          startTime: (metadata.startTime as string) ?? '',
          location: (metadata.location as string) ?? 'Albany',
          guestCount: (metadata.guestCount as number) ?? 0,
          subtotal: (metadata.subtotal as number) ?? receipt.subtotal_usd,
          taxAmount: (metadata.taxAmount as number) ?? receipt.tax_usd,
          taxRate: (metadata.taxRate as number) ?? undefined,
          cleaningFee: (metadata.cleaningFee as number) ?? 0,
          extraChildren: (metadata.extraChildren as { count: number; unitPrice: number; total: number }) ?? undefined,
          extraAdults: (metadata.extraAdults as { count: number; unitPrice: number; total: number }) ?? undefined,
          addOns: (metadata.addOns as Array<{ name: string; price: number; quantity: number }>) ?? undefined,
          depositAmount: receipt.total_usd,
          balanceRemaining: (metadata.balanceRemaining as number) ?? 0,
          total: (metadata.totalAmount as number) ?? receipt.total_usd,
          paymentMethod: receipt.payment_method ?? 'Credit Card',
          paymentId: receipt.payment_id ?? '',
          children: (metadata.children as Array<{ name: string; birthDate?: string }>) ?? undefined,
          notes: (metadata.notes as string) ?? undefined,
          packageDetails: (metadata.packageDetails as {
            priceUsd: number;
            baseChildren: number;
            baseRoomHours: number;
            includesFood: boolean;
            includesDrinks: boolean;
            includesDecor: boolean;
            notes?: string;
          }) ?? undefined,
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

    const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="playfunia-receipt-${receiptNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

/**
 * Get receipts for a customer
 * GET /api/receipts/customer/:customerId
 * Requires authentication - user can only access their own receipts unless admin
 */
export async function getCustomerReceipts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const customerIdParam = req.params.customerId;
    if (!customerIdParam) {
      throw new AppError('Customer ID is required', 400);
    }

    const customerId = parseInt(customerIdParam, 10);

    if (isNaN(customerId)) {
      throw new AppError('Invalid customer ID', 400);
    }

    // Verify user is authorized to access these receipts
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required', 401);
    }

    // Look up the user's customer_id from the database
    const userId = parseInt(user.id, 10);
    const dbUser = !isNaN(userId) ? await UserRepository.findById(userId) : null;
    const userCustomerId = dbUser?.customer_id ?? (dbUser?.customers as any)?.customer_id ?? null;

    // Check if user owns this customer ID or is admin
    const isOwner = userCustomerId === customerId;
    const isAdmin = (user.roles ?? []).includes('admin') || (user.roles ?? []).includes('super_admin');

    if (!isOwner && !isAdmin) {
      logger.warn({
        userId: user.id,
        requestedCustomerId: customerId,
        userCustomerId,
      }, 'Unauthorized receipt access attempt');
      throw new AppError('Not authorized to access these receipts', 403);
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

/**
 * Get receipts by payment ID
 * GET /api/receipts/payment/:paymentId
 *
 * SECURITY: For authenticated users, validates that the payment belongs to them.
 * For unauthenticated access (guest checkout flow), logs the request for security monitoring
 * and relies on the payment ID being a secure, unguessable token from the payment provider.
 *
 * Note: Square/Stripe payment IDs are cryptographically secure and not enumerable.
 * Additional security: Rate limiting should be applied at the route level.
 */
export async function getReceiptsByPaymentId(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      throw new AppError('Payment ID is required', 400);
    }

    // SECURITY: Validate payment ID format to prevent injection/enumeration
    // Square payment IDs are alphanumeric with underscores, typically 16+ chars
    // Stripe payment IDs start with 'pi_' and are 24+ chars
    const validPaymentIdPattern = /^(pi_[a-zA-Z0-9]{20,}|sq_[a-zA-Z0-9]{16,}|[a-zA-Z0-9_]{16,})$/;

    if (!validPaymentIdPattern.test(paymentId)) {
      logger.warn({
        paymentId: paymentId.slice(0, 20),
        ip: req.ip,
      }, 'Invalid payment ID format - possible enumeration attempt');
      throw new AppError('Invalid payment ID format', 400);
    }

    const receipts = await ReceiptRepository.findByPaymentId(paymentId);

    // SECURITY: For authenticated users, verify they own at least one of these receipts
    if (req.user && receipts.length > 0) {
      const { data: userData } = await supabase
        .from('users')
        .select('customer_id')
        .eq('auth_user_id', req.user.id)
        .single();

      if (userData?.customer_id) {
        // Check if any receipt belongs to this customer
        const ownsReceipt = receipts.some(r => r.customer_id === userData.customer_id);

        if (!ownsReceipt) {
          logger.warn({
            paymentId: paymentId.slice(0, 8) + '...',
            userId: req.user.id,
            customerId: userData.customer_id,
          }, 'Authenticated user attempted to access receipt for different customer');
          // Return empty results rather than error to not leak information
          return res.json({ receipts: [] });
        }
      }
    } else if (!req.user) {
      // Log unauthenticated access for security monitoring
      logger.info({
        paymentId: paymentId.slice(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent')?.slice(0, 50),
        receiptCount: receipts.length,
      }, 'Unauthenticated receipt lookup by payment ID');
    }

    return res.json({
      receipts: receipts.map(r => ({
        receiptNumber: r.receipt_number,
        purchaseType: r.purchase_type,
        total: r.total_usd,
        subtotal: r.subtotal_usd,
        tax: r.tax_usd,
        discount: r.discount_usd,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
}
