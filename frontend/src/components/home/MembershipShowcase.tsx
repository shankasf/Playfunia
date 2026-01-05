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
            <div className={styles.cardHeader}>
              <h3>{plan?.name ?? "Loading"}</h3>
              <span className={styles.price}>${plan?.monthlyPrice ?? "--"}</span>
              <span className={styles.subText}>per month</span>
            </div>
            <p className={styles.description}>{plan?.description ?? "Preparing something fun..."}</p>
            <p className={styles.meta}>
              {typeof plan?.visitsPerMonth === "number"
                ? `${plan?.visitsPerMonth} visits every month`
                : "Unlimited weekday play"}
            </p>
            <ul className={styles.benefits}>
              {(plan?.benefits ?? ["Curating benefits..."]).map((benefit: string, benefitIndex: number) => (
                <li key={`${plan?.id ?? index}-${benefitIndex}`}>{benefit}</li>
              ))}
            </ul>
            <PrimaryButton to="/contact" aria-label={`Ask about the ${plan?.name ?? "Playfunia"} play pass`}>
              Reserve pass
            </PrimaryButton>
          </article>
        ))}
      </div>
    </section>
  );
}
