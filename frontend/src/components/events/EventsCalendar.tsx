import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import type { EventItem } from "../../data/types";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./EventsCalendar.module.css";

interface Props {
  events: EventItem[];
  isLoading?: boolean;
}

export function EventsCalendar({ events, isLoading }: Props) {
  const navigate = useNavigate();

  const grouped = useMemo(() => groupEventsByMonth(events), [events]);
  const monthKeys = Object.keys(grouped);
  const isEmpty = !isLoading && monthKeys.length === 0;

  return (
    <section className={styles.section} aria-labelledby="events-calendar-heading">
      {isLoading ? (
        <div className={styles.loading}>Loading events...</div>
      ) : isEmpty ? (
        <p className={styles.empty}></p>
      ) : (
        <div className={styles.monthList}>
          {monthKeys.map(month => (
            <div key={month} className={styles.monthGroup}>
              <h3>{month}</h3>
              <ul>
                {grouped[month].map(event => (
                  <li key={event.id} className={styles.eventRow}>
                    <div>
                      <time>{formatDateRange(event.startDate, event.endDate)}</time>
                      <h4>{event.title}</h4>
                      {event.description && <p>{event.description}</p>}
                    </div>
                    <div className={styles.ctas}>
                      <PrimaryButton
                        onClick={() => navigate("/events")}
                      >
                        View Details
                      </PrimaryButton>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function groupEventsByMonth(events: EventItem[]) {
  return events.reduce<Record<string, EventItem[]>>((acc, event) => {
    const key = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" }).format(new Date(event.startDate));
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    acc[key].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return acc;
  }, {});
}

function formatDateRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();

  const dateFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
  const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

  if (sameDay) {
    return `${dateFormatter.format(startDate)} at ${timeFormatter.format(startDate)} - ${timeFormatter.format(endDate)}`;
  }

  return `${dateFormatter.format(startDate)} ${timeFormatter.format(startDate)} - ${dateFormatter.format(endDate)} ${timeFormatter.format(endDate)}`;
}
