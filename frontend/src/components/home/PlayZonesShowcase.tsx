import { memo } from "react";
import { ResponsiveImage } from "../common/ResponsiveImage";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import styles from "./PlayZonesShowcase.module.css";

const playZones = [
  {
    id: "ball-pit",
    name: "Mega Ball Pool",
    description: "Thousands of colorful balls and hidden surprises for sensory seekers.",
    basePath: "/images/optimized/kids/ball-pit-neon",
    fallbackSrc: "/images/playground/kids/ball-pit-neon.jpg",
    tags: [
      { label: "Dive", color: "pink" },
      { label: "Explore", color: "purple" },
      { label: "Splash", color: "turquoise" },
    ],
  },
  {
    id: "slides",
    name: "Slide Paradise",
    description: "Multi-level tube slides with colorful neon lights for all ages.",
    basePath: "/images/optimized/kids/tube-slide",
    fallbackSrc: "/images/playground/kids/tube-slide.jpg",
    tags: [
      { label: "Climb", color: "turquoise" },
      { label: "Slide", color: "yellow" },
      { label: "Spin", color: "pink" },
    ],
  },
  {
    id: "climbing",
    name: "Climbing Adventure",
    description: "Soft stairs, bridges, and platforms for active explorers.",
    basePath: "/images/optimized/kids/climbing-stairs",
    fallbackSrc: "/images/playground/kids/climbing-stairs.jpg",
    tags: [
      { label: "Climb", color: "purple" },
      { label: "Build", color: "yellow" },
      { label: "Balance", color: "turquoise" },
    ],
  },
  {
    id: "toddler",
    name: "Toddler Grove",
    description: "Gentle slides, rocking horses, and safe play areas for ages 1-3.",
    basePath: "/images/optimized/kids/rocking-horse",
    fallbackSrc: "/images/playground/kids/rocking-horse.jpg",
    tags: [
      { label: "Crawl", color: "pink" },
      { label: "Rock", color: "yellow" },
      { label: "Play", color: "purple" },
    ],
  },
];

const galleryImages = [
  { basePath: "/images/optimized/kids/ball-pit-red-ball", fallbackSrc: "/images/playground/kids/ball-pit-red-ball.jpg" },
  { basePath: "/images/optimized/kids/swing-bridge", fallbackSrc: "/images/playground/kids/swing-bridge.jpg" },
  { basePath: "/images/optimized/kids/hanging-platforms", fallbackSrc: "/images/playground/kids/hanging-platforms.jpg" },
  { basePath: "/images/optimized/kids/playhouse-window", fallbackSrc: "/images/playground/kids/playhouse-window.jpg" },
  { basePath: "/images/optimized/kids/colorful-balls", fallbackSrc: "/images/playground/kids/colorful-balls.jpg" },
  { basePath: "/images/optimized/kids/horse-seats", fallbackSrc: "/images/playground/kids/horse-seats.jpg" },
];

function ZoneRow({ zone, index }: { zone: typeof playZones[number]; index: number }) {
  const { ref, isVisible } = useScrollReveal();
  const isEven = index % 2 === 0;

  return (
    <div
      ref={ref}
      className={`${styles.zoneRow} ${isEven ? "" : styles.zoneRowReverse} ${isVisible ? styles.visible : ""}`}
    >
      <div className={styles.zoneImage}>
        <ResponsiveImage
          basePath={zone.basePath}
          alt={zone.name}
          widths={[400, 600, 800]}
          sizes="(max-width: 768px) 100vw, 50vw"
          aspectRatio="16/10"
          placeholderColor="#f0e8f8"
          fallbackSrc={zone.fallbackSrc}
        />
      </div>
      <div className={styles.zoneText}>
        <h3>{zone.name}</h3>
        <p>{zone.description}</p>
        <div className={styles.tagRow}>
          {zone.tags.map((tag) => (
            <span key={tag.label} className={styles.activityTag} data-color={tag.color}>
              {tag.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export const PlayZonesShowcase = memo(function PlayZonesShowcase() {
  return (
    <section className={styles.section} aria-labelledby="play-zones-heading">
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.headerTag}>Explore the playground</span>
          <h2 id="play-zones-heading">Play zones designed for every age and energy level</h2>
        </div>

        {playZones.map((zone, index) => (
          <ZoneRow key={zone.id} zone={zone} index={index} />
        ))}

        {/* Photo Gallery */}
        <div className={styles.gallery}>
          <h3 className={styles.galleryTitle}>See the fun in action</h3>
          <div className={styles.galleryGrid}>
            {galleryImages.map((img, idx) => (
              <div key={idx} className={styles.galleryItem}>
                <ResponsiveImage
                  basePath={img.basePath}
                  alt={`Kids playing at Playfunia ${idx + 1}`}
                  widths={[200, 300, 400]}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                  aspectRatio="1/1"
                  placeholderColor="#e8f0f8"
                  fallbackSrc={img.fallbackSrc}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
