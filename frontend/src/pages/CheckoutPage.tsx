import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { PrimaryButton } from "../components/common/PrimaryButton";
import { PaymentForm } from "../components/checkout/PaymentForm";
import { SquarePaymentForm } from "../components/checkout/SquarePaymentForm";
import { formatTime, formatDateWithWeekday } from "../lib/dateUtils";
import {
  useCheckout,
  type BookingCartItem,
  type TicketCartItem,
  type MembershipCartItem,
} from "../context/CheckoutContext";
import {
  createBookingDepositIntent,
  confirmBookingDeposit,
  BookingDepositIntentResponse,
} from "../api/bookings";
import { createCheckoutIntent, finalizeCheckout, type CheckoutSummary } from "../api/checkout";
import {
  createSquareCheckoutIntent,
  finalizeSquareCheckout,
  getSquareConfig,
} from "../api/square";
import { useAuth } from "../context/AuthContext";
import styles from "./CheckoutPage.module.css";

type PaymentProvider = 'stripe' | 'square';

type PaymentState = {
  intent?: BookingDepositIntentResponse;
  loading: boolean;
  error?: string;
  completed?: boolean;
};

type CartPaymentState = {
  loading: boolean;
  clientSecret?: string;
  summary?: CheckoutSummary;
  error?: string;
  success?: boolean;
  receiptEmail?: string | null;
  // Square-specific state
  squareReady?: boolean;
  squareAmount?: number;
};

export function CheckoutPage() {
  const { user } = useAuth();
  const hasValidWaiver = user?.hasValidWaiver ?? false;
  const { items, removeItem, clear, markBookingDepositPaid, markTicketFulfilled, markMembershipActivated } =
    useCheckout();
  const location = useLocation();
  const [payments, setPayments] = useState<Record<string, PaymentState>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [cartPayment, setCartPayment] = useState<CartPaymentState>({ loading: false });
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('square');
  const [squareAvailable, setSquareAvailable] = useState(false);

  // Check if Square is available on mount
  useEffect(() => {
    getSquareConfig()
      .then(config => setSquareAvailable(config.available))
      .catch(() => setSquareAvailable(false));
  }, []);

  const bookingItems = useMemo(
    () => items.filter((item): item is BookingCartItem => item.type === "booking"),
    [items],
  );
  const ticketItems = useMemo(
    () => items.filter((item): item is TicketCartItem => item.type === "ticket"),
    [items],
  );
  const membershipItems = useMemo(
    () => items.filter((item): item is MembershipCartItem => item.type === "membership"),
    [items],
  );
  const payableItems = useMemo(
    () => [
      ...ticketItems.filter(item => item.status !== "paid"),
      ...membershipItems.filter(item => item.status !== "activated"),
    ],
    [ticketItems, membershipItems],
  );

  const isEmpty = items.length === 0;

  useEffect(() => {
    if (location.state && typeof location.state === "object" && "from" in location.state) {
      setStatus("Cart updated. Review and complete checkout below.");
    }
  }, [location.state]);

  const totalDepositsDueNow = bookingItems
    .filter(item => item.status === "awaiting_deposit")
    .reduce((sum, item) => sum + item.depositAmount, 0);

  const totalBalancesDueLater = bookingItems.reduce((sum, item) => sum + item.balanceRemaining, 0);

  const cartSubtotal = payableItems.reduce((sum, item) => sum + item.total, 0);

  const handleStartDeposit = async (bookingId: string) => {
    if (!hasValidWaiver) {
      setStatus("Please complete the waiver before paying a deposit.");
      return;
    }
    setPayments(prev => ({ ...prev, [bookingId]: { loading: true } }));
    try {
      const intent = await createBookingDepositIntent(bookingId);

      // Mock payment mode - auto-confirm without Stripe
      if (intent.mock && intent.paymentIntentId) {
        const confirmation = await confirmBookingDeposit(bookingId, intent.paymentIntentId);
        markBookingDepositPaid(bookingId, confirmation.balanceRemaining);
        setPayments(prev => ({
          ...prev,
          [bookingId]: { loading: false, completed: true },
        }));
        setStatus(`Deposit confirmed for booking (test mode).`);
        return;
      }

      setPayments(prev => ({
        ...prev,
        [bookingId]: { loading: false, intent },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to prepare deposit payment.";
      setPayments(prev => ({ ...prev, [bookingId]: { loading: false, error: message } }));
    }
  };

  const handleDepositSuccess = async (bookingId: string, paymentIntentId: string) => {
    setPayments(prev => ({
      ...prev,
      [bookingId]: { ...(prev[bookingId] ?? {}), loading: true, error: undefined },
    }));
    try {
      const confirmation = await confirmBookingDeposit(bookingId, paymentIntentId);
      markBookingDepositPaid(bookingId, confirmation.balanceRemaining);
      setPayments(prev => ({
        ...prev,
        [bookingId]: { ...(prev[bookingId] ?? {}), loading: false, completed: true },
      }));
      setStatus(`Deposit confirmed for booking ${confirmation.bookingId}.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Payment captured, but we could not finalize your booking. Please contact support.";
      setPayments(prev => ({
        ...prev,
        [bookingId]: { ...(prev[bookingId] ?? {}), loading: false, error: message },
      }));
    }
  };

  const handleClear = () => {
    clear();
    setPayments({});
    setCartPayment({ loading: false });
  };

  const prepareCartPayment = async () => {
    if (payableItems.length === 0) {
      setStatus("No tickets or memberships need payment.");
      return;
    }
    if (!hasValidWaiver) {
      setStatus("Please complete the waiver before paying.");
      return;
    }

    setCartPayment({ loading: true });
    try {
      const payload = {
        promoCode: promoCode.trim() ? promoCode.trim() : undefined,
        items: payableItems.map(item =>
          item.type === "ticket"
            ? {
              type: "ticket" as const,
              label: item.label,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              metadata: { cartId: item.id },
            }
            : {
              type: "membership" as const,
              label: item.label,
              membershipId: item.membershipId,
              durationMonths: item.durationMonths,
              autoRenew: item.autoRenew,
              unitPrice: item.total,
            },
        ),
      };

      // Use Square or Stripe based on selected provider
      if (paymentProvider === 'square' && squareAvailable) {
        const intent = await createSquareCheckoutIntent(payload);

        setCartPayment({
          loading: false,
          squareReady: true,
          squareAmount: intent.amount,
          summary: intent.summary,
          error: undefined,
          success: false,
        });
        setStatus("Secure payment form ready. Complete payment to finalize tickets and memberships.");
      } else {
        const intent = await createCheckoutIntent(payload);

        // Mock payment mode - auto-finalize without Stripe
        if (intent.mock && intent.paymentIntentId) {
          await handleCartPaymentSuccess(intent.paymentIntentId);
          return;
        }

        setCartPayment({
          loading: false,
          clientSecret: intent.clientSecret,
          summary: intent.summary,
          error: undefined,
          success: false,
        });
        setStatus("Secure payment form ready. Complete payment to finalize tickets and memberships.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to prepare checkout payment.";
      setCartPayment({ loading: false, error: message });
      setStatus(message);
    }
  };

  // Square payment success handler
  const handleSquarePaymentSuccess = async (sourceId: string, verificationToken?: string) => {
    if (payableItems.length === 0) return;
    try {
      const payload = {
        sourceId,
        verificationToken,
        promoCode: promoCode.trim() ? promoCode.trim() : undefined,
        items: payableItems.map(item =>
          item.type === "ticket"
            ? {
              type: "ticket" as const,
              label: item.label,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              metadata: { cartId: item.id },
            }
            : {
              type: "membership" as const,
              label: item.label,
              membershipId: item.membershipId,
              durationMonths: item.durationMonths,
              autoRenew: item.autoRenew,
              unitPrice: item.total,
            },
        ),
      };

      const result = await finalizeSquareCheckout(payload);

      result.tickets.forEach(entry => {
        const item = payableItems[entry.cartIndex];
        if (item && item.type === "ticket") {
          const codes = (entry.ticket?.codes ?? []).map(code => code.code);
          markTicketFulfilled(item.id, {
            ticketId: (entry.ticket as { id?: string; _id?: string }).id ?? (entry.ticket as { _id?: string })._id,
            codes,
            discounts: cartPayment.summary?.lines?.[entry.cartIndex]?.discounts,
            promoCode: payload.promoCode,
          });
        }
      });

      result.memberships.forEach(entry => {
        const item = payableItems[entry.cartIndex];
        if (item && item.type === "membership") {
          markMembershipActivated(item.id, entry.membership.startedAt);
        }
      });

      setCartPayment(prev => ({
        ...prev,
        loading: false,
        success: true,
        squareReady: false,
        receiptEmail: result.receiptEmail,
        summary: result.summary,
      }));
      setStatus(
        result.receiptEmail
          ? `Order complete! Confirmation sent to ${result.receiptEmail}.`
          : "Order complete!",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Payment failed. Please try again.";
      setCartPayment(prev => ({ ...prev, loading: false, error: message }));
      setStatus(message);
    }
  };

  const handleCartPaymentSuccess = async (paymentIntentId: string) => {
    if (payableItems.length === 0) return;
    try {
      const payload = {
        paymentIntentId,
        promoCode: promoCode.trim() ? promoCode.trim() : undefined,
        items: payableItems.map(item =>
          item.type === "ticket"
            ? {
              type: "ticket" as const,
              label: item.label,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              metadata: { cartId: item.id },
            }
            : {
              type: "membership" as const,
              label: item.label,
              membershipId: item.membershipId,
              durationMonths: item.durationMonths,
              autoRenew: item.autoRenew,
              unitPrice: item.total,
            },
        ),
      };

      const result = await finalizeCheckout(payload);

      result.tickets.forEach(entry => {
        const item = payableItems[entry.cartIndex];
        if (item && item.type === "ticket") {
          const codes = (entry.ticket?.codes ?? []).map(code => code.code);
          markTicketFulfilled(item.id, {
            ticketId: (entry.ticket as { id?: string; _id?: string }).id ?? (entry.ticket as { _id?: string })._id,
            codes,
            discounts: cartPayment.summary?.lines?.[entry.cartIndex]?.discounts,
            promoCode: payload.promoCode,
          });
        }
      });

      result.memberships.forEach(entry => {
        const item = payableItems[entry.cartIndex];
        if (item && item.type === "membership") {
          markMembershipActivated(item.id, entry.membership.startedAt);
        }
      });

      setCartPayment(prev => ({
        ...prev,
        loading: false,
        success: true,
        clientSecret: undefined,
        receiptEmail: result.receiptEmail,
        summary: result.summary,
      }));
      setStatus(
        result.receiptEmail
          ? `Order complete! Confirmation sent to ${result.receiptEmail}.`
          : "Order complete!",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Payment captured but we could not finalize the order.";
      setCartPayment(prev => ({ ...prev, loading: false, error: message }));
      setStatus(message);
    }
  };

  if (isEmpty) {
    return (
      <section className={styles.page}>
        <div className={styles.emptyState}>
          <h1>Your Playfunia cart is empty</h1>
          <p>Book a party, grab tickets, or explore memberships to see checkout details here.</p>
          <PrimaryButton to="/book-party">Start a party booking</PrimaryButton>
        </div>
      </section>
    );
  }

  const orderSummary = cartPayment.summary;

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Checkout</h1>
        <p>Review everything in your cart, confirm waivers, and complete secure payments.</p>
        {status ? <div className={styles.statusInfo}>{status}</div> : null}
      </div>

      {!hasValidWaiver ? (
        <div className={styles.notice}>
          <strong>Waiver required:</strong> Please complete the waiver before paying. Payments are disabled until a valid waiver is on file.
          <PrimaryButton to="/waiver" className={styles.inlineButton}>
            Sign waiver
          </PrimaryButton>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.items}>
          {bookingItems.length > 0 ? (
            <section className={styles.section}>
              <header>
                <h2>Party deposits</h2>
                <p>Pay 50% now to lock in your celebration. The remaining balance is due on party day.</p>
              </header>
              <ul className={styles.list}>
                {bookingItems.map(item => {
                  const state = payments[item.bookingId] ?? { loading: false };
                  return (
                    <li key={item.bookingId} className={styles.card}>
                      <div className={styles.cardHeader}>
                        <div>
                          <span className={styles.badge}>Booking</span>
                          <h3>{item.reference}</h3>
                          <p>
                            {item.location} • {formatDisplayDate(item.eventDate)} at {formatTime(item.startTime)}
                          </p>
                        </div>
                        <button type="button" onClick={() => removeItem(item.id)} className={styles.removeButton}>
                          Remove
                        </button>
                      </div>
                      <dl className={styles.summaryGrid}>
                        <div>
                          <dt>Total party cost</dt>
                          <dd>{formatCurrency(item.total)}</dd>
                        </div>
                        <div>
                          <dt>Deposit due now</dt>
                          <dd>{formatCurrency(item.depositAmount)}</dd>
                        </div>
                        <div>
                          <dt>Balance due at event</dt>
                          <dd>{formatCurrency(item.balanceRemaining)}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{item.status === "deposit_paid" ? "Deposit paid" : "Awaiting deposit"}</dd>
                        </div>
                      </dl>

                      {item.status === "deposit_paid" ? (
                        <div className={styles.depositComplete}>
                          Deposit received. A Playfunia host will reach out with party details.
                        </div>
                      ) : state.loading && !state.intent ? (
                        <p>Preparing secure payment form...</p>
                      ) : state.intent ? (
                        <PaymentForm
                          clientSecret={state.intent.clientSecret}
                          amount={state.intent.amount / 100}
                          currency={state.intent.currency}
                          description={`Deposit for ${item.reference}`}
                          submitLabel="Pay deposit"
                          processingLabel="Processing deposit..."
                          onSuccess={paymentIntentId => handleDepositSuccess(item.bookingId, paymentIntentId)}
                        />
                      ) : (
                        <PrimaryButton
                          type="button"
                          onClick={() => handleStartDeposit(item.bookingId)}
                          disabled={state.loading || !hasValidWaiver}
                        >
                          {state.loading ? "Preparing..." : hasValidWaiver ? "Pay deposit" : "Waiver required"}
                        </PrimaryButton>
                      )}

                      {state.error ? <p className={styles.error}>{state.error}</p> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {ticketItems.length > 0 ? (
            <section className={styles.section}>
              <header>
                <h2>Tickets</h2>
                <p>Pending tickets are shown below. Codes appear after payment.</p>
              </header>
              <ul className={styles.list}>
                {ticketItems.map(item => (
                  <li key={item.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <span className={styles.badge}>Tickets</span>
                        <h3>{item.label}</h3>
                        <p>
                          {item.quantity} kids • {item.status === "paid" ? "Paid" : "Awaiting payment"} • {formatCurrency(item.total)}
                        </p>
                      </div>
                      <button type="button" onClick={() => removeItem(item.id)} className={styles.removeButton}>
                        Remove
                      </button>
                    </div>
                    {item.status === "paid" && item.codes && item.codes.length > 0 ? (
                      <div className={styles.codeGrid}>
                        {item.codes.map(code => (
                          <code key={code}>{code}</code>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.helper}>Codes will appear once payment is complete.</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {membershipItems.length > 0 ? (
            <section className={styles.section}>
              <header>
                <h2>Memberships</h2>
                <p>Pending memberships will activate after checkout payment.</p>
              </header>
              <ul className={styles.list}>
                {membershipItems.map(item => (
                  <li key={item.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <span className={styles.badge}>Membership</span>
                        <h3>{item.label}</h3>
                        <p>
                          {item.durationMonths} month{item.durationMonths === 1 ? "" : "s"} • {formatCurrency(item.total)} • {item.autoRenew ? "Auto-renew on" : "Auto-renew off"}
                        </p>
                      </div>
                      <button type="button" onClick={() => removeItem(item.id)} className={styles.removeButton}>
                        Remove
                      </button>
                    </div>
                    <p className={styles.helper}>
                      {item.status === "activated"
                        ? "Membership activated."
                        : "Activate this membership by completing checkout below."}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className={styles.summary}>
          <h2>Order summary</h2>
          <dl>
            <div>
              <dt>Deposits due now</dt>
              <dd>{formatCurrency(totalDepositsDueNow)}</dd>
            </div>
            <div>
              <dt>Tickets & memberships</dt>
              <dd>{formatCurrency(orderSummary?.total ?? cartSubtotal)}</dd>
            </div>
            <div>
              <dt>Balances due at visit</dt>
              <dd>{formatCurrency(totalBalancesDueLater)}</dd>
            </div>
            {orderSummary?.discounts?.length ? (
              <div>
                <dt>Discounts applied</dt>
                <dd>
                  {orderSummary.discounts
                    .filter(discount => discount.amount > 0)
                    .map(discount => `${discount.label}: -${formatCurrency(discount.amount)}`)
                    .join(" · ")}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className={styles.promoRow}>
            <input
              type="text"
              value={promoCode}
              onChange={event => setPromoCode(event.target.value)}
              placeholder="Promo code"
              className={styles.promoInput}
            />
            <PrimaryButton
              type="button"
              onClick={prepareCartPayment}
              className={`${styles.secondary} ${styles.promoButton}`}
            >
              Apply & refresh
            </PrimaryButton>
          </div>

          {cartPayment.error ? <p className={styles.error}>{cartPayment.error}</p> : null}
          {cartPayment.success && cartPayment.receiptEmail ? (
            <p className={styles.success}>Receipt sent to {cartPayment.receiptEmail}</p>
          ) : null}

          {/* Payment provider selector */}
          {payableItems.length > 0 && !cartPayment.clientSecret && !cartPayment.squareReady && !cartPayment.success ? (
            <div className={styles.paymentProviderSelector}>
              <label className={styles.providerLabel}>Payment method:</label>
              <div className={styles.providerOptions}>
                <label className={styles.providerOption}>
                  <input
                    type="radio"
                    name="paymentProvider"
                    value="square"
                    checked={paymentProvider === 'square'}
                    onChange={() => setPaymentProvider('square')}
                    disabled={!squareAvailable}
                  />
                  <span>Square {!squareAvailable && '(unavailable)'}</span>
                </label>
                <label className={styles.providerOption}>
                  <input
                    type="radio"
                    name="paymentProvider"
                    value="stripe"
                    checked={paymentProvider === 'stripe'}
                    onChange={() => setPaymentProvider('stripe')}
                  />
                  <span>Card (Stripe)</span>
                </label>
              </div>
            </div>
          ) : null}

          {payableItems.length > 0 ? (
            cartPayment.squareReady ? (
              <SquarePaymentForm
                amount={cartPayment.squareAmount ?? cartPayment.summary?.total ?? cartSubtotal}
                currency={cartPayment.summary?.currency ?? "usd"}
                description="Checkout total"
                submitLabel="Pay now"
                processingLabel="Processing checkout..."
                onSuccess={handleSquarePaymentSuccess}
              />
            ) : cartPayment.clientSecret ? (
              <PaymentForm
                clientSecret={cartPayment.clientSecret}
                amount={cartPayment.summary?.total ?? cartSubtotal}
                currency={cartPayment.summary?.currency ?? "usd"}
                description="Checkout total"
                submitLabel="Pay now"
                processingLabel="Processing checkout..."
                onSuccess={handleCartPaymentSuccess}
              />
            ) : (
              <PrimaryButton type="button" onClick={prepareCartPayment} disabled={!hasValidWaiver || cartPayment.loading}>
                {cartPayment.loading ? "Preparing..." : hasValidWaiver ? "Prepare secure payment" : "Waiver required"}
              </PrimaryButton>
            )
          ) : (
            <p className={styles.helper}>No tickets or memberships require payment.</p>
          )}

          <PrimaryButton to="/book-party" className={styles.secondary}>
            Add another party
          </PrimaryButton>
          <PrimaryButton to="/buy-ticket" className={styles.secondary}>
            Add tickets
          </PrimaryButton>
          <button type="button" onClick={handleClear} className={styles.clearButton}>
            Clear cart
          </button>
          <PrimaryButton to="/" className={styles.homeButton}>
            Return home
          </PrimaryButton>
        </aside>
      </div>
    </section>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDisplayDate(value: string) {
  return formatDateWithWeekday(value);
}
