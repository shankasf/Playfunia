import { useEffect, useMemo, useState } from 'react';

import { useHomeContent } from '../hooks/useHomeContent';
import { fetchEventPhotos } from '../api/events';
import type { EventItem, EventPhoto } from '../data/types';
import styles from './EventsPage.module.css';

function formatEventDate(startDate: string): string {
  const start = new Date(startDate);
  return start.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function isPastEvent(event: EventItem): boolean {
  return new Date(event.endDate) < new Date();
}

type LightboxItem = { url: string; type: 'image' | 'video' } | null;

export function EventsPage() {
  const { events } = useHomeContent();

  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<LightboxItem>(null);

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

  // Load photos when a past event modal opens
  useEffect(() => {
    if (!selectedEvent) {
      setPhotos([]);
      return;
    }
    if (isPastEvent(selectedEvent)) {
      setPhotosLoading(true);
      fetchEventPhotos(selectedEvent.id)
        .then(setPhotos)
        .catch(() => setPhotos([]))
        .finally(() => setPhotosLoading(false));
    }
  }, [selectedEvent]);

  // Close modal on Escape
  useEffect(() => {
    if (!selectedEvent && !lightboxItem) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxItem) {
          setLightboxItem(null);
        } else {
          setSelectedEvent(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedEvent, lightboxItem]);

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
              <div
                key={event.id}
                className={`${styles.eventCard} ${past ? styles.pastCard : ''}`}
                onClick={() => setSelectedEvent(event)}
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedEvent && (
        <div
          className={styles.modalOverlay}
          onClick={e => {
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <div className={styles.modal}>
            <button
              className={styles.modalClose}
              onClick={() => setSelectedEvent(null)}
              aria-label="Close"
            >
              &times;
            </button>

            {selectedEvent.imageUrl && (
              <img
                src={selectedEvent.imageUrl}
                alt={selectedEvent.title}
                className={styles.modalImage}
              />
            )}

            <div className={styles.modalBody}>
              <h2 className={styles.modalTitle}>{selectedEvent.title}</h2>

              <p className={styles.modalDate}>
                {formatEventDate(selectedEvent.startDate)}
              </p>

              {selectedEvent.description && (
                <p className={styles.modalDescription}>{selectedEvent.description}</p>
              )}

              {/* Past event photo/video gallery */}
              {isPastEvent(selectedEvent) && (
                <>
                  {photosLoading && (
                    <div className={styles.loading}>
                      <div className={styles.spinner} />
                    </div>
                  )}
                  {!photosLoading && photos.length > 0 && (
                    <>
                      <h3 className={styles.photoGalleryLabel}>Event Photos &amp; Videos</h3>
                      <div className={styles.photoGallery}>
                        {photos.map(photo =>
                          photo.mediaType === 'video' ? (
                            <div
                              key={photo.id}
                              className={styles.videoThumbWrapper}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxItem({ url: photo.url, type: 'video' });
                              }}
                            >
                              <video
                                src={photo.url}
                                className={styles.galleryVideo}
                                muted
                                preload="metadata"
                              />
                              <div className={styles.playIconOverlay}>
                                <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          ) : (
                            <img
                              key={photo.id}
                              src={photo.url}
                              alt={photo.caption || 'Event photo'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxItem({ url: photo.url, type: 'image' });
                              }}
                            />
                          ),
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxItem && (
        <div
          className={styles.lightboxOverlay}
          onClick={() => setLightboxItem(null)}
        >
          {lightboxItem.type === 'video' ? (
            <video
              src={lightboxItem.url}
              className={styles.lightboxVideo}
              controls
              autoPlay
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <img
              src={lightboxItem.url}
              alt="Full size"
              className={styles.lightboxImage}
            />
          )}
        </div>
      )}
    </div>
  );
}
