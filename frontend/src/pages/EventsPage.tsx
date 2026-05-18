import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useHomeContent } from '../hooks/useHomeContent';
import { ShareButtons } from '../components/common/ShareButtons';
import type { EventItem } from '../data/types';
import styles from './EventsPage.module.css';

function formatEventDate(startDate: string): string {
  const start = new Date(startDate);
  return start.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

function isPastEvent(event: EventItem): boolean {
  return new Date(event.endDate) < new Date();
}

export function EventsPage() {
  const { events } = useHomeContent();

  // Sort: upcoming first (ascending), then past (descending)
  const sortedEvents = useMemo(() => {
    if (!events.data) return [];
    const now = new Date();
    const upcoming = events.data
      .filter(e => new Date(e.endDate) >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const past = events.data
      .filter(e => new Date(e.endDate) < now)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    return [...upcoming, ...past];
  }, [events.data]);

  if (events.isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Events</h1>
        <p>See what's happening at Playfunia</p>
      </div>

      {sortedEvents.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No events scheduled yet. Check back soon!</p>
        </div>
      ) : (
        <div className={styles.eventGrid}>
          {sortedEvents.map(event => {
            const past = isPastEvent(event);
            return (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className={`${styles.eventCard} ${past ? styles.pastCard : ''}`}
              >
                <div className={styles.posterWrapper}>
                  {event.imageUrl ? (
                    <img
                      src={event.imageUrl}
                      alt={event.title}
                      className={styles.posterImage}
                    />
                  ) : (
                    <div className={styles.posterPlaceholder}>
                      <span>{event.title.charAt(0)}</span>
                    </div>
                  )}
                  <div className={styles.badgeOverlay}>
                    {past ? (
                      <span className={styles.completedBadge}>Completed</span>
                    ) : (
                      <span className={styles.upcomingBadge}>Upcoming</span>
                    )}
                  </div>
                  {past && event.hasMedia && (
                    <div className={styles.mediaHintOverlay}>
                      <span className={styles.mediaHintText}>
                        Click to see post event images/videos
                      </span>
                    </div>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{event.title}</h3>
                  <p className={styles.cardDate}>
                    {formatEventDate(event.startDate)}
                  </p>
                  <div className={styles.cardShare}>
                    <ShareButtons url={`/events/${event.id}`} title={event.title} compact />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
