import { apiGet, API_BASE_URL } from './client';

export interface ReceiptInfo {
  receiptNumber: string;
  purchaseType: 'membership' | 'ticket' | 'booking';
  total: number;
  subtotal: number;
  tax: number;
  discount: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ReceiptsByPaymentIdResponse {
  receipts: ReceiptInfo[];
}

/**
 * Get receipts associated with a payment ID
 */
export function getReceiptsByPaymentId(paymentId: string) {
  return apiGet<ReceiptsByPaymentIdResponse>(`/receipts/payment/${encodeURIComponent(paymentId)}`);
}

/**
 * Get the URL to download a receipt PDF.
 * Returns a plain URL for use as href - the backend receipt PDF endpoint
 * should validate ownership via the receipt number (which includes random components).
 */
export function getReceiptPdfUrl(receiptNumber: string): string {
  const baseUrl = API_BASE_URL || '/api';
  return `${baseUrl}/receipts/${encodeURIComponent(receiptNumber)}/pdf`;
}

/**
 * Download a receipt PDF with authentication.
 * Uses fetch with auth headers and creates a Blob URL for download.
 */
export async function downloadReceiptPdf(receiptNumber: string): Promise<void> {
  const baseUrl = API_BASE_URL || '/api';
  const url = `${baseUrl}/receipts/${encodeURIComponent(receiptNumber)}/pdf`;

  // Get auth token from localStorage (matches client.ts token management)
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error('Failed to download receipt');
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `receipt-${receiptNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
