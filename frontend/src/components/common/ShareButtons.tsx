import { useCallback, useState, useEffect } from 'react';
import styles from './ShareButtons.module.css';

type ShareButtonsProps = {
  url: string;
  title: string;
  compact?: boolean;
};

export function ShareButtons({ url, title, compact }: ShareButtonsProps) {
  const message = `Check out this event at Playfunia: ${title}`;
  const fullUrl = url.startsWith('http') ? url : `https://playfunia.com${url}`;
  const encoded = encodeURIComponent(fullUrl);
  const encodedMessage = encodeURIComponent(message);

  const [toast, setToast] = useState(false);

  // Auto-dismiss toast and open Instagram after delay
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(false);
      // Open Instagram DMs — app intercepts on mobile
      window.location.href = 'instagram://direct-inbox';
      // Fallback to web if app doesn't open
      const fallback = setTimeout(() => {
        window.open('https://www.instagram.com/direct/inbox/', '_blank');
      }, 1500);
      return () => clearTimeout(fallback);
    }, 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleSMS = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`sms:?&body=${encodedMessage}%20${encoded}`, '_blank');
  }, [encodedMessage, encoded]);

  const handleWhatsApp = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`https://wa.me/?text=${encodedMessage}%20${encoded}`, '_blank');
  }, [encodedMessage, encoded]);

  const handleInstagram = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(`${message} ${fullUrl}`).then(() => {
      setToast(true);
    });
  }, [message, fullUrl]);

  return (
    <>
      <div className={`${styles.shareRow} ${compact ? styles.compact : ''}`}>
        <button type="button" className={`${styles.shareBtn} ${styles.sms}`} onClick={handleSMS} title="Share via Text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {!compact && <span>Text</span>}
        </button>
        <button type="button" className={`${styles.shareBtn} ${styles.whatsapp}`} onClick={handleWhatsApp} title="Share via WhatsApp">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
          </svg>
          {!compact && <span>WhatsApp</span>}
        </button>
        <button type="button" className={`${styles.shareBtn} ${styles.instagram}`} onClick={handleInstagram} title="Share via Instagram">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          {!compact && <span>Instagram</span>}
        </button>
      </div>

      {toast && (
        <div className={styles.toastOverlay}>
          <div className={styles.toast}>
            <div className={styles.toastIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p className={styles.toastTitle}>Link Copied!</p>
            <p className={styles.toastSub}>Opening Instagram — just paste in any chat</p>
          </div>
        </div>
      )}
    </>
  );
}
