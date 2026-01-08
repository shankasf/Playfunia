import { Link } from 'react-router-dom';
import { useCheckout } from '../../context/CheckoutContext';
import styles from './CartIcon.module.css';

export function CartIcon() {
  const { items } = useCheckout();

  const pendingCount = items.filter(item => {
    if (item.type === 'ticket') return item.status === 'pending';
    if (item.type === 'membership') return item.status === 'pending';
    if (item.type === 'booking') return item.status === 'awaiting_deposit';
    return false;
  }).length;

  return (
    <Link to="/cart" className={styles.cartLink} aria-label={`Shopping cart with ${pendingCount} items`}>
      <svg
        className={styles.cartIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {pendingCount > 0 && (
        <span className={styles.badge}>
          {pendingCount > 9 ? '9+' : pendingCount}
        </span>
      )}
    </Link>
  );
}
