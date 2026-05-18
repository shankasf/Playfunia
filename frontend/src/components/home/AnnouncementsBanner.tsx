import type { Announcement } from "../../data/types";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./AnnouncementsBanner.module.css";

interface Props {
  announcements: Announcement[];
  isLoading?: boolean;
}

export function AnnouncementsBanner({ announcements, isLoading }: Props) {
  const items = isLoading ? new Array(3).fill(null) : announcements;
  const { ref, isVisible } = useScrollReveal();

  return (
    <section ref={ref} className={styles.section} aria-labelledby="announcements-heading">
      <div className={styles.inner}>
        <div className={styles.headingGroup}>
          <span className={styles.tag}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            What's new at Playfunia
          </span>
          <h2 id="announcements-heading">Announcements & Special Offers</h2>
          <p className={styles.subtitle}>Stay in the loop with the latest events, deals, and exciting updates.</p>
        </div>
        <div className={`${styles.marquee} ${isVisible ? styles.visible : ""}`}>
          {items.length === 0 && !isLoading ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon} aria-hidden="true">&#x1F389;</span>
              <p>No announcements right now — check back soon!</p>
            </div>
          ) : (
            items.map((announcement, index) => (
              <article key={announcement?.id ?? index} className={styles.card}>
                <header>
                  <time className={styles.date}>
                    <svg className={styles.dateIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    {formatDate(announcement?.publishDate)}
                  </time>
                  <h3>{announcement?.title ?? "Loading update..."}</h3>
                </header>
                <p>{announcement?.body ?? "We're prepping fresh news for you."}</p>
                {announcement?.linkHref ? (
                  <PrimaryButton to={announcement.linkHref}>{announcement.linkLabel ?? "Learn more"}</PrimaryButton>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function formatDate(value?: string) {
  if (!value) return "Recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(value));
}

