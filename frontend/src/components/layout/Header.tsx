import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { CartIcon } from '../cart/CartIcon';
import styles from './Header.module.css';

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Memberships', to: '/membership' },
  { label: 'Parties', to: '/book-party' },
  { label: 'Events', to: '/events' },
  { label: 'Testimonials', to: '/testimonials' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact', to: '/contact' },
  { label: 'Waiver', to: '/waiver' },
  { label: 'Careers', to: '/careers' },
];

const iconProps = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const ShieldIcon = () => (
  <svg {...iconProps} className={styles.btnIcon}>
    <path d="M12 2.5 4.5 5.5v5.2c0 4.6 3.1 8.8 7.5 10.3 4.4-1.5 7.5-5.7 7.5-10.3V5.5L12 2.5Z" />
    <path d="m9.3 12 1.9 1.9 3.6-3.8" />
  </svg>
);

const UserIcon = () => (
  <svg {...iconProps} className={styles.btnIcon}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20.5c0-3.6 3.6-6 8-6s8 2.4 8 6" />
  </svg>
);

const TicketIcon = () => (
  <svg {...iconProps} className={styles.btnIcon}>
    <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
    <path d="M13 5v2M13 11v2M13 17v2" />
  </svg>
);

const PartyIcon = () => (
  <svg {...iconProps} className={styles.btnIcon}>
    <path d="m5.5 14.5 4 4L21 7.5l-1-1-1.5 1.3L14 3.5l-1 1-.2 2.3-3 3L7.5 9l-2 5.5Z" />
    <path d="M4 20l1.5-5.5 4 4L4 20Z" />
  </svg>
);

function initialsOf(name: string | undefined | null): string {
  const n = (name ?? '').trim();
  return n ? n[0].toUpperCase() : '?';
}

export function Header() {
  const { user, isTeamMember } = useAuth();
  const [open, setOpen] = useState(false);
  const [elevated, setElevated] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Add a soft shadow once the page is scrolled so the sticky header reads as a surface.
  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMenu = () => setOpen(false);
  const toggleMenu = () => setOpen((prev) => !prev);

  const accountLabel = user ? user.firstName || 'Account' : 'Sign in';

  return (
    <header className={`${styles.wrapper} ${elevated ? styles.elevated : ''}`.trim()}>
      <div className={styles.inner}>
        <div className={styles.primaryRow}>
          <NavLink to="/" className={styles.brand} onClick={closeMenu} aria-label="Playfunia home">
            <img src="/images/logo-text.png" alt="Playfunia" className={styles.brandSticker} />
            <span className={styles.brandTagline}>Indoor Play &amp; Adventure Club</span>
          </NavLink>

          <div className={styles.actions}>
            <div className={styles.ctaGroup}>
              <Link to="/buy-ticket" className={`${styles.btn} ${styles.btnTonal}`}>
                <TicketIcon />
                Buy Tickets
              </Link>
              <Link to="/book-party" className={`${styles.btn} ${styles.btnPrimary}`}>
                <PartyIcon />
                Book a Party
              </Link>
            </div>

            <div className={styles.utilityGroup}>
              {isTeamMember && (
                <Link to="/admin" className={`${styles.btn} ${styles.btnQuiet}`}>
                  <ShieldIcon />
                  Admin
                </Link>
              )}
              <Link
                to="/account"
                className={`${styles.btn} ${styles.btnQuiet} ${styles.accountBtn}`}
                aria-label={user ? `Account for ${accountLabel}` : 'Sign in'}
              >
                {user ? (
                  <span className={styles.avatar} aria-hidden="true">{initialsOf(user.firstName)}</span>
                ) : (
                  <UserIcon />
                )}
                <span className={styles.accountLabel}>{accountLabel}</span>
              </Link>
              <CartIcon />
            </div>

            <button
              type="button"
              className={`${styles.menuButton} ${open ? styles.menuButtonOpen : ''}`.trim()}
              onClick={toggleMenu}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        {/* Nav links — always visible, scrollable on mobile */}
        <nav className={styles.nav} aria-label="Main">
          {navLinks.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.activeLink : ''}`.trim()
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Mobile drawer — toggled by hamburger */}
        <div className={`${styles.mobileDrawer} ${open ? styles.drawerOpen : ''}`.trim()}>
          <Link to="/book-party" onClick={closeMenu} className={`${styles.btn} ${styles.btnPrimary} ${styles.drawerBtn}`}>
            <PartyIcon />
            Book a Party
          </Link>
          <Link to="/buy-ticket" onClick={closeMenu} className={`${styles.btn} ${styles.btnTonal} ${styles.drawerBtn}`}>
            <TicketIcon />
            Buy Tickets
          </Link>
          <div className={styles.drawerDivider} />
          <Link to="/account" onClick={closeMenu} className={`${styles.btn} ${styles.btnQuiet} ${styles.drawerBtn}`}>
            {user ? <span className={styles.avatar} aria-hidden="true">{initialsOf(user.firstName)}</span> : <UserIcon />}
            {user ? `${accountLabel} · Account` : 'Sign in'}
          </Link>
          {isTeamMember && (
            <Link to="/admin" onClick={closeMenu} className={`${styles.btn} ${styles.btnQuiet} ${styles.drawerBtn}`}>
              <ShieldIcon />
              Admin dashboard
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
