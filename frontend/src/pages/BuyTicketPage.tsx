import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";

import { getAllPricing, type AllPricing } from "../api/pricing";
import { getTicketCatalog, type CatalogProduct, type PublicCatalog } from "../api/products";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { useCheckout } from "../context/CheckoutContext";
import styles from "./BuyTicketPage.module.css";

// Default values used before API data loads
const DEFAULT_EXTRA_ADULT_PRICE = 5;
const DEFAULT_SINGLE_ADMISSION_PRICE = 20;

type BundleInfo = {
  id: string;
  childCount: number;
  price: number;
  savings: number;
};

/** Pre-migration layout, kept so the page works until the catalog tables exist. */
function LegacyBuyTicketPage() {
  const { items, addTicketPurchase } = useCheckout();

  const [generalAdmissionQty, setGeneralAdmissionQty] = useState(1);
  const [extraAdults, setExtraAdults] = useState(0);
  const [pricingData, setPricingData] = useState<AllPricing | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState(false);

  // Calculate total children in cart for free adults display
  const totalChildrenInCart = useMemo(() => {
    let count = 0;
    for (const item of items) {
      if (item.type === "ticket" && item.status === "pending") {
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
    const singlePrice = pricingData.config.singleAdmissionPrice ?? DEFAULT_SINGLE_ADMISSION_PRICE;
    const bundles: BundleInfo[] = [];
    for (let i = 2; i <= 6; i++) {
      const bundle = pricingData.ticketBundles.find(b => b.childCount === i);
      if (bundle) {
        bundles.push({
          id: bundle.id,
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

    setGeneralAdmissionQty(1);
  }, [generalAdmissionQty, singleAdmissionPrice, generalAdmissionTotal, addTicketPurchase]);

  // Handler to add bundle to cart (one-click)
  const handleAddBundle = useCallback((bundle: BundleInfo) => {
    const cartId = `ticket-${Date.now()}`;
    const label = `${bundle.childCount} Children Bundle`;

    addTicketPurchase({
      id: cartId,
      type: "ticket",
      bundleId: bundle.id,
      label,
      quantity: 1,
      unitPrice: bundle.price,
      total: bundle.price,
      status: "pending",
    });

  }, [addTicketPurchase]);

  // Handler to add extra adults to cart
  const handleAddExtraAdults = useCallback(() => {
    if (extraAdults === 0) return;

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

    setExtraAdults(0);
  }, [extraAdults, extraAdultPrice, addTicketPurchase]);

  return (
    <section className={styles.page}>
      <div className={styles.inner}>
        {/* Compact page header */}
        <div className={styles.pageHeader}>
          <span className={styles.tag}>Play Passes</span>
          <h1>Buy Play Passes</h1>
          <p>Purchase digital passes and skip the line at the welcome desk.</p>
        </div>

        {/* Pricing Error Banner */}
        {pricingError && (
          <div className={`${styles.status} ${styles.statusError}`} role="alert">
            Unable to load current pricing. Please refresh the page or try again later.
          </div>
        )}

        {/* Main 2-column layout */}
        <div className={styles.columns}>
          {/* Left: Admission + Extra Adults */}
          <div className={styles.leftCol}>
            {/* General Admission */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>General Admission</h2>
                  <p className={styles.cardMeta}>1 free adult per child</p>
                </div>
                <span className={styles.price}>${singleAdmissionPrice}<small>/child</small></span>
              </div>
              <div className={styles.cardActions}>
                <div className={styles.qty}>
                  <button
                    type="button"
                    className={styles.qtyBtn}
                    onClick={() => setGeneralAdmissionQty(prev => Math.max(1, prev - 1))}
                    disabled={generalAdmissionQty <= 1}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className={styles.qtyNum}>{generalAdmissionQty}</span>
                  <button
                    type="button"
                    className={styles.qtyBtn}
                    onClick={() => setGeneralAdmissionQty(prev => Math.min(10, prev + 1))}
                    disabled={generalAdmissionQty >= 10}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <PrimaryButton onClick={handleAddGeneralAdmission} disabled={pricingLoading || pricingError} className={styles.addBtn}>
                  Add ${generalAdmissionTotal}
                </PrimaryButton>
              </div>
            </div>

            {/* Extra Adults */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Extra Adults</h2>
                  <p className={styles.cardMeta}>
                    {totalChildrenInCart > 0
                      ? `${totalChildrenInCart} free adult${totalChildrenInCart > 1 ? 's' : ''} included from cart`
                      : "1 free adult included per child"
                    }
                  </p>
                </div>
                <span className={styles.priceGreen}>${extraAdultPrice}<small>/each</small></span>
              </div>
              <div className={styles.cardActions}>
                <div className={styles.qty}>
                  <button
                    type="button"
                    className={styles.qtyBtn}
                    onClick={() => setExtraAdults(prev => Math.max(0, prev - 1))}
                    disabled={extraAdults <= 0}
                    aria-label="Decrease extra adults"
                  >
                    −
                  </button>
                  <span className={styles.qtyNum}>{extraAdults}</span>
                  <button
                    type="button"
                    className={styles.qtyBtn}
                    onClick={() => setExtraAdults(prev => Math.min(20, prev + 1))}
                    disabled={extraAdults >= 20}
                    aria-label="Increase extra adults"
                  >
                    +
                  </button>
                </div>
                <PrimaryButton onClick={handleAddExtraAdults} disabled={extraAdults === 0 || pricingError} className={styles.addBtn}>
                  Add ${extraAdults * extraAdultPrice}
                </PrimaryButton>
              </div>
            </div>

            {/* Grip Socks Notice */}
            <div className={styles.notice}>
              <span className={styles.noticeIcon}>🧦</span>
              <div>
                <strong>Grip socks required</strong>
                <span className={styles.noticeSub}>Available on-site for ${gripSocksPrice}/pair</span>
              </div>
            </div>
          </div>

          {/* Right: Sibling Bundles */}
          <div className={styles.rightCol}>
            <div className={styles.bundlesCard}>
              <div className={styles.bundlesHeader}>
                <h2>Sibling Bundles</h2>
                <p>Save more when siblings play together</p>
              </div>

              {pricingLoading ? (
                <div className={styles.loadingState}>Loading bundles...</div>
              ) : (
                <div className={styles.bundleList}>
                  {siblingBundles.map(bundle => (
                    <div key={bundle.childCount} className={styles.bundleRow}>
                      <div className={styles.bundleInfo}>
                        <span className={styles.bundleKids}>{bundle.childCount} Kids</span>
                        <span className={styles.bundleSave}>Save ${bundle.savings}</span>
                      </div>
                      <div className={styles.bundleRight}>
                        <span className={styles.bundlePrice}>${bundle.price}</span>
                        <button
                          type="button"
                          className={styles.bundleAddBtn}
                          onClick={() => handleAddBundle(bundle)}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dynamic page: every section and product comes from Admin -> Products.
// ---------------------------------------------------------------------------

function formatMoney(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function BuyTicketPage() {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    getTicketCatalog()
      .then(data => { if (mounted) setCatalog(data); })
      .catch(err => {
        console.error("Failed to load products:", err);
        if (mounted) setFailed(true);
      });
    return () => { mounted = false; };
  }, []);

  // Until the catalog tables exist (or if the new endpoint is unreachable),
  // fall back to the original layout, which reads /pricing.
  if (failed || (catalog && !catalog.schemaReady)) return <LegacyBuyTicketPage />;

  return <DynamicBuyTicketPage catalog={catalog} />;
}

function DynamicBuyTicketPage({ catalog }: { catalog: PublicCatalog | null }) {
  const { items, addTicketPurchase } = useCheckout();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [added, setAdded] = useState<string | null>(null);

  const allProducts = useMemo(
    () => (catalog?.categories ?? []).flatMap(c => c.items),
    [catalog],
  );
  const singleAdmission = allProducts.find(p => p.code === "single_admission")
    ?? allProducts.find(p => p.childCount === 1);

  const childrenInCart = useMemo(() => {
    let count = 0;
    for (const item of items) {
      if (item.type !== "ticket" || item.status !== "pending") continue;
      if (typeof item.childCount === "number") {
        count += item.childCount * (item.quantity || 1);
      } else {
        const match = item.label.match(/(\d+)\s*Child/i);
        if (match) count += parseInt(match[1], 10);
        else if (item.label.includes("General Admission")) count += 1;
      }
    }
    return count;
  }, [items]);

  const qtyFor = (p: CatalogProduct) => quantities[p.id] ?? 1;
  const setQty = (p: CatalogProduct, next: number) =>
    setQuantities(prev => ({ ...prev, [p.id]: Math.max(1, Math.min(p.maxQuantity || 10, next)) }));

  const addToCart = useCallback((p: CatalogProduct, quantity: number) => {
    addTicketPurchase({
      id: `ticket-${Date.now()}-${p.id}`,
      type: "ticket",
      bundleId: p.id,
      childCount: p.childCount,
      label: p.name,
      quantity,
      unitPrice: p.price,
      total: Math.round(p.price * quantity * 100) / 100,
      status: "pending",
    });
    setQuantities(prev => ({ ...prev, [p.id]: 1 }));
    setAdded(quantity > 1 ? `${quantity} × ${p.name}` : p.name);
  }, [addTicketPurchase]);

  const metaFor = (p: CatalogProduct): string | null => {
    if (p.code === "extra_adult" && childrenInCart > 0) {
      return `${childrenInCart} free adult${childrenInCart > 1 ? "s" : ""} already included from your cart`;
    }
    return p.description;
  };

  const savingsFor = (p: CatalogProduct): number => {
    if (!singleAdmission || p.childCount < 2) return 0;
    return Math.max(0, Math.round((p.childCount * singleAdmission.price - p.price) * 100) / 100);
  };

  return (
    <section className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.pageHeader}>
          <span className={styles.tag}>Play Passes</span>
          <h1>Buy Play Passes</h1>
          <p>Purchase digital passes and extras online and skip the line at the welcome desk.</p>
        </div>

        {added && (
          <div className={styles.addedBanner} role="status">
            <span><strong>{added}</strong> added to your cart.</span>
            <Link to="/cart" className={styles.addedLink}>View cart</Link>
          </div>
        )}

        {!catalog ? (
          <div className={styles.loadingState}>Loading passes…</div>
        ) : catalog.categories.length === 0 ? (
          <div className={styles.loadingState}>Online passes are not available right now. Please visit the welcome desk.</div>
        ) : (
          <div className={styles.sections}>
            {catalog.categories.map(category => (
              <section key={category.id} className={styles.section} aria-labelledby={`cat-${category.id}`}>
                <div className={styles.sectionHeader}>
                  <h2 id={`cat-${category.id}`}>{category.name}</h2>
                  {category.description && <p>{category.description}</p>}
                </div>

                {category.layout === "list" ? (
                  <div className={`${styles.bundlesCard} ${styles.listCard}`}>
                    <div className={styles.bundleList}>
                      {category.items.map(p => {
                        const savings = savingsFor(p);
                        return (
                          <div key={p.id} className={styles.bundleRow}>
                            <div className={styles.bundleInfo}>
                              {p.imageUrl && <img src={p.imageUrl} alt="" className={styles.rowThumb} />}
                              <div className={styles.rowText}>
                                <span className={styles.bundleKids}>{p.name}</span>
                                {p.description && <span className={styles.rowDesc}>{p.description}</span>}
                              </div>
                              {savings > 0 && <span className={styles.bundleSave}>Save {formatMoney(savings)}</span>}
                            </div>
                            <div className={styles.bundleRight}>
                              <span className={styles.bundlePrice}>{formatMoney(p.price)}</span>
                              <button type="button" className={styles.bundleAddBtn} onClick={() => addToCart(p, 1)}>
                                Add
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className={styles.productGrid}>
                    {category.items.map(p => {
                      const qty = qtyFor(p);
                      const meta = metaFor(p);
                      return (
                        <div key={p.id} className={`${styles.card} ${styles.productCard}`}>
                          {p.imageUrl && <img src={p.imageUrl} alt={p.name} className={styles.productImage} loading="lazy" />}
                          <div className={styles.cardHeader}>
                            <div>
                              <h3 className={styles.cardTitle}>{p.name}</h3>
                              {meta && <p className={styles.cardMeta}>{meta}</p>}
                            </div>
                            <span className={styles.price}>
                              {formatMoney(p.price)}{p.unitLabel && <small>/{p.unitLabel}</small>}
                            </span>
                          </div>
                          <div className={styles.cardActions}>
                            <div className={styles.qty}>
                              <button
                                type="button"
                                className={styles.qtyBtn}
                                onClick={() => setQty(p, qty - 1)}
                                disabled={qty <= 1}
                                aria-label={`Fewer ${p.name}`}
                              >
                                −
                              </button>
                              <span className={styles.qtyNum} aria-live="polite">{qty}</span>
                              <button
                                type="button"
                                className={styles.qtyBtn}
                                onClick={() => setQty(p, qty + 1)}
                                disabled={qty >= (p.maxQuantity || 10)}
                                aria-label={`More ${p.name}`}
                              >
                                +
                              </button>
                            </div>
                            <PrimaryButton onClick={() => addToCart(p, qty)} className={styles.addBtn}>
                              Add {formatMoney(Math.round(p.price * qty * 100) / 100)}
                            </PrimaryButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
