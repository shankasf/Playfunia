import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";

import { getAllPricing, type AllPricing } from "../api/pricing";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { useCheckout } from "../context/CheckoutContext";
import styles from "./BuyTicketPage.module.css";

// Default values used before API data loads
const DEFAULT_EXTRA_ADULT_PRICE = 5;
const DEFAULT_SINGLE_ADMISSION_PRICE = 20;

type BundleInfo = {
  childCount: number;
  price: number;
  savings: number;
};

type GuestForm = {
  waiverAccepted: boolean;
};

export function BuyTicketPage() {
  const { user } = useAuth();
  const { items, addTicketPurchase } = useCheckout();

  const [generalAdmissionQty, setGeneralAdmissionQty] = useState(1);
  const [extraAdults, setExtraAdults] = useState(0);
  const [popup, setPopup] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const popupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pricingData, setPricingData] = useState<AllPricing | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState(false);

  // Guest form state
  const [guestForm, setGuestForm] = useState<GuestForm>({
    waiverAccepted: false,
  });

  // Calculate total children in cart for free adults display
  const totalChildrenInCart = useMemo(() => {
    let count = 0;
    for (const item of items) {
      if (item.type === "ticket" && item.status === "pending") {
        // Parse label to get child count
        const match = item.label.match(/(\d+)\s*Child/i);
        if (match) {
          count += parseInt(match[1], 10);
        } else if (item.label.includes("General Admission")) {
          count += 1;
        }
      }
    }
    return count;
  }, [items]);

  const showPopup = useCallback((type: "success" | "error", message: string) => {
    clearTimeout(popupTimer.current);
    setPopup({ type, message });
    if (type === "success") {
      popupTimer.current = setTimeout(() => setPopup(null), 4000);
    }
  }, []);

  const dismissPopup = useCallback(() => {
    clearTimeout(popupTimer.current);
    setPopup(null);
  }, []);

  useEffect(() => () => clearTimeout(popupTimer.current), []);

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
        if (mounted) {
          setPricingError(true);
        }
      } finally {
        if (mounted) {
          setPricingLoading(false);
        }
      }
    }
    loadPricing();
    return () => { mounted = false; };
  }, []);

  // Get bundle info for sibling bundles (2-6 kids)
  const siblingBundles = useMemo((): BundleInfo[] => {
    if (!pricingData) return [];

    // Use single admission price from API for savings calculation
    const singlePrice = pricingData.config.singleAdmissionPrice ?? DEFAULT_SINGLE_ADMISSION_PRICE;
    const bundles: BundleInfo[] = [];
    for (let i = 2; i <= 6; i++) {
      const bundle = pricingData.ticketBundles.find(b => b.childCount === i);
      if (bundle) {
        bundles.push({
          childCount: i,
          price: bundle.price,
          savings: (i * singlePrice) - bundle.price,
        });
      }
    }
    return bundles;
  }, [pricingData]);

  // Get pricing values from API (with fallbacks)
  const gripSocksPrice = pricingData?.config.gripSocksPrice ?? 3;
  const singleAdmissionPrice = pricingData?.config.singleAdmissionPrice ?? DEFAULT_SINGLE_ADMISSION_PRICE;
  const extraAdultPrice = pricingData?.config.extraAdultAdmission ?? DEFAULT_EXTRA_ADULT_PRICE;

  // Calculate general admission total using API price
  const generalAdmissionTotal = generalAdmissionQty * singleAdmissionPrice;

  // Handler to add general admission to cart
  const handleAddGeneralAdmission = useCallback(() => {
    if (!user && !guestForm.waiverAccepted) {
      showPopup("error", "Please accept the waiver agreement to continue.");
      return;
    }
    if (user && !user.hasValidWaiver) {
      showPopup("error", "Please sign the Playfunia waiver before purchasing tickets.");
      return;
    }

    const cartId = `ticket-${Date.now()}`;
    const label = generalAdmissionQty === 1
      ? "General Admission (1 Child)"
      : `General Admission (${generalAdmissionQty} Children)`;

    addTicketPurchase({
      id: cartId,
      type: "ticket",
      label,
      quantity: generalAdmissionQty,
      unitPrice: singleAdmissionPrice,
      total: generalAdmissionTotal,
      status: "pending",
    });

    showPopup("success", `${label} added to cart!`);
    setGeneralAdmissionQty(1);
  }, [user, guestForm.waiverAccepted, generalAdmissionQty, singleAdmissionPrice, generalAdmissionTotal, addTicketPurchase, showPopup]);

  // Handler to add bundle to cart (one-click)
  const handleAddBundle = useCallback((bundle: BundleInfo) => {
    if (!user && !guestForm.waiverAccepted) {
      showPopup("error", "Please accept the waiver agreement to continue.");
      return;
    }
    if (user && !user.hasValidWaiver) {
      showPopup("error", "Please sign the Playfunia waiver before purchasing tickets.");
      return;
    }

    const cartId = `ticket-${Date.now()}`;
    const label = `${bundle.childCount} Children Bundle`;

    addTicketPurchase({
      id: cartId,
      type: "ticket",
      label,
      quantity: 1,
      unitPrice: bundle.price,
      total: bundle.price,
      status: "pending",
    });

    showPopup("success", `${label} added to cart!`);
  }, [user, guestForm.waiverAccepted, addTicketPurchase, showPopup]);

  // Handler to add extra adults to cart
  const handleAddExtraAdults = useCallback(() => {
    if (extraAdults === 0) return;

    if (!user && !guestForm.waiverAccepted) {
      showPopup("error", "Please accept the waiver agreement to continue.");
      return;
    }
    if (user && !user.hasValidWaiver) {
      showPopup("error", "Please sign the Playfunia waiver before purchasing tickets.");
      return;
    }

    const cartId = `ticket-${Date.now()}`;
    const label = `Extra Adult${extraAdults > 1 ? 's' : ''} (${extraAdults})`;
    const total = extraAdults * extraAdultPrice;

    addTicketPurchase({
      id: cartId,
      type: "ticket",
      label,
      quantity: extraAdults,
      unitPrice: extraAdultPrice,
      total,
      status: "pending",
    });

    showPopup("success", `${extraAdults} extra adult${extraAdults > 1 ? 's' : ''} added to cart!`);
    setExtraAdults(0);
  }, [user, guestForm.waiverAccepted, extraAdults, extraAdultPrice, addTicketPurchase, showPopup]);

  const handleGuestChange = (field: keyof GuestForm, value: boolean) => {
    setGuestForm(prev => ({ ...prev, [field]: value }));
  };

  const hasValidWaiver = user?.hasValidWaiver ?? false;

  return (
    <section className={styles.page}>
      <div className={styles.inner}>
        {/* Hero Section */}
        <div className={styles.hero}>
          <span className={styles.tag}>Play Passes</span>
          <h1>Buy Play Passes</h1>
          <p>
            Skip the line! Purchase digital passes for the kids before you arrive.
            Present your confirmation at the welcome desk for speedy entry.
          </p>
        </div>

        {/* Pricing Error Banner */}
        {pricingError && (
          <div className={`${styles.status} ${styles.statusError}`} role="alert">
            Unable to load current pricing. Please refresh the page or try again later.
          </div>
        )}

        {/* Guest Sign-in Prompt */}
        {!user && (
          <p className={styles.guestFormHint}>
            Already have an account? <Link to="/account" className={styles.signInLink}>Sign in</Link> for faster checkout.
          </p>
        )}

        {/* Featured: General Admission Card */}
        <div className={styles.featuredCard}>
          <div className={styles.featuredHeader}>
            <h2>General Admission</h2>
            <span className={styles.featuredPrice}>${singleAdmissionPrice} per child</span>
          </div>
          <p className={styles.featuredDescription}>1 free adult included with each child</p>

          <div className={styles.quantityRow}>
            <div className={styles.quantityControls}>
              <button
                type="button"
                className={styles.quantityBtn}
                onClick={() => setGeneralAdmissionQty(prev => Math.max(1, prev - 1))}
                disabled={generalAdmissionQty <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className={styles.quantityDisplay}>{generalAdmissionQty}</span>
              <button
                type="button"
                className={styles.quantityBtn}
                onClick={() => setGeneralAdmissionQty(prev => Math.min(10, prev + 1))}
                disabled={generalAdmissionQty >= 10}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <PrimaryButton onClick={handleAddGeneralAdmission} disabled={pricingLoading || pricingError}>
              Add to Cart — ${generalAdmissionTotal}
            </PrimaryButton>
          </div>
        </div>

        {/* Sibling Bundles Section */}
        <div className={styles.bundlesSection}>
          <h2>Sibling Bundles</h2>
          <p className={styles.bundlesSubtitle}>Save more when siblings play together</p>

          {pricingLoading ? (
            <div className={styles.loadingState}>Loading bundles...</div>
          ) : (
            <div className={styles.bundleGrid}>
              {siblingBundles.map(bundle => (
                <div key={bundle.childCount} className={styles.bundleCard}>
                  <div className={styles.bundleTitle}>{bundle.childCount} Kids</div>
                  <div className={styles.bundlePrice}>${bundle.price}</div>
                  <div className={styles.bundleSavings}>Save ${bundle.savings}</div>
                  <button
                    type="button"
                    className={styles.bundleAddBtn}
                    onClick={() => handleAddBundle(bundle)}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Extra Adults Add-on */}
        <div className={styles.addonCard}>
          <div className={styles.addonHeader}>
            <h2>Extra Adults</h2>
            <span className={styles.addonPrice}>${extraAdultPrice} each</span>
          </div>
          <p className={styles.addonDescription}>
            {totalChildrenInCart > 0
              ? `${totalChildrenInCart} free adult${totalChildrenInCart > 1 ? 's' : ''} already included based on your cart`
              : "1 free adult included with each child admission"
            }
          </p>

          <div className={styles.quantityRow}>
            <div className={styles.quantityControls}>
              <button
                type="button"
                className={styles.quantityBtn}
                onClick={() => setExtraAdults(prev => Math.max(0, prev - 1))}
                disabled={extraAdults <= 0}
                aria-label="Decrease extra adults"
              >
                −
              </button>
              <span className={styles.quantityDisplay}>{extraAdults}</span>
              <button
                type="button"
                className={styles.quantityBtn}
                onClick={() => setExtraAdults(prev => Math.min(20, prev + 1))}
                disabled={extraAdults >= 20}
                aria-label="Increase extra adults"
              >
                +
              </button>
            </div>
            <PrimaryButton onClick={handleAddExtraAdults} disabled={extraAdults === 0 || pricingError}>
              Add to Cart — ${extraAdults * extraAdultPrice}
            </PrimaryButton>
          </div>
        </div>

        {/* Grip Socks Info Notice */}
        <div className={styles.infoNotice}>
          <strong>Grip socks required</strong>
          <span>Pick them up on-site for ${gripSocksPrice}/pair</span>
        </div>

        {/* Waiver Section */}
        <div className={styles.waiverSection}>
          {!user ? (
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
          ) : hasValidWaiver ? (
            <div className={styles.waiverSigned}>
              <span className={styles.waiverCheckmark}>✓</span>
              <span>Waiver signed — you're all set!</span>
            </div>
          ) : (
            <div className={styles.waiverNeeded}>
              <strong>Action needed:</strong> Please complete the Playfunia waiver before purchasing tickets.
              <PrimaryButton to="/waiver?return=/buy-ticket">Sign the Waiver</PrimaryButton>
            </div>
          )}
        </div>

      </div>

      {/* Popup Modal */}
      {popup && (
        <div className={styles.popupOverlay} onClick={dismissPopup}>
          <div
            className={`${styles.popupCard} ${popup.type === "success" ? styles.popupSuccess : styles.popupError}`}
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.popupIcon}>
              {popup.type === "success" ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              )}
            </div>
            <p className={styles.popupMessage}>{popup.message}</p>
            <button type="button" className={styles.popupBtn} onClick={dismissPopup}>
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
