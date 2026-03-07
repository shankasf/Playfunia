import styles from "./EventsShowcase.module.css";

interface Props {
  events?: unknown[];
  isLoading?: boolean;
}

export function EventsShowcase({ events, isLoading }: Props) {
  return (
    <section className={styles.section} id="events">
      <div className={styles.header}>
        <span className={styles.tag}>Upcoming at Playfunia</span>
        <h2>Events designed to wow kids & impress parents</h2>
        <p>Workshops, sensory mornings, glow parties, and seasonal camps keep your calendar exciting.</p>
      </div>
    </section>
  );
}
