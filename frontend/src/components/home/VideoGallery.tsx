import { useState, useRef, memo, useCallback } from "react";
import styles from "./VideoGallery.module.css";

const videos = [
  {
    id: 1,
    src: "/videos/playground/ball-pit-play.mov",
    thumbnail: "/videos/thumbnails/ball-pit-play-thumb.jpg",
    title: "Ball Pit Fun",
    description: "Kids having a blast in our colorful ball pit",
  },
  {
    id: 2,
    src: "/videos/playground/slide-fun.mov",
    thumbnail: "/videos/thumbnails/slide-fun-thumb.jpg",
    title: "Slide Adventures",
    description: "Exciting slides for all ages",
  },
  {
    id: 3,
    src: "/videos/playground/carousel-ride.mov",
    thumbnail: "/videos/thumbnails/carousel-ride-thumb.jpg",
    title: "Carousel Ride",
    description: "Fun carousel for the little ones",
  },
  {
    id: 4,
    src: "/videos/playground/neon-slides.mov",
    thumbnail: "/videos/thumbnails/neon-slides-thumb.jpg",
    title: "Neon Playground",
    description: "Colorful neon-lit slides and ball pit",
  },
  {
    id: 5,
    src: "/videos/playground/spinning-wheel.mov",
    thumbnail: "/videos/thumbnails/spinning-wheel-thumb.jpg",
    title: "Spinning Wheel",
    description: "Giant spinning wheel above the ball pit",
  },
  {
    id: 6,
    src: "/videos/playground/toddler-climbing.mov",
    thumbnail: "/videos/thumbnails/toddler-climbing-thumb.jpg",
    title: "Toddler Zone",
    description: "Safe climbing fun for toddlers",
  },
];

export const VideoGallery = memo(function VideoGallery() {
  const [playingId, setPlayingId] = useState<number | null>(null);
  const videoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});

  const handlePlay = useCallback((id: number) => {
    // Pause any currently playing video
    Object.entries(videoRefs.current).forEach(([key, video]) => {
      if (Number(key) !== id && video) {
        video.pause();
      }
    });

    const video = videoRefs.current[id];
    if (video) {
      video.play();
      setPlayingId(id);
    }
  }, []);

  const handleVideoEnd = useCallback((id: number) => {
    setPlayingId((current) => (current === id ? null : current));
  }, []);

  const handleVideoPause = useCallback((id: number) => {
    setPlayingId((current) => (current === id ? null : current));
  }, []);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <span className={styles.tag}>See the fun in action</span>
        <h2>Watch Kids Playing at Playfunia</h2>
        <p>Real moments of joy and laughter from our indoor playground</p>
      </div>
      <div className={styles.grid}>
        {videos.map((video) => {
          const isPlaying = playingId === video.id;
          return (
            <div key={video.id} className={styles.card}>
              <div className={styles.videoWrapper}>
                <video
                  ref={(el) => { videoRefs.current[video.id] = el; }}
                  className={`${styles.video} ${isPlaying ? styles.videoPlaying : ''}`}
                  playsInline
                  preload="none"
                  poster={video.thumbnail}
                  onEnded={() => handleVideoEnd(video.id)}
                  onPause={() => handleVideoPause(video.id)}
                  controls={isPlaying}
                >
                  <source src={video.src} type="video/quicktime" />
                  <source src={video.src} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                <button
                  className={`${styles.playOverlay} ${isPlaying ? styles.playOverlayHidden : ''}`}
                  onClick={() => handlePlay(video.id)}
                  aria-label={`Play ${video.title}`}
                  aria-hidden={isPlaying}
                  tabIndex={isPlaying ? -1 : 0}
                >
                  <span className={styles.playButton}>
                    <svg viewBox="0 0 68 48" className={styles.playIcon}>
                      <path
                        className={styles.playBg}
                        d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z"
                      />
                      <path className={styles.playArrow} d="M 45,24 27,14 27,34" />
                    </svg>
                  </span>
                </button>
              </div>
              <div className={styles.cardContent}>
                <h3>{video.title}</h3>
                <p>{video.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
});
