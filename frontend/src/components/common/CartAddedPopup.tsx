import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './CartAddedPopup.module.css';

export type CartPopupData = {
  itemType: 'ticket' | 'membership' | 'booking';
  label: string;
  details: Array<{ key: string; value: string }>;
};

interface CartAddedPopupProps {
  data: CartPopupData;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  ticket: 'Play Pass',
  membership: 'Membership',
  booking: 'Party Booking',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  ticket: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
    </svg>
  ),
  membership: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  ),
  booking: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

export function CartAddedPopup({ data, onClose }: CartAddedPopupProps) {
  const navigate = useNavigate();

  const handleViewCart = useCallback(() => {
    onClose();
    navigate('/cart');
  }, [onClose, navigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const typeLabel = TYPE_LABELS[data.itemType] ?? 'Item';
  const typeIcon = TYPE_ICONS[data.itemType] ?? null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <div className={styles.iconCircle}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h3 className={styles.title}>Added to Cart!</h3>

        <div className={styles.typeBadge}>
          {typeIcon}
          <span>{typeLabel}</span>
        </div>

        <p className={styles.itemLabel}>{data.label}</p>

        {data.details.length > 0 && (
          <div className={styles.detailsBox}>
            {data.details.map(({ key, value }) => (
              <div key={key} className={styles.detailRow}>
                <span className={styles.detailKey}>{key}</span>
                <span className={styles.detailValue}>{value}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.buttons}>
          <button type="button" className={styles.viewCartBtn} onClick={handleViewCart}>
            View Cart
          </button>
          <button type="button" className={styles.okBtn} onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
