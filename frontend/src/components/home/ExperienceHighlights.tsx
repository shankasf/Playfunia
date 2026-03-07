import { memo } from "react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import styles from "./ExperienceHighlights.module.css";

const highlights = [
  {
    title: "Guided Play Coaches",
    description: "Certified staff members facilitate structured games, STEM experiments, and birthday fun.",
    color: "pink" as const,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    title: "Parent Lounge Comfort",
    description: "Complimentary cold brew, fast Wi-Fi, and comfy seating let caregivers recharge.",
    color: "purple" as const,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    ),
  },
  {
    title: "Spotless & Safe",
    description: "High-touch disinfecting between sessions plus mandatory grip socks for every guest.",
    color: "turquoise" as const,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
];

const BORDER_COLORS = {
  pink: "var(--color-primary)",
  purple: "var(--color-secondary)",
  turquoise: "var(--color-tertiary)",
};

const ICON_BG = {
  pink: "linear-gradient(135deg, #ff6b9d, #e8457a)",
  purple: "linear-gradient(135deg, #7c3aed, #6d28d9)",
  turquoise: "linear-gradient(135deg, #06b6d4, #0891b2)",
};

export const ExperienceHighlights = memo(function ExperienceHighlights() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      ref={ref}
      className={styles.section}
      aria-labelledby="experience-heading"
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.tag}>Why Families Choose Us</span>
          <h2 id="experience-heading">The Playfunia Experience</h2>
        </div>
        <div className={`${styles.grid} ${isVisible ? styles.visible : ""}`}>
          {highlights.map((item) => (
            <article
              key={item.title}
              className={styles.card}
              style={{ borderLeftColor: BORDER_COLORS[item.color] }}
            >
              <span
                className={styles.icon}
                aria-hidden="true"
                style={{ background: ICON_BG[item.color] }}
              >
                {item.icon}
              </span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
});
