import { LazyImage } from "../common/LazyImage";
import styles from "./FacilityShowcase.module.css";

const facilityImages = [
  {
    id: 1,
    src: "/images/playground/facility/slides-overview.jpg",
    title: "Slides & Play Structures",
    description: "Multi-level slides and climbing structures",
  },
  {
    id: 2,
    src: "/images/playground/facility/ball-pit-wheel.jpg",
    title: "Colorful Ball Pit",
    description: "Giant ball pit with spinning wheel feature",
  },
  {
    id: 3,
    src: "/images/playground/facility/play-area.jpg",
    title: "Main Play Area",
    description: "Spacious area with slides and ball pits",
  },
  {
    id: 4,
    src: "/images/playground/facility/animal-seats.jpg",
    title: "Animal Ride Zone",
    description: "Fun padded animal seats for little ones",
  },
  {
    id: 5,
    src: "/images/playground/facility/hanging-obstacles.jpg",
    title: "Obstacle Course",
    description: "Hanging cylinders and padded obstacles",
  },
  {
    id: 6,
    src: "/images/playground/facility/soft-play.jpg",
    title: "Soft Play Zone",
    description: "Safe padded play area with nets",
  },
];

export function FacilityShowcase() {
  return (
    <section className={styles.section} aria-labelledby="facility-heading">
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.tag}>Our Space</span>
          <h2 id="facility-heading">Explore Our Indoor Playground</h2>
          <p>A colorful, safe, and exciting space designed for endless fun</p>
        </div>
        <div className={styles.grid}>
          {facilityImages.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.imageWrapper}>
                <LazyImage
                  src={item.src}
                  alt={item.title}
                  aspectRatio="4/3"
                  placeholderColor="#e8e0f0"
                />
                <div className={styles.overlay}>
                  <span className={styles.overlayTitle}>{item.title}</span>
                </div>
              </div>
              <div className={styles.cardContent}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
