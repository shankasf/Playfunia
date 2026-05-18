import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PrimaryButton } from "../components/common/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { useCheckout } from "../context/CheckoutContext";
import { fetchMembershipPlans, MembershipPlanDto } from "../api/memberships";
import { formatDate } from "../lib/dateUtils";
import { MEMBERSHIP_REFUND_POLICY_ITEMS } from "../data/membershipRefundPolicy";
import styles from "./MembershipPage.module.css";

const DURATION_OPTIONS = [
  { label: "1 month", value: 1 },
  { label: "3 months", value: 3 },
  { label: "6 months", value: 6 },
  { label: "12 months", value: 12 },
];

export function MembershipPage() {
  const { user } = useAuth();
  const { addMembershipPurchase } = useCheckout();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<MembershipPlanDto[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(DURATION_OPTIONS[0].value);
  const [autoRenew, setAutoRenew] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });

  const selectedPlan = useMemo(
    () => plans.find(plan => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  useEffect(() => {
    let active = true;
    async function loadPlans() {
      setLoadingPlans(true);
      setPlansError(null);
      try {
        const result = await fetchMembershipPlans();
        if (!active) return;
        setPlans(result);
        if (result[0]) {
          setSelectedPlanId(result[0].id);
        }
      } catch (error) {
        if (!active) return;
        setPlansError(error instanceof Error ? error.message : "Unable to load membership plans.");
      } finally {
        if (active) {
          setLoadingPlans(false);
        }
      }
    }

    loadPlans();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlanId) {
      setStatus({ type: "error", message: "Select a membership tier to continue." });
      return;
    }

    // Require login before adding membership to cart
    if (!user) {
      navigate("/account?redirect=/memberships");
      return;
    }

    setSubmitting(true);
    setStatus({ type: "idle" });
    try {
      const plan = plans.find(candidate => candidate.id === selectedPlanId);
      if (!plan) {
        throw new Error("Membership plan not found. Please reload and try again.");
      }

      const cartId = `membership-${selectedPlanId}-${Date.now()}`;
      addMembershipPurchase({
        id: cartId,
        type: "membership",
        membershipId: selectedPlanId,
        label: plan.name,
        monthlyPrice: plan.monthlyPrice,
        durationMonths: duration,
        autoRenew,
        total: Math.round(Math.round(plan.monthlyPrice * 100) * duration) / 100,
        status: "pending",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Membership purchase failed. Try again shortly.";
      setStatus({ type: "error", message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>Memberships — Save on unlimited playground visits with a membership for your family.</h1>

        <div className={styles.layout}>
          <div className={styles.plans}>
            {loadingPlans ? (
              <p>Loading memberships...</p>
            ) : plansError ? (
              <p className={`${styles.status} ${styles.statusError}`}>{plansError}</p>
            ) : (
              plans.map(plan => {
                const selected = plan.id === selectedPlanId;
                const planColor = plan.name === 'Mini Plan' ? '#22c55e'
                  : plan.name === 'Super Plan' ? '#3b82f6'
                  : plan.name === 'Mega Plan' ? '#a855f7'
                  : '#ff7a00';
                return (
                  <button
                    key={plan.id}
                    type="button"
                    className={`${styles.planCard} ${selected ? styles.planSelected : ""}`}
                    onClick={() => setSelectedPlanId(plan.id)}
                    style={selected ? { borderColor: planColor } : undefined}
                  >
                    {plan.promoLabel ? (
                      <div className={styles.promoBadge}>{plan.promoLabel}</div>
                    ) : null}
                    <div className={styles.planColorBar} style={{ background: planColor }} />
                    <div className={styles.planHeader}>
                      <h3>{plan.name}</h3>
                    </div>
                    <div className={styles.planMembers}>
                      {plan.maxChildren} Kid{plan.maxChildren > 1 ? "s" : ""} + {plan.maxAdults ?? plan.maxChildren} Adult{(plan.maxAdults ?? plan.maxChildren) > 1 ? "s" : ""}
                    </div>
                    <div className={styles.planPricing}>
                      {plan.originalPrice ? (
                        <>
                          <span className={styles.planOriginalPrice}>${plan.originalPrice}</span>
                          <span className={styles.planPromoPrice} style={{ color: planColor }}>${plan.monthlyPrice}</span>
                          <span className={styles.planSavings}>
                            Save {Math.round((1 - plan.monthlyPrice / plan.originalPrice) * 100)}%
                          </span>
                        </>
                      ) : (
                        <span className={styles.planPrice}>${plan.monthlyPrice}</span>
                      )}
                    </div>
                    {plan.description ? <p className={styles.planDescription}>{plan.description}</p> : null}
                    <ul className={styles.benefitList}>
                      {plan.benefits.map(benefit => (
                        <li key={benefit}>{benefit}</li>
                      ))}
                    </ul>
                    {plan.promoNote || plan.promoSpotsLeft != null || plan.promoEndsAt ? (
                      <div className={styles.promoInfo}>
                        {plan.promoNote ? <span>{plan.promoNote}</span> : null}
                        {plan.promoSpotsLeft != null ? (
                          <span className={styles.promoSpots}>{plan.promoSpotsLeft} spots left</span>
                        ) : null}
                        {plan.promoEndsAt ? (
                          <span className={styles.promoEnds}>Ends {new Date(plan.promoEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <form className={styles.purchaseCard} onSubmit={handleSubmit}>
            <h2>Activate membership</h2>

            <div className={styles.field}>
              <label htmlFor="membership-duration">Prepay duration</label>
              <select
                id="membership-duration"
                value={duration}
                onChange={event => setDuration(Number(event.target.value))}
              >
                {DURATION_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.toggleRow}>
              <label htmlFor="membership-autorenew">Enable auto-renew</label>
              <input
                id="membership-autorenew"
                type="checkbox"
                checked={autoRenew}
                onChange={event => setAutoRenew(event.target.checked)}
              />
            </div>
            <p className={styles.helper}>
              Auto-renew ensures your play pass never lapses. You can disable renewals anytime from your account portal.
            </p>

            {selectedPlan ? (
              <>
                <div className={styles.summaryRow}>
                  <span>{selectedPlan.name}</span>
                  {selectedPlan.originalPrice ? (
                    <span>
                      <span className={styles.strikePrice}>${selectedPlan.originalPrice}</span>{" "}
                      ${selectedPlan.monthlyPrice}
                    </span>
                  ) : (
                    <span>${selectedPlan.monthlyPrice}</span>
                  )}
                </div>
                <div className={styles.summaryRow}>
                  <span>Members included</span>
                  <span>{selectedPlan.maxChildren} Kid{selectedPlan.maxChildren > 1 ? "s" : ""} + {selectedPlan.maxAdults ?? selectedPlan.maxChildren} Adult{(selectedPlan.maxAdults ?? selectedPlan.maxChildren) > 1 ? "s" : ""}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Prepay duration</span>
                  <span>{duration} month{duration > 1 ? "s" : ""}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Visits</span>
                  <span>
                    {typeof selectedPlan.visitsPerMonth === "number"
                      ? `${selectedPlan.visitsPerMonth} / month`
                      : "Unlimited"}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Auto-renew</span>
                  <span>{autoRenew ? "Enabled" : "Disabled"}</span>
                </div>
                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                  <span>Amount today</span>
                  <span>${(Math.round(Math.round(selectedPlan.monthlyPrice * 100) * duration) / 100).toFixed(2)}</span>
                </div>
              </>
            ) : (
              <p className={styles.helper}>Select a membership tier to see totals.</p>
            )}

            {user?.membership ? (
              <p className={styles.helper}>
                Current tier: <strong>{user.membership.tierName ?? "Active member"}</strong>. Auto-renew{" "}
                {user.membership.autoRenew ? "enabled" : "disabled"} · Next renewal{" "}
                {user.membership.expiresAt ? formatDate(user.membership.expiresAt) : "TBD"}.
                {typeof user.membership.visitsPerMonth === "number" ? (
                  <> Visits used this month: {user.membership.visitsUsed ?? 0} / {user.membership.visitsPerMonth}.</>
                ) : (
                  <> Enjoy unlimited open play visits.</>
                )}
              </p>
            ) : (
              <p className={styles.helper}>New memberships begin immediately after purchase.</p>
            )}

            {!user && (
              <p className={styles.helper} style={{ color: "#b45309", fontWeight: 500 }}>
                You must sign in or create an account to purchase a membership.
              </p>
            )}

            {status.type === "error" ? (
              <p className={`${styles.status} ${styles.statusError}`}>{status.message}</p>
            ) : null}
            <PrimaryButton type="submit" disabled={submitting || !selectedPlanId}>
              {submitting ? "Adding..." : user ? "Add to Cart" : "Sign In to Continue"}
            </PrimaryButton>
          </form>
        </div>

        <div className={styles.refundPolicy} id="refund-policy">
          <h2 className={styles.refundPolicyTitle}>Membership Refund Policy</h2>
          <p className={styles.refundPolicyIntro}>
            All membership purchases are final. By purchasing a membership, you agree to the following terms:
          </p>
          <ul className={styles.refundPolicyList}>
            {MEMBERSHIP_REFUND_POLICY_ITEMS.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

      </div>
    </section>
  );
}
