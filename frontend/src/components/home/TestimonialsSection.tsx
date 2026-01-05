import type { Testimonial } from "../../data/types";
import styles from "./TestimonialsSection.module.css";

interface Props {
  testimonials: Testimonial[];
  isLoading?: boolean;
}

export function TestimonialsSection({ testimonials, isLoading }: Props) {
  const items = isLoading ? new Array(3).fill(null) : testimonials;

  return (
    <section className={styles.section} id="testimonials">
      <div className={styles.header}>
        <span className={styles.tag}>Families love Playfunia</span>
        <h2>4.9 stars from thousands of playful parents</h2>
        <p>Real stories from caregivers who've made Playfunia part of their weekly routine.</p>
      </div>
      <div className={styles.carousel}>
        {items.map((testimonial, index) => (
          <article key={testimonial?.id ?? index} className={styles.card}>
            <div className={styles.quoteMark}>&quot;</div>
            <p>{testimonial?.quote ?? "Gathering glowing feedback..."}</p>
            <footer>
              <strong>{testimonial?.name ?? "Playfunia Parent"}</strong>
              <span>{testimonial?.relationship ?? "Member family"}</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
