import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Payments, TokenResult, ChargeCardVerificationDetails } from '@square/web-payments-sdk-types';

import { initializeSquare } from "../../lib/square";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./PaymentForm.module.css";

// User-friendly error messages for Square error codes (Fix #17)
const SQUARE_ERROR_MESSAGES: Record<string, string> = {
  'CVV_FAILURE': 'The security code (CVV) is incorrect. Please check and try again.',
  'INVALID_EXPIRATION': 'The card expiration date is invalid.',
  'INVALID_CARD': 'This card number is invalid. Please check and try again.',
  'CARD_DECLINED': 'Your card was declined. Please try a different card.',
  'INSUFFICIENT_FUNDS': 'Insufficient funds. Please try a different card.',
  'CARD_EXPIRED': 'This card has expired. Please use a different card.',
  'INVALID_CARD_DATA': 'Invalid card information. Please check and try again.',
  'GENERIC_DECLINE': 'Your card was declined. Please try a different payment method.',
  'NETWORK_ERROR': 'Connection error. Please check your internet and try again.',
  'TIMEOUT': 'Request timed out. Please try again.',
  'VERIFY_CVV_FAILURE': 'The security code (CVV) could not be verified. Please check and try again.',
  'VERIFY_AVS_FAILURE': 'Address verification failed. Please check your billing address.',
  'CARD_TOKEN_EXPIRED': 'Payment session expired. Please refresh and try again.',
  'CARD_TOKEN_USED': 'Payment was already processed. Please refresh to continue.',
  'BAD_EXPIRATION': 'Invalid expiration date. Please check and try again.',
  'CHIP_INSERTION_REQUIRED': 'Please insert your card chip instead of swiping.',
  'PAN_FAILURE': 'Card number validation failed. Please check and try again.',
  'EXPIRATION_FAILURE': 'Card expiration validation failed. Please check and try again.',
  'CARD_NOT_SUPPORTED': 'This card type is not supported. Please try a different card.',
  'INVALID_PIN': 'Invalid PIN. Please try again.',
  'INVALID_POSTAL_CODE': 'Invalid postal code. Please check your billing address.',
  'INVALID_ACCOUNT': 'Invalid account. Please try a different card.',
  'CARDHOLDER_INSUFFICIENT_PERMISSIONS': 'Your card does not have permission for this transaction.',
  'AMOUNT_TOO_HIGH': 'The payment amount exceeds your card limit.',
  'AMOUNT_TOO_LOW': 'The payment amount is below the minimum.',
};

/**
 * Get a user-friendly error message from Square error codes
 */
function getErrorMessage(errors: Array<{ code?: string; message: string }>): string {
  for (const error of errors) {
    if (error.code && SQUARE_ERROR_MESSAGES[error.code]) {
      return SQUARE_ERROR_MESSAGES[error.code];
    }
  }
  // Fall back to the first error message or a generic one
  return errors[0]?.message || 'Payment failed. Please try again.';
}

// Billing contact info for SCA/3DS verification
export type BillingContact = {
  givenName?: string;
  familyName?: string;
  email?: string;
  phone?: string;
  addressLines?: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
};

type SquarePaymentFormProps = {
  amount: number;
  currency: string;
  description?: string;
  submitLabel?: string;
  processingLabel?: string;
  disabled?: boolean;
  billingContact?: BillingContact;
  onSuccess: (sourceId: string, verificationToken?: string) => Promise<void> | void;
};

export function SquarePaymentForm(props: SquarePaymentFormProps) {
  const { amount, currency, description, submitLabel, processingLabel, disabled, billingContact, onSuccess } = props;

  const [, setPayments] = useState<Payments | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cardContainerRef = useRef<HTMLDivElement>(null);
  const cardAttachedRef = useRef(false);
  // Track if tokenization is in progress to prevent card.destroy() during payment (Fix #14)
  const isTokenizingRef = useRef(false);
  // Ref for immediate submission blocking to prevent double-submit (more reliable than state alone)
  const submissionInProgressRef = useRef(false);

  const formattedAmount = useMemo(() => formatCurrency(amount, currency), [amount, currency]);

  // Initialize Square SDK and create card payment method
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        console.log('[Square] Initializing Square SDK...');
        const paymentsInstance = await initializeSquare();

        if (!mounted) return;

        if (!paymentsInstance) {
          console.error('[Square] Payments instance is null');
          setErrorMessage("Square payments are not available. Please try again later.");
          setIsLoading(false);
          return;
        }

        console.log('[Square] Payments instance created successfully');
        setPayments(paymentsInstance);

        // Create card payment method with custom styles
        console.log('[Square] Creating card element...');
        const cardInstance = await paymentsInstance.card({
          style: {
            '.input-container': {
              borderRadius: '6px',
            },
            '.input-container.is-focus': {
              borderColor: '#7c3aed',
            },
            'input': {
              color: '#1a1a2e',
            },
            'input::placeholder': {
              color: '#9ca3af',
            },
            '.message-text': {
              color: '#dc2626',
            },
          },
        });

        if (!mounted) return;

        console.log('[Square] Card element created successfully');
        setCard(cardInstance);
        setIsLoading(false);
      } catch (error) {
        console.error('[Square] Initialization error:', error);
        if (mounted) {
          const message = error instanceof Error ? error.message : "Failed to initialize payment form";
          setErrorMessage(message);
          setIsLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  // Attach card to container when both are ready
  useEffect(() => {
    if (card && cardContainerRef.current && !cardAttachedRef.current) {
      cardAttachedRef.current = true;
      card.attach(cardContainerRef.current).catch((error) => {
        console.error("Failed to attach card:", error);
        setErrorMessage("Failed to display payment form. Please refresh and try again.");
      });
    }

    return () => {
      // Only destroy if not in the middle of tokenization (Fix #14)
      // Destroying during tokenization can interrupt the payment
      if (card && cardAttachedRef.current && !isTokenizingRef.current) {
        card.destroy().catch(console.error);
        cardAttachedRef.current = false;
      }
    };
  }, [card]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Double-guard: ref + state for reliable duplicate prevention
    // The ref provides immediate blocking even before React state updates
    if (submissionInProgressRef.current || isSubmitting) {
      console.log('[Square] Submission already in progress, ignoring duplicate');
      return;
    }

    if (!card) {
      setErrorMessage("Payment form is not ready. Please wait.");
      return;
    }

    // Set ref immediately for synchronous blocking
    submissionInProgressRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    // Mark tokenization as in progress (Fix #14)
    isTokenizingRef.current = true;

    try {
      // Build verification details for SCA/3DS (per Square standard)
      // Only include verification details if billing contact is provided
      const verificationDetails: ChargeCardVerificationDetails | undefined = billingContact
        ? {
            amount: amount.toFixed(2),
            currencyCode: currency.toUpperCase(),
            intent: 'CHARGE',
            customerInitiated: true,
            sellerKeyedIn: false,
            billingContact: {
              givenName: billingContact.givenName,
              familyName: billingContact.familyName,
              email: billingContact.email,
              phone: billingContact.phone,
              addressLines: billingContact.addressLines,
              city: billingContact.city,
              state: billingContact.state,
              postalCode: billingContact.postalCode,
              countryCode: billingContact.countryCode || 'US',
            },
          }
        : undefined;

      // Tokenize the card with optional verification details
      console.log('[Square] Tokenizing card...');
      const tokenResult: TokenResult = await card.tokenize(verificationDetails);
      console.log('[Square] Token result:', tokenResult);

      if (tokenResult.status !== 'OK' || !tokenResult.token) {
        const errorResult = tokenResult as { errors?: Array<{ code?: string; message: string }> };
        console.error('[Square] Tokenization failed:', errorResult);
        // Use user-friendly error messages (Fix #17)
        const errorMsg = errorResult.errors
          ? getErrorMessage(errorResult.errors)
          : 'Card tokenization failed. Please try again.';
        setErrorMessage(errorMsg);
        setIsSubmitting(false);
        return;
      }

      console.log('[Square] Tokenization successful, calling onSuccess...');
      // Call the success handler with the token
      // Note: When tokenize() is called with verificationDetails, SCA/3DS verification
      // is performed inline by Square, and the resulting token already contains
      // the verification. The verificationToken parameter is kept for backwards
      // compatibility but is undefined when using inline verification.
      await onSuccess(tokenResult.token);
    } catch (error) {
      console.error('[Square] Submit error:', error);
      const message = error instanceof Error ? error.message : "Payment failed. Please try again.";
      setErrorMessage(message);
      // Re-enable submission on error so user can retry
      submissionInProgressRef.current = false;
    } finally {
      setIsSubmitting(false);
      isTokenizingRef.current = false; // Reset tokenization flag (Fix #14)
      // Note: We intentionally do NOT reset submissionInProgressRef on success
      // This prevents any race conditions from allowing a second submission
      // The component will remount or user will navigate away after successful payment
    }
  };

  if (isLoading) {
    return (
      <div className={styles.placeholder}>
        <p>Preparing secure payment form...</p>
      </div>
    );
  }

  if (errorMessage && !card) {
    return (
      <div className={styles.placeholder}>
        <p className={styles.error}>{errorMessage}</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.summary}>
        <span className={styles.amount}>{formattedAmount}</span>
        <span className={styles.caption}>{description ?? "Secure card payment"}</span>
      </div>

      <div
        ref={cardContainerRef}
        className={styles.cardContainer}
      />

      {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

      <PrimaryButton
        type="submit"
        disabled={isSubmitting || !card || disabled}
        aria-busy={isSubmitting}
        aria-disabled={isSubmitting || !card || disabled}
      >
        {isSubmitting ? processingLabel ?? "Processing..." : submitLabel ?? "Pay now"}
      </PrimaryButton>
    </form>
  );
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    console.warn("Unable to format currency", error);
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}
