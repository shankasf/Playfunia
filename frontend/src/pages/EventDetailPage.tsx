import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

import { fetchEvent, fetchEventPhotos } from '../api/events';
import { ShareButtons } from '../components/common/ShareButtons';
import type { EventItem, EventPhoto } from '../data/types';
import styles from './EventDetailPage.module.css';

function formatEventDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

type LightboxItem = { url: string; type: 'image' | 'video' } | null;

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxItem, setLightboxItem] = useState<LightboxItem>(null);
  const [pausedVideos, setPausedVideos] = useState<Set<number>>(new Set());
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

  const togglePause = useCallback((photoId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRefs.current.get(photoId);
    if (!video) return;
    if (video.paused) {
      video.play();
      setPausedVideos(prev => { const next = new Set(prev); next.delete(photoId); return next; });
    } else {
      video.pause();
      setPausedVideos(prev => new Set(prev).add(photoId));
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    fetchEvent(id)
      .then(data => {
        setEvent(data);
        return fetchEventPhotos(id).catch(() => []);
      })
      .then(setPhotos)
      .catch(() => setError('Event not found'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!lightboxItem) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxItem(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxItem]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <h2>Event not found</h2>
          <p>This event may have been removed or the link is invalid.</p>
          <Link to="/events" className={styles.backLink}>View all events</Link>
        </div>
      </div>
    );
  }

  const isPast = new Date(event.endDate) < new Date();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/events" className={styles.backLink}>
          &larr; All Events
        </Link>

        <article className={styles.eventDetail}>
          {event.imageUrl && (
            <div className={styles.posterWrapper}>
              <img src={event.imageUrl} alt={event.title} className={styles.posterImage} />
              <div className={styles.badgeOverlay}>
                {isPast ? (
                  <span className={styles.completedBadge}>Completed</span>
                ) : (
                  <span className={styles.upcomingBadge}>Upcoming</span>
                )}
              </div>
            </div>
          )}

          {!event.imageUrl && (
            <div className={styles.badgeInline}>
              {isPast ? (
                <span className={styles.completedBadge}>Completed</span>
              ) : (
                <span className={styles.upcomingBadge}>Upcoming</span>
              )}
            </div>
          )}

          <div className={styles.content}>
            <h1 className={styles.title}>{event.title}</h1>
            <p className={styles.date}>{formatEventDate(event.startDate)}</p>

            {event.description && (
              <p className={styles.description}>{event.description}</p>
            )}

            <div className={styles.shareSection}>
              <span className={styles.shareLabel}>Share this event</span>
              <ShareButtons url={`/events/${id}`} title={event.title} />
            </div>
          </div>

          {photos.length > 0 && (
            <div className={styles.gallerySection}>
              <h2 className={styles.galleryLabel}>Event Photos &amp; Videos</h2>
              <div className={styles.gallery}>
                {photos.map(photo =>
                  photo.mediaType === 'video' ? (
                    <div
                      key={photo.id}
                      className={styles.videoCard}
                      onClick={() => setLightboxItem({ url: photo.url, type: 'video' })}
                    >
                      <video
                        ref={el => { if (el) videoRefs.current.set(photo.id, el); }}
                        src={photo.url}
                        className={styles.videoCardPlayer}
                        muted
                        autoPlay
                        loop
                        playsInline
                        preload="auto"
                      />
                      <button
                        className={styles.videoPauseBtn}
                        onClick={(e) => togglePause(photo.id, e)}
                        aria-label={pausedVideos.has(photo.id) ? 'Play video' : 'Pause video'}
                      >
                        {pausedVideos.has(photo.id) ? (
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        )}
                      </button>
                      <div className={styles.videoCardBottom}>
                        {photo.caption && (
                          <span className={styles.videoCardCaption}>{photo.caption}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt={photo.caption || 'Event photo'}
                      className={styles.galleryImage}
                      onClick={() => setLightboxItem({ url: photo.url, type: 'image' })}
                    />
                  ),
                )}
              </div>
            </div>
          )}
        </article>
      </div>

      {lightboxItem && (
        <div className={styles.lightboxOverlay} onClick={() => setLightboxItem(null)}>
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
