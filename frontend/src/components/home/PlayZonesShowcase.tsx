import { LazyImage } from "../common/LazyImage";
import styles from "./PlayZonesShowcase.module.css";

const playZones = [
  {
    id: "ball-pit",
    name: "Mega Ball Pool",
    description: "Thousands of colorful balls and hidden surprises for sensory seekers.",
    icon: "BP",
    image: "/images/playground/kids/ball-pit-neon.jpg",
  },
  {
    id: "slides",
    name: "Slide Paradise",
    description: "Multi-level tube slides with colorful neon lights for all ages.",
    icon: "SP",
    image: "/images/playground/kids/tube-slide.jpg",
  },
  {
    id: "climbing",
    name: "Climbing Adventure",
    description: "Soft stairs, bridges, and platforms for active explorers.",
    icon: "CA",
    image: "/images/playground/kids/climbing-stairs.jpg",
  },
  {
    id: "toddler",
    name: "Toddler Grove",
    description: "Gentle slides, rocking horses, and safe play areas for ages 1-3.",
    icon: "TG",
    image: "/images/playground/kids/rocking-horse.jpg",
  },
];

const galleryImages = [
  "/images/playground/kids/ball-pit-red-ball.jpg",
  "/images/playground/kids/swing-bridge.jpg",
  "/images/playground/kids/hanging-platforms.jpg",
  "/images/playground/kids/playhouse-window.jpg",
  "/images/playground/kids/colorful-balls.jpg",
  "/images/playground/kids/horse-seats.jpg",
];

export function PlayZonesShowcase() {
  return (
    <section className={styles.section} aria-labelledby="play-zones-heading">
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.tag}>Explore the playground</span>
          <h2 id="play-zones-heading">Play zones designed for every age and energy level</h2>
        </div>
        <div className={styles.grid}>
          {playZones.map(zone => (
            <article key={zone.id} className={styles.card}>
              <div className={styles.cardImage}>
                <LazyImage
                  src={zone.image}
                  alt={zone.name}
                  aspectRatio="16/10"
                  placeholderColor="#f0e8f8"
                />
              </div>
              <div className={styles.cardContent}>
                <span className={styles.icon} aria-hidden="true">
                  {zone.icon}
                </span>
                <h3>{zone.name}</h3>
                <p>{zone.description}</p>
              </div>
            </article>
          ))}
        </div>

        {/* Photo Gallery */}
        <div className={styles.gallery}>
          <h3 className={styles.galleryTitle}>See the fun in action</h3>
          <div className={styles.galleryGrid}>
            {galleryImages.map((img, idx) => (
              <div key={idx} className={styles.galleryItem}>
                <LazyImage
                  src={img}
                  alt={`Kids playing at Playfunia ${idx + 1}`}
                  aspectRatio="1/1"
                  placeholderColor="#e8f0f8"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
