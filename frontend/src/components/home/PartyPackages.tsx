import type { PartyPackage } from "../../data/types";
import styles from "./PartyPackages.module.css";

interface Props {
  packages: PartyPackage[];
  isLoading?: boolean;
}

export function PartyPackages({ packages, isLoading }: Props) {
  return (
    <section className={styles.section} id="parties">
      <div className={styles.heroImage}>
        <img
          src="/images/parties/birthday-parties.jpg"
          alt="Kids birthday party celebration at Playfunia"
          loading="lazy"
        />
        <div className={styles.heroOverlay}>
          <span className={styles.heroText}>Make memories that last forever</span>
        </div>
      </div>
      <div className={styles.header}>
        <span className={styles.tag}>Birthday parties & celebrations</span>
        <h2>The easiest parties ever - we handle every detail</h2>
        <p>
          Every package includes up to 10 children, one adult per child, a private party room for 2 hours, and all-day
          access to the playground.
        </p>
      </div>
      <div className={styles.grid}>
        {(isLoading ? new Array(3).fill(null) : packages).map((pkg, idx) => (
          <article key={pkg?.id ?? idx} className={styles.card}>
            <div className={styles.badge}>{pkg?.durationMinutes ?? "--"} min</div>
            <h3>{pkg?.name ?? "Party loading"}</h3>
            <p className={styles.description}>{pkg?.description ?? "Finding the perfect celebration..."}</p>
            <div className={styles.meta}>
              <span>
                <strong>{pkg?.maxGuests ?? "--"}</strong> kids included
              </span>
              <span>
                Starting at <strong>${pkg?.basePrice ?? "--"}</strong>
              </span>
            </div>
            <ul>
              <li>Friendly Playfunia party host</li>
              <li>Grip socks required for all guests</li>
              <li>Additional child $40 | Additional guest $10</li>
            </ul>
          </article>
        ))}
      </div>
      <p className={styles.note}>Need custom decorations or special requests? Reach out and we'll tailor the day for you.</p>
    </section>
  );
}

