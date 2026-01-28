import { useState, useEffect } from 'react';
import styles from './CookieConsent.module.css';

const COOKIE_CONSENT_KEY = 'playfunia_cookie_consent';
const IMAGE_CACHE_KEY = 'playfunia_image_cache_enabled';

type ConsentStatus = 'pending' | 'accepted' | 'declined';

export function CookieConsent() {
  const [status, setStatus] = useState<ConsentStatus>('pending');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const savedConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (savedConsent === 'accepted' || savedConsent === 'declined') {
      setStatus(savedConsent as ConsentStatus);
      setVisible(false);
    } else {
      // Show banner after a short delay for better UX
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    localStorage.setItem(IMAGE_CACHE_KEY, 'true');
    setStatus('accepted');
    setVisible(false);

    // Enable enhanced caching by notifying service worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'ENABLE_IMAGE_CACHE',
      });
    }
  };

  const handleDecline = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    localStorage.setItem(IMAGE_CACHE_KEY, 'false');
    setStatus('declined');
    setVisible(false);
  };

  if (!visible || status !== 'pending') {
    return null;
  }

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <div className={styles.text}>
          <h3>We value your privacy</h3>
          <p>
            We use cookies and local storage to improve your experience, cache images for faster loading,
            and remember your preferences. By accepting, you allow us to store data locally for a smoother experience.
          </p>
        </div>
        <div className={styles.actions}>
          <button className={styles.declineBtn} onClick={handleDecline}>
            Decline
          </button>
          <button className={styles.acceptBtn} onClick={handleAccept}>
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to check if image caching is enabled
export function isImageCacheEnabled(): boolean {
  return localStorage.getItem(IMAGE_CACHE_KEY) === 'true';
}

// Helper to check consent status
export function getCookieConsent(): ConsentStatus {
  const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
  if (saved === 'accepted') return 'accepted';
  if (saved === 'declined') return 'declined';
  return 'pending';
}
