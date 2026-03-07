import { PrimaryButton } from "../common/PrimaryButton";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import styles from "./WaiverCTA.module.css";

export function WaiverCTA() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      ref={ref}
      className={`${styles.section} ${isVisible ? styles.visible : ""}`}
    >
      <div className={styles.inner}>
        <div className={styles.iconCircle} aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <path d="M9 14l2 2 4-4" />
          </svg>
        </div>
        <div className={styles.text}>
          <h2>Sign Your Waiver Before You Visit</h2>
          <p>Save time at check-in! Complete your waiver online in under 2 minutes.</p>
        </div>
        <PrimaryButton to="/waiver">Sign Waiver Now</PrimaryButton>
      </div>
    </section>
  );
}
