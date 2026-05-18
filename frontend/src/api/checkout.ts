export type CheckoutDiscount = { label: string; amount: number };

export type CheckoutLine = {
  type: 'ticket' | 'membership';
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discounts: CheckoutDiscount[];
  total: number;
};

export type CheckoutSummary = {
  currency: string;
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  discounts: CheckoutDiscount[];
  total: number;
  lines: CheckoutLine[];
};
