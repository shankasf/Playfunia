import { FormEvent, useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getAllPricing, type AllPricing } from "../api/pricing";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { useCheckout, type TicketCartItem } from "../context/CheckoutContext";
import styles from "./BuyTicketPage.module.css";

type PricingInfo = {
  total: number;
  unitPrice: number;
  label: string;
  description: string;
};

type GuestForm = {
  waiverAccepted: boolean;
};

export function BuyTicketPage() {
  const { user } = useAuth();
  const { items, addTicketPurchase, updateTicketQuantity, removeItem } = useCheckout();
  const [searchParams] = useSearchParams();

  // Restore quantity from URL params (for returning from waiver page)
  const initialQuantity = useMemo(() => {
    const qtyParam = searchParams.get('qty');
    if (qtyParam) {
      const parsed = parseInt(qtyParam, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 6) {
        return parsed;
      }
    }
    return 1;
  }, [searchParams]);

  const [quantity, setQuantity] = useState(initialQuantity);
  const [extraAdults, setExtraAdults] = useState(0);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });

  const EXTRA_ADULT_PRICE = 5;

  // Find all pending tickets in cart
  const ticketsInCart = useMemo(() => {
    return items.filter(
      (item): item is TicketCartItem => item.type === "ticket" && item.status === "pending"
    );
  }, [items]);

  // Get total tickets in cart
  const totalTicketsInCart = ticketsInCart.reduce((sum, t) => sum + t.quantity, 0);
  const cartTotal = ticketsInCart.reduce((sum, t) => sum + t.total, 0);

  // Pricing data from API
  const [pricingData, setPricingData] = useState<AllPricing | null>(null);
  const [, setPricingLoading] = useState(true);

  // Guest form state
  const [guestForm, setGuestForm] = useState<GuestForm>({
    waiverAccepted: false,
  });

  // Fetch pricing data from API
  useEffect(() => {
    let mounted = true;
    async function loadPricing() {
      try {
        const data = await getAllPricing();
        if (mounted) {
          setPricingData(data);
        }
      } catch (error) {
        console.error("Failed to load pricing:", error);
      } finally {
        if (mounted) {
          setPricingLoading(false);
        }
      }
    }
    loadPricing();
    return () => { mounted = false; };
  }, []);

  // Calculate pricing using fetched data
  const calculatePricingFromData = useCallback((qty: number): PricingInfo => {
    if (!pricingData) {
      // Fallback while loading
      return { total: 0, unitPrice: 0, label: "Loading...", description: "" };
    }

    if (qty <= 0) {
      return { total: 0, unitPrice: 0, label: "No tickets selected", description: "" };
    }

    const bundles = pricingData.ticketBundles;
    const config = pricingData.config;

    // Find exact match bundle
    const exactMatch = bundles.find(b => b.childCount === qty);
    if (exactMatch) {
      return {
        total: exactMatch.price,
        unitPrice: exactMatch.price / qty,
        label: exactMatch.name,
        description: exactMatch.description ?? "",
      };
    }

    // Find the largest bundle for quantities > max bundle
    const sortedBundles = [...bundles]
      .filter(b => b.childCount > 0 && !b.name.toLowerCase().includes("additional"))
      .sort((a, b) => b.childCount - a.childCount);

    if (sortedBundles.length > 0 && qty > sortedBundles[0].childCount) {
      const largestBundle = sortedBundles[0];
      const extraChildren = qty - largestBundle.childCount;
      const extraTotal = extraChildren * config.extraChildAdmission;
      const total = largestBundle.price + extraTotal;

      return {
        total,
        unitPrice: total / qty,
        label: `${largestBundle.name} + ${extraChildren} extra`,
        description: `Save with the bundle; additional kids are $${config.extraChildAdmission} each.`,
      };
    }

    // Fallback: single admission
    const singleAdmission = bundles.find(b => b.childCount === 1);
    const singlePrice = singleAdmission?.price ?? 20;

    return {
      total: singlePrice * qty,
      unitPrice: singlePrice,
      label: `${qty} play pass${qty > 1 ? "es" : ""}`,
      description: "",
    };
  }, [pricingData]);

  const pricing = useMemo(() => calculatePricingFromData(quantity), [calculatePricingFromData, quantity]);

  // Helper to get bundle price for display
  const getBundlePrice = (childCount: number): string => {
    if (!pricingData) return "...";
    const bundle = pricingData.ticketBundles.find(b => b.childCount === childCount);
    return bundle ? `$${bundle.price}` : "...";
  };

  // Helper to get numeric config value
  type NumericConfigKey = 'cleaningFee' | 'gripSocksPrice' | 'extraChildAdmission' | 'depositPercentage';
  const getConfigValue = (key: NumericConfigKey): number => {
    if (!pricingData) return 0;
    return pricingData.config[key];
  };

  const handleGuestChange = (field: keyof GuestForm, value: boolean) => {
    setGuestForm(prev => ({ ...prev, [field]: value }));
  };

  // Handler to remove a ticket from cart
  const handleRemoveTicket = (ticketId: string) => {
    removeItem(ticketId);
    if (ticketsInCart.length <= 1) {
      setStatus({ type: "idle" });
    }
  };

  const handleGuestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!guestForm.waiverAccepted) {
      setStatus({ type: "error", message: "Please accept the waiver agreement to continue." });
      return;
    }

    // Add ticket to cart as a single bundle
    const cartId = `ticket-${Date.now()}`;
    const extraAdultsCost = extraAdults * EXTRA_ADULT_PRICE;
    const totalWithAdults = pricing.total + extraAdultsCost;
    let bundleLabel = quantity === 1 ? "General Admission (1 Child)" : `${quantity} Children Bundle`;
    if (extraAdults > 0) {
      bundleLabel += ` + ${extraAdults} Extra Adult${extraAdults > 1 ? 's' : ''}`;
    }
    addTicketPurchase({
      id: cartId,
      type: "ticket",
      label: bundleLabel,
      quantity: 1,
      unitPrice: totalWithAdults,
      total: totalWithAdults,
      status: "pending",
    });

    setStatus({
      type: "success",
      message: `${bundleLabel} added to cart!`,
    });

    // Reset extra adults for next purchase
    setExtraAdults(0);

    // Reset quantity for next addition
    setQuantity(1);
  };

  // Show guest form for non-authenticated users
  if (!user) {
    return (
      <section className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.hero}>
            <span className={styles.tag}>Buy a ticket</span>
            <h1>Grab day passes without the line</h1>
            <p>Secure your play passes in advance, then breeze through check-in with your digital confirmation.</p>
          </div>

          <form className={styles.layout} onSubmit={handleGuestSubmit}>
            <div className={styles.card}>
              <h2>Choose how many kids are playing</h2>
              <p className={styles.guestFormHint}>
                Already have an account? <Link to="/account" className={styles.signInLink}>Sign in</Link> for faster checkout.
              </p>
              <div className={styles.field}>
                <label htmlFor="ticket-quantity">Number of kids</label>
                <select
                  id="ticket-quantity"
                  value={quantity}
                  onChange={event => setQuantity(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map(option => (
                    <option key={option} value={option}>
                      {option} {option === 1 ? "child" : "children"}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.bundleList}>
                <div className={styles.bundleOption}>
                  <span>General Admission</span>
                  <span>{getBundlePrice(1)}</span>
                </div>
                <div className={styles.bundleOption}>
                  <span>2 Children <span className={styles.savings}>(Save $5)</span></span>
                  <span>{getBundlePrice(2)}</span>
                </div>
                <div className={styles.bundleOption}>
                  <span>3 Children <span className={styles.savings}>(Save $10)</span></span>
                  <span>{getBundlePrice(3)}</span>
                </div>
                <div className={styles.bundleOption}>
                  <span>4 Children <span className={styles.savings}>(Save $15)</span></span>
                  <span>{getBundlePrice(4)}</span>
                </div>
                <div className={styles.bundleOption}>
                  <span>5 Children <span className={styles.savings}>(Save $20)</span></span>
                  <span>{getBundlePrice(5)}</span>
                </div>
                <div className={styles.bundleOption}>
                  <span>6 Children <span className={styles.savings}>(Save $30)</span></span>
                  <span>{getBundlePrice(6)}</span>
                </div>
              </div>

              <div className={styles.pricingNotes}>
                <p>This discount applies to siblings only.</p>
                <p>One adult may enter free with each paid child admission.</p>
                <p>Each extra adult will be charged a $5 entry fee.</p>
              </div>

              <div className={styles.extraAdultsSection}>
                <div className={styles.extraAdultsHeader}>
                  <span>Extra Adults</span>
                  <span className={styles.extraAdultsNote}>({quantity} free adult{quantity > 1 ? 's' : ''} included with your bundle)</span>
                </div>
                <div className={styles.extraAdultsControls}>
                  <button
                    type="button"
                    className={styles.adultBtn}
                    onClick={() => setExtraAdults(prev => Math.max(0, prev - 1))}
                    disabled={extraAdults === 0}
                    aria-label="Decrease extra adults"
                  >
                    −
                  </button>
                  <span className={styles.adultCount}>{extraAdults}</span>
                  <button
                    type="button"
                    className={styles.adultBtn}
                    onClick={() => setExtraAdults(prev => prev + 1)}
                    aria-label="Increase extra adults"
                  >
                    +
                  </button>
                  <span className={styles.adultPrice}>${EXTRA_ADULT_PRICE} each</span>
                </div>
              </div>

              <p className={styles.helper}>Grip socks are required for play; pick them up on-site for ${getConfigValue("gripSocksPrice")} a pair.</p>

              <div className={styles.summary}>
                <div className={styles.summaryRow}>
                  <span>Bundle</span>
                  <span>{pricing.label}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Total kids</span>
                  <span>{quantity}</span>
                </div>
                {extraAdults > 0 && (
                  <div className={styles.summaryRow}>
                    <span>Extra adults ({extraAdults} × ${EXTRA_ADULT_PRICE})</span>
                    <span>${(extraAdults * EXTRA_ADULT_PRICE).toFixed(2)}</span>
                  </div>
                )}
                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                  <span>Total today</span>
                  <span>${(pricing.total + extraAdults * EXTRA_ADULT_PRICE).toFixed(2)}</span>
                </div>
              </div>

              <label className={styles.guestWaiverCheckbox}>
                <input
                  type="checkbox"
                  checked={guestForm.waiverAccepted}
                  onChange={e => handleGuestChange("waiverAccepted", e.target.checked)}
                />
                <span>
                  I agree to the Playfunia <a href="/waiver" target="_blank" rel="noopener noreferrer">waiver and liability release</a>.
                  I understand I will need to sign the full waiver on arrival.
                </span>
              </label>

              {status.type === "error" ? (
                <p className={`${styles.status} ${styles.statusError}`}>{status.message}</p>
              ) : null}
              {status.type === "success" ? (
                <p className={`${styles.status} ${styles.statusSuccess}`}>{status.message}</p>
              ) : null}

              <PrimaryButton type="submit">
                Add to Cart
              </PrimaryButton>

              {ticketsInCart.length > 0 && (
                <div className={styles.cartSummary}>
                  <h3>In Your Cart</h3>
                  <ul className={styles.cartList}>
                    {ticketsInCart.map((ticket) => (
                      <li key={ticket.id} className={styles.cartItem}>
                        <span>{ticket.quantity}x {ticket.label}</span>
                        <span>${ticket.total.toFixed(2)}</span>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => handleRemoveTicket(ticket.id)}
                          aria-label="Remove from cart"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.cartTotal}>
                    <span>Total: {totalTicketsInCart} pass{totalTicketsInCart === 1 ? "" : "es"}</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <Link to="/cart" className={styles.viewCartBtn}>View Cart & Checkout</Link>
                </div>
              )}
            </div>
          </form>
        </div>
      </section>
    );
  }

  const hasValidWaiver = user.hasValidWaiver ?? false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasValidWaiver) {
      setStatus({
        type: "error",
        message: "Please sign the Playfunia waiver before purchasing tickets.",
      });
      return;
    }

    // Add ticket to cart as a single bundle
    const cartId = `ticket-${Date.now()}`;
    const extraAdultsCost = extraAdults * EXTRA_ADULT_PRICE;
    const totalWithAdults = pricing.total + extraAdultsCost;
    let bundleLabel = quantity === 1 ? "General Admission (1 Child)" : `${quantity} Children Bundle`;
    if (extraAdults > 0) {
      bundleLabel += ` + ${extraAdults} Extra Adult${extraAdults > 1 ? 's' : ''}`;
    }
    addTicketPurchase({
      id: cartId,
      type: "ticket",
      label: bundleLabel,
      quantity: 1,
      unitPrice: totalWithAdults,
      total: totalWithAdults,
      status: "pending",
    });

    setStatus({
      type: "success",
      message: `${bundleLabel} added to cart!`,
    });

    // Reset extra adults for next purchase
    setExtraAdults(0);

    // Reset quantity for next addition
    setQuantity(1);
  };

  return (
    <section className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.hero}>
          <span className={styles.tag}>Buy a ticket</span>
          <h1>Secure your Playfunia play passes</h1>
          <p>
            Purchase digital passes for the kids before you arrive. Present your confirmation email or the unique codes
            below at the welcome desk for speedy entry.
          </p>
        </div>

        <form className={styles.layout} onSubmit={handleSubmit}>
          <div className={styles.card}>
            <h2>Choose how many kids are playing</h2>
            <div className={styles.field}>
              <label htmlFor="ticket-quantity">Number of kids</label>
              <select
                id="ticket-quantity"
                value={quantity}
                onChange={event => setQuantity(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map(option => (
                  <option key={option} value={option}>
                    {option} {option === 1 ? "child" : "children"}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.bundleList}>
              <div className={styles.bundleOption}>
                <span>General Admission</span>
                <span>{getBundlePrice(1)}</span>
              </div>
              <div className={styles.bundleOption}>
                <span>2 Children <span className={styles.savings}>(Save $5)</span></span>
                <span>{getBundlePrice(2)}</span>
              </div>
              <div className={styles.bundleOption}>
                <span>3 Children <span className={styles.savings}>(Save $10)</span></span>
                <span>{getBundlePrice(3)}</span>
              </div>
              <div className={styles.bundleOption}>
                <span>4 Children <span className={styles.savings}>(Save $15)</span></span>
                <span>{getBundlePrice(4)}</span>
              </div>
              <div className={styles.bundleOption}>
                <span>5 Children <span className={styles.savings}>(Save $20)</span></span>
                <span>{getBundlePrice(5)}</span>
              </div>
              <div className={styles.bundleOption}>
                <span>6 Children <span className={styles.savings}>(Save $30)</span></span>
                <span>{getBundlePrice(6)}</span>
              </div>
            </div>

            <div className={styles.pricingNotes}>
              <p>This discount applies to siblings only.</p>
              <p>One adult may enter free with each paid child admission.</p>
              <p>Each extra adult will be charged a $5 entry fee.</p>
            </div>

            <div className={styles.extraAdultsSection}>
              <div className={styles.extraAdultsHeader}>
                <span>Extra Adults</span>
                <span className={styles.extraAdultsNote}>({quantity} free adult{quantity > 1 ? 's' : ''} included with your bundle)</span>
              </div>
              <div className={styles.extraAdultsControls}>
                <button
                  type="button"
                  className={styles.adultBtn}
                  onClick={() => setExtraAdults(prev => Math.max(0, prev - 1))}
                  disabled={extraAdults === 0}
                  aria-label="Decrease extra adults"
                >
                  −
                </button>
                <span className={styles.adultCount}>{extraAdults}</span>
                <button
                  type="button"
                  className={styles.adultBtn}
                  onClick={() => setExtraAdults(prev => prev + 1)}
                  aria-label="Increase extra adults"
                >
                  +
                </button>
                <span className={styles.adultPrice}>${EXTRA_ADULT_PRICE} each</span>
              </div>
            </div>

            <p className={styles.helper}>Grip socks are required for play; pick them up on-site for ${getConfigValue("gripSocksPrice")} a pair.</p>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>Bundle</span>
                <span>{pricing.label}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Total kids</span>
                <span>{quantity}</span>
              </div>
              {extraAdults > 0 && (
                <div className={styles.summaryRow}>
                  <span>Extra adults ({extraAdults} × ${EXTRA_ADULT_PRICE})</span>
                  <span>${(extraAdults * EXTRA_ADULT_PRICE).toFixed(2)}</span>
                </div>
              )}
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>Total today</span>
                <span>${(pricing.total + extraAdults * EXTRA_ADULT_PRICE).toFixed(2)}</span>
              </div>
            </div>

            <div className={styles.waiverReminder}>
              {hasValidWaiver ? (
                <>Every child must have a signed Playfunia waiver on file before entering the play zones.</>
              ) : (
                <>
                  <strong>Action needed:</strong> Please complete the Playfunia waiver before purchasing tickets.{" "}
                  <PrimaryButton to={`/waiver?return=/buy-ticket?qty=${quantity}`}>Sign the waiver</PrimaryButton>
                </>
              )}
            </div>

            {status.type === "error" ? (
              <p className={`${styles.status} ${styles.statusError}`}>{status.message}</p>
            ) : null}
            {status.type === "success" ? (
              <p className={`${styles.status} ${styles.statusSuccess}`}>{status.message}</p>
            ) : null}

            <PrimaryButton type="submit" disabled={!hasValidWaiver}>
              Add to Cart
            </PrimaryButton>

            {ticketsInCart.length > 0 && (
              <div className={styles.cartSummary}>
                <h3>In Your Cart</h3>
                <ul className={styles.cartList}>
                  {ticketsInCart.map((ticket) => (
                    <li key={ticket.id} className={styles.cartItem}>
                      <span>{ticket.quantity}x {ticket.label}</span>
                      <span>${ticket.total.toFixed(2)}</span>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => handleRemoveTicket(ticket.id)}
                        aria-label="Remove from cart"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className={styles.cartTotal}>
                  <span>Total: {totalTicketsInCart} pass{totalTicketsInCart === 1 ? "" : "es"}</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
                <Link to="/cart" className={styles.viewCartBtn}>View Cart & Checkout</Link>
              </div>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
