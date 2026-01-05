import { useMemo } from "react";

import type { EventItem } from "../../data/types";
import styles from "./EventsShowcase.module.css";

interface Props {
  events: EventItem[];
  isLoading?: boolean;
}

const formatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function EventsShowcase({ events, isLoading }: Props) {
  const sorted = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [events]);

  return (
    <section className={styles.section} id="events">
      <div className={styles.header}>
        <span className={styles.tag}>Upcoming at Playfunia</span>
        <h2>Events designed to wow kids & impress parents</h2>
        <p>Workshops, sensory mornings, glow parties, and seasonal camps keep your calendar exciting.</p>
      </div>

      <div className={styles.grid}>
        {(isLoading ? new Array(3).fill(null) : sorted).map((event, index) => (
          <article key={event?.id ?? index} className={styles.card}>
            <div className={styles.dateBadge}>
              <span>{event ? formatter.format(new Date(event.startDate)).split(" ")[0] : "--"}</span>
              <strong>{event ? formatter.format(new Date(event.startDate)).split(" ")[1] : "--"}</strong>
            </div>
            <div className={styles.body}>
              <h3>{event?.title ?? "Family fun loading"}</h3>
              <p>{event?.description ?? "Hang tight while we finalize the lineup."}</p>
              <div className={styles.meta}>
                <span>Location: {event?.location ?? "Playfunia"}</span>
                <span>Admission: ${event?.price ?? "--"} per explorer</span>
              </div>
              <div className={styles.tags}>
                {(event?.tags ?? ["community"]).map((tag: string) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
