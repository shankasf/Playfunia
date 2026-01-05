import type { Announcement } from "../../data/types";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./AnnouncementsBanner.module.css";

interface Props {
  announcements: Announcement[];
  isLoading?: boolean;
}

export function AnnouncementsBanner({ announcements, isLoading }: Props) {
  const items = isLoading ? new Array(3).fill(null) : announcements;

  return (
    <section className={styles.section} aria-labelledby="announcements-heading">
      <div className={styles.inner}>
        <div className={styles.headingGroup}>
          <span className={styles.tag}>What's new at Playfunia</span>
          <h2 id="announcements-heading">Announcements & special offers</h2>
        </div>
        <div className={styles.marquee}>
          {items.map((announcement, index) => (
            <article key={announcement?.id ?? index} className={styles.card}>
              <header>
                <time className={styles.date}>{formatDate(announcement?.publishDate)}</time>
                <h3>{announcement?.title ?? "Loading update..."}</h3>
              </header>
              <p>{announcement?.body ?? "We're prepping fresh news for you."}</p>
              {announcement?.linkHref ? (
                <PrimaryButton to={announcement.linkHref}>{announcement.linkLabel ?? "Learn more"}</PrimaryButton>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatDate(value?: string) {
  if (!value) return "Recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

