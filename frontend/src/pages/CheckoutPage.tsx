import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { PrimaryButton } from "../components/common/PrimaryButton";
import { SquarePaymentForm } from "../components/checkout/SquarePaymentForm";
import { PaymentForm } from "../components/checkout/PaymentForm";
import { formatTime, formatDateWithWeekday } from "../lib/dateUtils";
import {
  useCheckout,
  type BookingCartItem,
  type TicketCartItem,
  type MembershipCartItem,
} from "../context/CheckoutContext";
// Booking payment now handled through unified cart checkout (CartPage/CartDrawer)
import { createCheckoutIntent, finalizeCheckout, type CheckoutSummary } from "../api/checkout";
import {
  createSquareCheckoutIntent,
  finalizeSquareCheckout,
  getSquareConfig,
} from "../api/square";
import { useAuth } from "../context/AuthContext";
import styles from "./CheckoutPage.module.css";

type PaymentProvider = 'stripe' | 'square';

// Booking payment state no longer needed - bookings go through cart checkout

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
  const { items, removeItem, clear, markTicketFulfilled, markMembershipActivated } =
    useCheckout();
  const location = useLocation();
  const [status, setStatus] = useState<string | null>(null);
  const [cartPayment, setCartPayment] = useState<CartPaymentState>({ loading: false });
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('square');
  const [squareAvailable, setSquareAvailable] = useState(false);

  // Check if Square is available on mount
  useEffect(() => {
    let isMounted = true;
    getSquareConfig()
      .then(config => { if (isMounted) setSquareAvailable(config.available); })
      .catch(() => { if (isMounted) setSquareAvailable(false); });
    return () => { isMounted = false; };
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

  const totalBookingsDueNow = bookingItems
    .filter(item => item.status === "pending")
    .reduce((sum, item) => sum + item.total, 0);

  const totalBalancesDueLater = 0; // No balance due - full payment required

  const cartSubtotal = payableItems.reduce((sum, item) => sum + item.total, 0);

  // Booking payments now handled through unified cart checkout (CartPage/CartDrawer)

  const handleClear = () => {
    clear();
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
                <h2>Party Bookings</h2>
                <p>Complete payment through the cart to confirm your celebration.</p>
              </header>
              <ul className={styles.list}>
                {bookingItems.map(item => (
                  <li key={item.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <span className={styles.badge}>Booking</span>
                        <h3>{item.packageName}</h3>
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
                        <dt>Total</dt>
                        <dd>{formatCurrency(item.total)}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{item.status === "paid" ? "Paid" : "In cart - awaiting payment"}</dd>
                      </div>
                    </dl>

                    {item.status === "paid" ? (
                      <div className={styles.depositComplete}>
                        Payment received. A Playfunia host will reach out with party details.
                      </div>
                    ) : (
                      <PrimaryButton to="/cart">
                        Go to Cart to Complete Payment
                      </PrimaryButton>
                    )}
                  </li>
                ))}
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
            {totalBookingsDueNow > 0 && (
              <div>
                <dt>Party bookings</dt>
                <dd>{formatCurrency(totalBookingsDueNow)}</dd>
              </div>
            )}
            {cartSubtotal > 0 && (
              <div>
                <dt>Tickets & memberships</dt>
                <dd>{formatCurrency(orderSummary?.total ?? cartSubtotal)}</dd>
              </div>
            )}
          </dl>

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
