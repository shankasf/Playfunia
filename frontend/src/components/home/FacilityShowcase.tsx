import { memo } from "react";
import { ResponsiveImage } from "../common/ResponsiveImage";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import styles from "./FacilityShowcase.module.css";

const facilityImages = [
  {
    id: 1,
    basePath: "/images/optimized/facility/slides-overview",
    fallbackSrc: "/images/playground/facility/slides-overview.jpg",
    title: "Slides & Play Structures",
    description: "Multi-level slides and climbing structures",
  },
  {
    id: 2,
    basePath: "/images/optimized/facility/ball-pit-wheel",
    fallbackSrc: "/images/playground/facility/ball-pit-wheel.jpg",
    title: "Colorful Ball Pit",
    description: "Giant ball pit with spinning wheel feature",
  },
  {
    id: 3,
    basePath: "/images/optimized/facility/play-area",
    fallbackSrc: "/images/playground/facility/play-area.jpg",
    title: "Main Play Area",
    description: "Spacious area with slides and ball pits",
  },
  {
    id: 4,
    basePath: "/images/optimized/facility/animal-seats",
    fallbackSrc: "/images/playground/facility/animal-seats.jpg",
    title: "Animal Ride Zone",
    description: "Fun padded animal seats for little ones",
  },
  {
    id: 5,
    basePath: "/images/optimized/facility/hanging-obstacles",
    fallbackSrc: "/images/playground/facility/hanging-obstacles.jpg",
    title: "Obstacle Course",
    description: "Hanging cylinders and padded obstacles",
  },
  {
    id: 6,
    basePath: "/images/optimized/facility/soft-play",
    fallbackSrc: "/images/playground/facility/soft-play.jpg",
    title: "Soft Play Zone",
    description: "Safe padded play area with nets",
  },
];

export const FacilityShowcase = memo(function FacilityShowcase() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      ref={ref}
      className={styles.section}
      aria-labelledby="facility-heading"
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.tag}>Our Space</span>
          <h2 id="facility-heading">Explore Our Indoor Playground</h2>
          <p>A colorful, safe, and exciting space designed for endless fun</p>
        </div>
        <div className={`${styles.grid} ${isVisible ? styles.visible : ""}`}>
          {facilityImages.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.imageWrapper}>
                <ResponsiveImage
                  basePath={item.basePath}
                  alt={item.title}
                  widths={[400, 600, 800]}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  aspectRatio="4/3"
                  placeholderColor="#e8e0f0"
                  fallbackSrc={item.fallbackSrc}
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
});
