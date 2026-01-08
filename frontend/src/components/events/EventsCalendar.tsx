import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { EventItem } from "../../data/types";
import { useCheckout } from "../../context/CheckoutContext";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./EventsCalendar.module.css";

interface Props {
  events: EventItem[];
  isLoading?: boolean;
}

export function EventsCalendar({ events, isLoading }: Props) {
  const { addTicketPurchase } = useCheckout();
  const navigate = useNavigate();
  const [addedEventId, setAddedEventId] = useState<string | null>(null);

  const grouped = useMemo(() => groupEventsByMonth(events), [events]);
  const monthKeys = Object.keys(grouped);
  const isEmpty = !isLoading && monthKeys.length === 0;

  const handleReservePass = (event: EventItem) => {
    const cartId = `event-ticket-${event.id}-${Date.now()}`;
    addTicketPurchase({
      id: cartId,
      type: "ticket",
      eventId: event.id,
      label: `${event.title} - ${formatDateRange(event.startDate, event.endDate)}`,
      quantity: 1,
      unitPrice: event.price,
      total: event.price,
      status: "pending",
    });
    setAddedEventId(event.id);
    setTimeout(() => {
      navigate("/cart");
    }, 500);
  };

  return (
    <section className={styles.section} aria-labelledby="events-calendar-heading">
      <div className={styles.header}>
        <span className={styles.tag}>Upcoming calendar</span>
        <h2 id="events-calendar-heading">Reserve a spot at an upcoming Playfunia event</h2>
        <p>From glow parties to sensory mornings, every ticket includes all-day playtime.</p>
      </div>
      {isLoading ? (
        <div className={styles.loading}>Loading events...</div>
      ) : isEmpty ? (
        <p className={styles.empty}>New events are on the way. Check back soon or follow us on social media!</p>
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
                      <p>{event.description}</p>
                      <span className={styles.location}>{event.location}</span>
                    </div>
                    <div className={styles.ctas}>
                      <span className={styles.price}>${event.price}</span>
                      <PrimaryButton
                        onClick={() => handleReservePass(event)}
                        disabled={addedEventId === event.id}
                      >
                        {addedEventId === event.id ? "Added to Cart!" : "Reserve Pass"}
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
    const key = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(event.startDate));
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

  const dateFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

  if (sameDay) {
    return `${dateFormatter.format(startDate)} at ${timeFormatter.format(startDate)} - ${timeFormatter.format(endDate)}`;
  }

  return `${dateFormatter.format(startDate)} ${timeFormatter.format(startDate)} - ${dateFormatter.format(endDate)} ${timeFormatter.format(endDate)}`;
}
