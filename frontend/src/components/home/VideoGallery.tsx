import { memo } from "react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import styles from "./VideoGallery.module.css";

const videos = [
  {
    id: 1,
    mp4: "/videos/optimized/playground/ball-pit-play.mp4",
    webm: "/videos/optimized/playground/ball-pit-play.webm",
    poster: "/videos/optimized/playground/ball-pit-play-poster.jpg",
    fallbackSrc: "/videos/playground/ball-pit-play.mov",
    fallbackPoster: "/videos/thumbnails/ball-pit-play-thumb.jpg",
    title: "Ball Pit Fun",
    description: "Kids having a blast in our colorful ball pit",
  },
  {
    id: 2,
    mp4: "/videos/optimized/playground/slide-fun.mp4",
    webm: "/videos/optimized/playground/slide-fun.webm",
    poster: "/videos/optimized/playground/slide-fun-poster.jpg",
    fallbackSrc: "/videos/playground/slide-fun.mov",
    fallbackPoster: "/videos/thumbnails/slide-fun-thumb.jpg",
    title: "Slide Adventures",
    description: "Exciting slides for all ages",
  },
  {
    id: 3,
    mp4: "/videos/optimized/playground/carousel-ride.mp4",
    webm: "/videos/optimized/playground/carousel-ride.webm",
    poster: "/videos/optimized/playground/carousel-ride-poster.jpg",
    fallbackSrc: "/videos/playground/carousel-ride.mov",
    fallbackPoster: "/videos/thumbnails/carousel-ride-thumb.jpg",
    title: "Carousel Ride",
    description: "Fun carousel for the little ones",
  },
  {
    id: 4,
    mp4: "/videos/optimized/playground/neon-slides.mp4",
    webm: "/videos/optimized/playground/neon-slides.webm",
    poster: "/videos/optimized/playground/neon-slides-poster.jpg",
    fallbackSrc: "/videos/playground/neon-slides.mov",
    fallbackPoster: "/videos/thumbnails/neon-slides-thumb.jpg",
    title: "Neon Playground",
    description: "Colorful neon-lit slides and ball pit",
  },
  {
    id: 5,
    mp4: "/videos/optimized/playground/spinning-wheel.mp4",
    webm: "/videos/optimized/playground/spinning-wheel.webm",
    poster: "/videos/optimized/playground/spinning-wheel-poster.jpg",
    fallbackSrc: "/videos/playground/spinning-wheel.mov",
    fallbackPoster: "/videos/thumbnails/spinning-wheel-thumb.jpg",
    title: "Spinning Wheel",
    description: "Giant spinning wheel above the ball pit",
  },
  {
    id: 6,
    mp4: "/videos/optimized/playground/toddler-climbing.mp4",
    webm: "/videos/optimized/playground/toddler-climbing.webm",
    poster: "/videos/optimized/playground/toddler-climbing-poster.jpg",
    fallbackSrc: "/videos/playground/toddler-climbing.mov",
    fallbackPoster: "/videos/thumbnails/toddler-climbing-thumb.jpg",
    title: "Toddler Zone",
    description: "Safe climbing fun for toddlers",
  },
];

export const VideoGallery = memo(function VideoGallery() {
  const { ref: revealRef, isVisible } = useScrollReveal();

  return (
    <section
      ref={revealRef}
      className={styles.section}
      style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(30px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}
    >
      <div className={styles.header}>
        <span className={styles.tag}>See the fun in action</span>
        <h2>Watch Kids Playing at Playfunia</h2>
        <p>Real moments of joy and laughter from our indoor playground</p>
      </div>
      <div className={styles.grid}>
        {videos.map((video) => (
          <div key={video.id} className={styles.card}>
            <div className={styles.videoWrapper}>
              <video
                className={styles.video}
                autoPlay
                muted
                loop
                playsInline
                poster={video.poster}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.fallback) {
                    target.dataset.fallback = "true";
                    target.poster = video.fallbackPoster;
                    target.innerHTML = `<source src="${video.fallbackSrc}" type="video/quicktime" />`;
                    target.load();
                  }
                }}
              >
                <source src={video.webm} type="video/webm" />
                <source src={video.mp4} type="video/mp4" />
                <source src={video.fallbackSrc} type="video/quicktime" />
              </video>
            </div>
            <div className={styles.cardContent}>
              <h3>{video.title}</h3>
              <p>{video.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});
