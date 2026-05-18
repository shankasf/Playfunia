import type { MembershipPlan } from "../../data/types";
import styles from "./MembershipShowcase.module.css";
import { PrimaryButton } from "../common/PrimaryButton";

interface Props {
  plans: MembershipPlan[];
  isLoading?: boolean;
}

export function MembershipShowcase({ plans, isLoading }: Props) {
  return (
    <section className={styles.section} id="memberships">
      <div className={styles.header}>
        <span className={styles.tag}>Play passes & pricing</span>
        <h2>Affordable admissions for every Playfunia family</h2>
        <p>Every pass includes unlimited play for the visit day. Grip socks are required for all guests.</p>
      </div>

      <div className={styles.grid}>
        {(isLoading ? new Array(3).fill(null) : plans).map((plan, index) => (
          <article key={plan?.id ?? index} className={styles.card}>
            {plan?.promoLabel ? (
              <div className={styles.promoBadge}>{plan.promoLabel}</div>
            ) : null}
            <div className={styles.cardHeader}>
              <h3>{plan?.name ?? "Loading"}</h3>
              {plan?.originalPrice ? (
                <>
                  <span className={styles.originalPrice}>${plan.originalPrice}</span>
                  <span className={styles.price}>${plan.monthlyPrice}</span>
                </>
              ) : (
                <span className={styles.price}>${plan?.monthlyPrice ?? "--"}</span>
              )}
              <span className={styles.subText}>membership</span>
            </div>
            <p className={styles.meta}>
              {plan
                ? `${plan.maxChildren} Kid${plan.maxChildren > 1 ? "s" : ""} + ${plan.maxChildren} Adult${plan.maxChildren > 1 ? "s" : ""}`
                : "Loading plan details..."}
            </p>
            <ul className={styles.benefits}>
              {(plan?.benefits ?? ["Curating benefits..."]).map((benefit: string, benefitIndex: number) => (
                <li key={`${plan?.id ?? index}-${benefitIndex}`}>{benefit}</li>
              ))}
            </ul>
            <PrimaryButton to="/memberships" aria-label={`View the ${plan?.name ?? "Playfunia"} membership`}>
              View plan
            </PrimaryButton>
          </article>
        ))}
      </div>
    </section>
  );
}
