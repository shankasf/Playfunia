import { memo } from "react";
import { ResponsiveImage } from "../common/ResponsiveImage";
import { PrimaryButton } from "../common/PrimaryButton";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import styles from "./BirthdayPartyShowcase.module.css";

const features = [
  {
    title: "Dedicated Party Host",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    title: "Private Party Room",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    title: "All-Day Playground Access",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    title: "Up to 10 Kids Included",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export const BirthdayPartyShowcase = memo(function BirthdayPartyShowcase() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      ref={ref}
      className={`${styles.section} ${isVisible ? styles.visible : ""}`}
      aria-labelledby="party-heading"
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.tag}>Birthday Parties</span>
          <h2 id="party-heading">Celebrate at Playfunia</h2>
          <p>Make your child's birthday unforgettable with our party packages</p>
        </div>

        <div className={styles.twoCol}>
          <div className={styles.imageCol}>
            <ResponsiveImage
              basePath="/images/optimized/party/party-celebration"
              alt="Kids celebrating a birthday party at Playfunia"
              widths={[400, 600, 800]}
              sizes="(max-width: 768px) 100vw, 50vw"
              aspectRatio="4/3"
              placeholderColor="#ffe0ec"
              fallbackSrc="/images/playground/party/party-celebration.jpg"
            />
          </div>
          <div className={styles.detailCol}>
            <div className={styles.featureGrid}>
              {features.map((f) => (
                <div key={f.title} className={styles.featureItem}>
                  <div className={styles.featureIcon}>{f.icon}</div>
                  <h4>{f.title}</h4>
                </div>
              ))}
            </div>
            <div className={styles.cta}>
              <PrimaryButton to="/book-party">Book a Party</PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
