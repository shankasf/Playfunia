import { memo, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./HeroSection.module.css";

export const HeroSection = memo(function HeroSection() {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced && videoRef.current) {
      videoRef.current.pause();
    }
  }, []);

  const greeting = user
    ? `Hey ${user.firstName}, ready for more Playfunia adventures?`
    : "Playfunia - indoor playgrounds designed for families";

  return (
    <section className={styles.hero} id="hero">
      <div className={styles.videoArea}>
        <video
          ref={videoRef}
          className={styles.heroVideo}
          autoPlay
          muted
          loop
          playsInline
          src="/videos/hero-showcase.mp4"
        />
      </div>
      <div className={styles.bottomBar}>
        <div className={styles.content}>
          <span className={styles.tag}>{greeting}</span>
          <h1>The most fun indoor playground experience for kids ages 1-13.</h1>
          <div className={styles.row}>
            <p className={styles.note}>Grip socks required for play (available on-site for $3).</p>
            <div className={styles.actions}>
              <PrimaryButton to="/buy-ticket">Buy Tickets</PrimaryButton>
              <PrimaryButton to="/book-party" className={styles.outlineButton}>
                Book a Party
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
