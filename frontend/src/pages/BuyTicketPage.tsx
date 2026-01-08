import { FormEvent, useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";

import { getAllPricing, type AllPricing } from "../api/pricing";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { useCheckout } from "../context/CheckoutContext";
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
  const { addTicketPurchase } = useCheckout();
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });

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

  // Helper to get config value
  const getConfigValue = (key: keyof AllPricing["config"]): number => {
    if (!pricingData) return 0;
    return pricingData.config[key];
  };

  const handleGuestChange = (field: keyof GuestForm, value: boolean) => {
    setGuestForm(prev => ({ ...prev, [field]: value }));
  };

  const handleGuestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!guestForm.waiverAccepted) {
      setStatus({ type: "error", message: "Please accept the waiver agreement to continue." });
      return;
    }

    // Add ticket to cart
    const cartId = `ticket-${Date.now()}`;
    addTicketPurchase({
      id: cartId,
      type: "ticket",
      label: pricing.label,
      quantity,
      unitPrice: Number(pricing.unitPrice.toFixed(2)),
      total: pricing.total,
      status: "pending",
    });

    setStatus({
      type: "success",
      message: `${quantity} play pass${quantity === 1 ? "" : "es"} added to cart! Click the cart icon to complete your purchase.`,
    });
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
                  <span>Single Play Pass</span>
                  <span>{getBundlePrice(1)}</span>
                </div>
                <div className={styles.bundleOption}>
                  <span>Sibling Duo Bundle</span>
                  <span>{getBundlePrice(2)}</span>
                </div>
                <div className={styles.bundleOption}>
                  <span>Bestie Trio Bundle</span>
                  <span>{getBundlePrice(3)}</span>
                </div>
              </div>

              <p className={styles.helper}>
                Need more than three passes? Each additional child is only ${getConfigValue("extraChildAdmission")} when purchased with the trio bundle.
              </p>
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
                <div className={styles.summaryRow}>
                  <span>Per pass</span>
                  <span>${pricing.unitPrice.toFixed(2)}</span>
                </div>
                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                  <span>Total today</span>
                  <span>${pricing.total.toFixed(2)}</span>
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

              <PrimaryButton type="submit" disabled={status.type === "success"}>
                Add to Cart
              </PrimaryButton>
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

    // Add ticket to cart
    const cartId = `ticket-${Date.now()}`;
    addTicketPurchase({
      id: cartId,
      type: "ticket",
      label: pricing.label,
      quantity,
      unitPrice: Number(pricing.unitPrice.toFixed(2)),
      total: pricing.total,
      status: "pending",
    });

    setStatus({
      type: "success",
      message: `${quantity} play pass${quantity === 1 ? "" : "es"} added to cart! Click the cart icon to complete your purchase.`,
    });
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
                <span>Single Play Pass</span>
                <span>{getBundlePrice(1)}</span>
              </div>
              <div className={styles.bundleOption}>
                <span>Sibling Duo Bundle</span>
                <span>{getBundlePrice(2)}</span>
              </div>
              <div className={styles.bundleOption}>
                <span>Bestie Trio Bundle</span>
                <span>{getBundlePrice(3)}</span>
              </div>
            </div>

            <p className={styles.helper}>
              Need more than three passes? Each additional child is only ${getConfigValue("extraChildAdmission")} when purchased with the trio bundle.
            </p>
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
              <div className={styles.summaryRow}>
                <span>Per pass</span>
                <span>${pricing.unitPrice.toFixed(2)}</span>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>Total today</span>
                <span>${pricing.total.toFixed(2)}</span>
              </div>
            </div>

            <div className={styles.waiverReminder}>
              {hasValidWaiver ? (
                <>Every child must have a signed Playfunia waiver on file before entering the play zones.</>
              ) : (
                <>
                  <strong>Action needed:</strong> Please complete the Playfunia waiver before purchasing tickets.{" "}
                  <PrimaryButton to="/waiver">Sign the waiver</PrimaryButton>
                </>
              )}
            </div>

            {status.type === "error" ? (
              <p className={`${styles.status} ${styles.statusError}`}>{status.message}</p>
            ) : null}
            {status.type === "success" ? (
              <p className={`${styles.status} ${styles.statusSuccess}`}>{status.message}</p>
            ) : null}

            <PrimaryButton type="submit" disabled={!hasValidWaiver || status.type === "success"}>
              Add to Cart
            </PrimaryButton>
          </div>
        </form>
      </div>
    </section>
  );
}
