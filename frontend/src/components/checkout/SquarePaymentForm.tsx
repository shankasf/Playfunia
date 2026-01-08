import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Payments, TokenResult, ChargeCardVerificationDetails } from '@square/web-payments-sdk-types';

import { initializeSquare } from "../../lib/square";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./PaymentForm.module.css";

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
  billingContact?: BillingContact;
  onSuccess: (sourceId: string, verificationToken?: string) => Promise<void> | void;
};

export function SquarePaymentForm(props: SquarePaymentFormProps) {
  const { amount, currency, description, submitLabel, processingLabel, billingContact, onSuccess } = props;

  const [, setPayments] = useState<Payments | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cardContainerRef = useRef<HTMLDivElement>(null);
  const cardAttachedRef = useRef(false);

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

        // Create card payment method
        console.log('[Square] Creating card element...');
        const cardInstance = await paymentsInstance.card();

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
      if (card && cardAttachedRef.current) {
        card.destroy().catch(console.error);
        cardAttachedRef.current = false;
      }
    };
  }, [card]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!card) {
      setErrorMessage("Payment form is not ready. Please wait.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

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
        const errorResult = tokenResult as { errors?: Array<{ message: string }> };
        console.error('[Square] Tokenization failed:', errorResult);
        const errors = errorResult.errors?.map((e: { message: string }) => e.message).join(', ') || 'Card tokenization failed';
        setErrorMessage(errors);
        setIsSubmitting(false);
        return;
      }

      console.log('[Square] Tokenization successful, calling onSuccess...');
      // Call the success handler with the token
      await onSuccess(tokenResult.token);
    } catch (error) {
      console.error('[Square] Submit error:', error);
      const message = error instanceof Error ? error.message : "Payment failed. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
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

      <PrimaryButton type="submit" disabled={isSubmitting || !card}>
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
