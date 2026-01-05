import styles from "./ExperienceHighlights.module.css";

const highlights = [
  {
    title: "Guided Play Coaches",
    description: "Certified staff members facilitate structured games, STEM experiments, and birthday fun.",
    icon: "CP",
  },
  {
    title: "Parent Lounge Comfort",
    description: "Complimentary cold brew, fast Wi-Fi, and comfy seating let caregivers recharge.",
    icon: "LO",
  },
  {
    title: "Spotless & Safe",
    description: "High-touch disinfecting between sessions plus mandatory grip socks for every guest.",
    icon: "SS",
  },
];

export function ExperienceHighlights() {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        {highlights.map(item => (
          <article key={item.title} className={styles.card}>
            <span aria-hidden="true" className={styles.icon}>
              {item.icon}
            </span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
