import { useEffect, useRef, useState } from 'react';
import styles from './InstagramFeed.module.css';

const REELS = [
  { id: 'DSaWqOzjfmT', url: 'https://www.instagram.com/reel/DSaWqOzjfmT/embed/?autoplay=1&muted=1' },
  { id: 'DSZEWsGDQch', url: 'https://www.instagram.com/reel/DSZEWsGDQch/embed/?autoplay=1&muted=1' },
  { id: 'DULhPK2jZ8x', url: 'https://www.instagram.com/reel/DULhPK2jZ8x/embed/?autoplay=1&muted=1' },
];

function ReelCard({ reel, visible }: { reel: typeof REELS[number]; visible: boolean }) {
  return (
    <div className={styles.reelCard}>
      <div className={styles.reelInner}>
        <div className={styles.reelCrop}>
          {visible ? (
            <iframe
              className={styles.reelFrame}
              src={reel.url}
              allowFullScreen
              allow="autoplay; encrypted-media"
              loading="lazy"
              scrolling="no"
              title={`Instagram reel ${reel.id}`}
            />
          ) : (
            <div className={styles.skeleton} />
          )}
        </div>
      </div>
    </div>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function InstagramFeed() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={styles.section} aria-labelledby="instagram-heading" ref={sectionRef}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.tag}>
            <InstagramIcon className={styles.igIcon} />
            Live from Instagram
          </span>
          <h2 id="instagram-heading">See the smiles happening right now</h2>
          <p>
            Catch the latest parties, play sessions, and toddler giggles in real time.
            Follow us{' '}
            <a href="https://instagram.com/playfunia_" target="_blank" rel="noreferrer">
              @playfunia_
            </a>
          </p>
        </div>

        <div className={`${styles.reelGrid} ${visible ? styles.visible : ''}`}>
          {REELS.map((reel) => (
            <ReelCard key={reel.id} reel={reel} visible={visible} />
          ))}
        </div>

        <div className={styles.followCta}>
          <a
            href="https://instagram.com/playfunia_"
            target="_blank"
            rel="noreferrer"
            className={styles.followButton}
          >
            <InstagramIcon className={styles.igIcon} />
            Follow @playfunia_ on Instagram
          </a>
        </div>
      </div>
    </section>
  );
}
