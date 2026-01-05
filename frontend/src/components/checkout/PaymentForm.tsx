import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { getStripe } from "../../lib/stripe";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./PaymentForm.module.css";

type PaymentFormProps = {
  clientSecret: string;
  amount: number;
  currency: string;
  description?: string;
  submitLabel?: string;
  processingLabel?: string;
  onSuccess: (paymentIntentId: string) => Promise<void> | void;
};

export function PaymentForm(props: PaymentFormProps) {
  const { clientSecret } = props;
  const stripePromise = useMemo(() => getStripe(), []);

  const [stripeReady, setStripeReady] = useState(false);

  useEffect(() => {
    void stripePromise.then(stripe => setStripeReady(Boolean(stripe)));
  }, [stripePromise, clientSecret]);

  if (!clientSecret || !stripeReady) {
    return (
      <div className={styles.placeholder}>
        <p>Preparing secure payment form...</p>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#ff4d94",
            fontFamily: "Poppins, sans-serif",
          },
        },
      }}
    >
      <InnerPaymentForm {...props} />
    </Elements>
  );
}

function InnerPaymentForm(props: PaymentFormProps) {
  const { amount, currency, description, submitLabel, processingLabel, onSuccess } = props;
  const stripe = useStripe();
  const elements = useElements();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formattedAmount = useMemo(() => formatCurrency(amount, currency), [amount, currency]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message ?? "Unable to process payment. Please try again.");
      setIsSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded" && paymentIntent.id) {
      try {
        await onSuccess(paymentIntent.id);
      } catch (callbackError) {
        const message =
          callbackError instanceof Error
            ? callbackError.message
            : "Payment captured, but we could not finalize the order. Please contact support.";
        setErrorMessage(message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setErrorMessage("Payment is still processing. Please wait a moment and try again.");
    setIsSubmitting(false);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.summary}>
        <span className={styles.amount}>{formattedAmount}</span>
        <span className={styles.caption}>{description ?? "Secure card payment"}</span>
      </div>
      <PaymentElement />
      {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
      <PrimaryButton type="submit" disabled={isSubmitting || !stripe}>
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
