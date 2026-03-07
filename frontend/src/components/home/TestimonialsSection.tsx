import type { Testimonial } from "../../data/types";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import styles from "./TestimonialsSection.module.css";

const FALLBACK_REVIEWS: Testimonial[] = [
  {
    id: "fallback-1",
    name: "Jessica M.",
    relationship: "Mom of two",
    quote: "My kids absolutely LOVE Playfunia! We come here every weekend and they never want to leave. The play areas are super clean and the staff is incredibly friendly. It's become our go-to spot for rainy day fun!",
  },
  {
    id: "fallback-2",
    name: "David & Sarah K.",
    relationship: "Parents of a 4-year-old",
    quote: "We hosted our daughter's birthday party here and it was the best party we've ever had. Everything was taken care of — from setup to cleanup. The kids had an absolute blast and the parents loved the lounge area.",
  },
  {
    id: "fallback-3",
    name: "Amanda R.",
    relationship: "Grandma of three",
    quote: "I bring my grandkids here whenever they visit and it's always a hit. The toddler area is perfect for my youngest and the bigger kids love the slides and climbing walls. Worth every penny for the smiles I see!",
  },
];

interface Props {
  testimonials: Testimonial[];
  isLoading?: boolean;
}

export function TestimonialsSection({ testimonials, isLoading }: Props) {
  const displayItems = testimonials.length > 0 ? testimonials : FALLBACK_REVIEWS;
  const items = isLoading ? new Array(3).fill(null) : displayItems;
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      ref={ref}
      className={styles.section}
      id="testimonials"
      style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(30px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}
    >
      <div className={styles.header}>
        <span className={styles.tag}>Families love Playfunia</span>
        <div className={styles.stars}>
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={styles.star} aria-hidden="true">&#9733;</span>
          ))}
        </div>
        <h2>4.9 stars from thousands of playful parents</h2>
        <p>Real stories from caregivers who've made Playfunia part of their weekly routine.</p>
      </div>
      <div className={styles.carousel}>
        {items.map((testimonial, index) => (
          <article key={testimonial?.id ?? index} className={styles.card}>
            <div className={styles.quoteMark}>&ldquo;</div>
            <p>{testimonial?.quote ?? "Gathering glowing feedback..."}</p>
            <div className={styles.cardFooter}>
              <strong>{testimonial?.name ?? "Playfunia Parent"}</strong>
              <span>{testimonial?.relationship ?? "Member family"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
