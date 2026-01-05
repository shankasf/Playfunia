import { FormEvent, useEffect, useMemo, useState } from "react";

import { PrimaryButton } from "../components/common/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { useCheckout } from "../context/CheckoutContext";
import { fetchMembershipPlans, MembershipPlanDto } from "../api/memberships";
import { formatDate } from "../lib/dateUtils";
import { useNavigate } from "react-router-dom";
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

  const compareRows = useMemo(
    () => [
      {
        label: 'Visits per month',
        render: (plan: MembershipPlanDto) =>
          typeof plan.visitsPerMonth === 'number' ? `${plan.visitsPerMonth}` : 'Unlimited',
      },
      {
        label: 'Party discount',
        render: (plan: MembershipPlanDto) =>
          typeof plan.discountPercent === 'number' ? `${plan.discountPercent}% off` : 'Included',
      },
      {
        label: 'Guest passes',
        render: (plan: MembershipPlanDto) =>
          typeof plan.guestPassesPerMonth === 'number'
            ? `${plan.guestPassesPerMonth} / month`
            : '—',
      },
      {
        label: 'Children included',
        render: (plan: MembershipPlanDto) => `${plan.maxChildren} children`,
      },
    ],
    [],
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
        if (result.length > 0) {
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

  if (!user) {
    return (
      <section className={styles.page}>
        <div className={styles.container}>
          <div className={styles.intro}>
            <span className={styles.tag}>Memberships</span>
            <h1>Sign in to join the Playfunia Club</h1>
            <p>Lock in unlimited play, party discounts, and special invites. Sign in or create an account to continue.</p>
            <PrimaryButton to="/account">Sign in or create account</PrimaryButton>
          </div>
        </div>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlanId) {
      setStatus({ type: "error", message: "Select a membership tier to continue." });
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
        total: Number((plan.monthlyPrice * duration).toFixed(2)),
        status: "pending",
      });

      setStatus({
        type: "success",
        message: `${plan.name} added to checkout. Complete payment to activate your membership.`,
      });
      navigate("/checkout", { state: { from: "membership" } });
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
        <div className={styles.intro}>
          <span className={styles.tag}>Memberships</span>
          <h1>Pick the perfect Playfunia membership</h1>
          <p>
            Unlock unlimited visits, party perks, and exclusive member events. Choose the tier that fits your family,
            then decide how long you would like to prepay. Auto-renew keeps the good times rolling without interruption.
          </p>
        </div>

        {plans.length > 0 ? (
          <div className={styles.compare}>
            <div className={styles.compareHeader}>
              <h2>Compare memberships</h2>
              <p>See visits, discounts, and guest passes at a glance across Silver, Gold, Platinum, and VIP Platinum.</p>
            </div>
            <div className={styles.compareTable}>
              <div className={styles.compareRow}>
                <div className={styles.compareLabel}>Tier</div>
                {plans.map(plan => (
                  <div key={plan.id} className={styles.compareCell}>
                    <div className={styles.compareTier}>{plan.name}</div>
                    <div className={styles.comparePrice}>${plan.monthlyPrice}/mo</div>
                  </div>
                ))}
              </div>

              {compareRows.map(row => (
                <div key={row.label} className={styles.compareRow}>
                  <div className={styles.compareLabel}>{row.label}</div>
                  {plans.map(plan => (
                    <div key={`${plan.id}-${row.label}`} className={styles.compareCell}>
                      {row.render(plan)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.layout}>
          <div className={styles.plans}>
            {loadingPlans ? (
              <p>Loading memberships...</p>
            ) : plansError ? (
              <p className={`${styles.status} ${styles.statusError}`}>{plansError}</p>
            ) : (
              plans.map(plan => {
                const selected = plan.id === selectedPlanId;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    className={`${styles.planCard} ${selected ? styles.planSelected : ""}`}
                    onClick={() => setSelectedPlanId(plan.id)}
                  >
                    <div className={styles.planHeader}>
                      <h3>{plan.name}</h3>
                      <span className={styles.planPrice}>${plan.monthlyPrice}/mo</span>
                    </div>
                    {plan.description ? <p className={styles.planDescription}>{plan.description}</p> : null}
                    <div className={styles.planMeta}>
                      <span>Up to {plan.maxChildren} children</span>
                      <span>
                        {typeof plan.visitsPerMonth === "number"
                          ? `${plan.visitsPerMonth} visits/month included`
                          : "Unlimited visits during open play"}
                      </span>
                      <span>
                        {typeof plan.discountPercent === "number"
                          ? `${plan.discountPercent}% party & camp discount`
                          : "Member savings included"}
                      </span>
                      <span>
                        {typeof plan.guestPassesPerMonth === "number"
                          ? `${plan.guestPassesPerMonth} guest pass${plan.guestPassesPerMonth === 1 ? "" : "es"}/month`
                          : "Guest passes available"}
                      </span>
                    </div>
                    <ul className={styles.benefitList}>
                      {plan.benefits.map(benefit => (
                        <li key={benefit}>{benefit}</li>
                      ))}
                    </ul>
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
                  <span>${selectedPlan.monthlyPrice}/mo</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Prepay months</span>
                  <span>{duration}</span>
                </div>
                {typeof selectedPlan.visitsPerMonth === "number" ? (
                  <div className={styles.summaryRow}>
                    <span>Visits per month</span>
                    <span>{selectedPlan.visitsPerMonth}</span>
                  </div>
                ) : (
                  <div className={styles.summaryRow}>
                    <span>Visits per month</span>
                    <span>Unlimited</span>
                  </div>
                )}
                <div className={styles.summaryRow}>
                  <span>Party & camp discount</span>
                  <span>
                    {typeof selectedPlan.discountPercent === "number"
                      ? `${selectedPlan.discountPercent}%`
                      : "Included"}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Guest passes</span>
                  <span>
                    {typeof selectedPlan.guestPassesPerMonth === "number"
                      ? `${selectedPlan.guestPassesPerMonth} / month`
                      : "—"}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Auto-renew</span>
                  <span>{autoRenew ? "Enabled" : "Disabled"}</span>
                </div>
                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                  <span>Amount today</span>
                  <span>${(selectedPlan.monthlyPrice * duration).toFixed(2)}</span>
                </div>
              </>
            ) : (
              <p className={styles.helper}>Select a membership tier to see totals.</p>
            )}

            {user.membership ? (
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
              <p className={styles.helper}>You do not have an active membership yet. New memberships begin immediately.</p>
            )}

            {status.type === "error" ? (
              <p className={`${styles.status} ${styles.statusError}`}>{status.message}</p>
            ) : null}
            {status.type === "success" ? (
              <p className={`${styles.status} ${styles.statusSuccess}`}>{status.message}</p>
            ) : null}

            <PrimaryButton type="submit" disabled={submitting || !selectedPlanId}>
              {submitting ? "Activating..." : "Activate membership"}
            </PrimaryButton>
          </form>
        </div>
      </div>
    </section>
  );
}
