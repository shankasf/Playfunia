import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { PrimaryButton } from "../components/common/PrimaryButton";
import { SquarePaymentForm } from "../components/checkout/SquarePaymentForm";
import { formatTime, formatDateWithWeekday } from "../lib/dateUtils";
import {
  useCheckout,
  type BookingCartItem,
  type TicketCartItem,
  type MembershipCartItem,
} from "../context/CheckoutContext";
// Booking payment now handled through unified cart checkout (CartPage/CartDrawer)
import {
  createSquareCheckoutIntent,
  finalizeSquareCheckout,
  getSquareConfig,
} from "../api/square";
import type { CheckoutSummary } from "../api/checkout";
import { useAuth } from "../context/AuthContext";
import { MEMBERSHIP_REFUND_POLICY_ITEMS } from "../data/membershipRefundPolicy";
import styles from "./CheckoutPage.module.css";

// Booking payment state no longer needed - bookings go through cart checkout

type CartPaymentState = {
  loading: boolean;
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
  const navigate = useNavigate();
  const [status, setStatus] = useState<string | null>(null);
  const [cartPayment, setCartPayment] = useState<CartPaymentState>({ loading: false });
  const [, setSquareAvailable] = useState(false);
  const [refundPolicyAccepted, setRefundPolicyAccepted] = useState(false);
  const [refundPolicyAcceptedAt, setRefundPolicyAcceptedAt] = useState<string | null>(null);
  const [showRefundPolicy, setShowRefundPolicy] = useState(false);

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
  const hasMembershipItems = membershipItems.some(item => item.status !== "activated");

  const isEmpty = items.length === 0;

  useEffect(() => {
    if (location.state && typeof location.state === "object" && "from" in location.state) {
      setStatus("Cart updated. Review and complete checkout below.");
    }
  }, [location.state]);

  // Memberships require the parent + child info collection form on /cart.
  // Redirect any memberships landing on this legacy page to the cart flow.
  useEffect(() => {
    if (membershipItems.some(item => item.status !== "activated")) {
      navigate("/cart", { replace: true });
    }
  }, [membershipItems, navigate]);

  const totalBookingsDueNow = bookingItems
    .filter(item => item.status === "pending")
    .reduce((sum, item) => sum + Math.round(item.total * 100), 0) / 100;

  // totalBalancesDueLater removed - no balance due, full payment required

  const cartSubtotal = payableItems.reduce((sum, item) => sum + Math.round(item.total * 100), 0) / 100;

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
    if (hasMembershipItems && !refundPolicyAccepted) {
      setStatus("You must agree to the Refund Policy to continue.");
      return;
    }

    setCartPayment({ loading: true });
    try {
      // Memberships redirect to /cart for the full info-collection flow, so this
      // legacy page only ever submits ticket items to the Square checkout API.
      const payload = {
        items: payableItems
          .filter((item): item is TicketCartItem => item.type === "ticket")
          .map(item => ({
            type: "ticket" as const,
            label: item.label,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            eventId: item.eventId,
            bundleId: item.bundleId,
            metadata: { cartId: item.id },
          })),
      };

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
      // Memberships redirect to /cart for the full info-collection flow, so this
      // legacy page only ever submits ticket items to the Square checkout API.
      const payload = {
        sourceId,
        verificationToken,
        items: payableItems
          .filter((item): item is TicketCartItem => item.type === "ticket")
          .map(item => ({
            type: "ticket" as const,
            label: item.label,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            eventId: item.eventId,
            bundleId: item.bundleId,
            metadata: { cartId: item.id },
          })),
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
              <>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{formatCurrency(orderSummary?.subtotal ?? cartSubtotal)}</dd>
                </div>
                {orderSummary?.taxAmount != null && orderSummary.taxAmount > 0 && (
                  <div>
                    <dt>Tax ({orderSummary.taxRate ?? 8}%)</dt>
                    <dd>{formatCurrency(orderSummary.taxAmount)}</dd>
                  </div>
                )}
                <div>
                  <dt><strong>Total</strong></dt>
                  <dd><strong>{formatCurrency(orderSummary?.total ?? cartSubtotal)}</strong></dd>
                </div>
              </>
            )}
          </dl>

          {cartPayment.error ? <p className={styles.error}>{cartPayment.error}</p> : null}
          {cartPayment.success && cartPayment.receiptEmail ? (
            <p className={styles.success}>Receipt sent to {cartPayment.receiptEmail}</p>
          ) : null}


          {hasMembershipItems && !cartPayment.squareReady ? (
            <div className={styles.refundPolicySection}>
              <label className={styles.refundPolicyCheckbox}>
                <input
                  type="checkbox"
                  checked={refundPolicyAccepted}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRefundPolicyAccepted(checked);
                    setRefundPolicyAcceptedAt(checked ? new Date().toISOString() : null);
                  }}
                />
                <span>
                  I have read and agree to the{" "}
                  <button
                    type="button"
                    className={styles.refundPolicyLink}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowRefundPolicy(prev => !prev);
                    }}
                  >
                    Refund Policy
                  </button>
                </span>
              </label>
              {showRefundPolicy ? (
                <div className={styles.refundPolicyContent}>
                  <h4>Membership Refund Policy</h4>
                  <p className={styles.refundPolicyIntro}>
                    All membership purchases are final. By purchasing a membership, you agree to the following terms:
                  </p>
                  <ul className={styles.refundPolicyList}>
                    {MEMBERSHIP_REFUND_POLICY_ITEMS.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
            ) : (
              <PrimaryButton type="button" onClick={prepareCartPayment} disabled={!hasValidWaiver || cartPayment.loading || (hasMembershipItems && !refundPolicyAccepted)}>
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
