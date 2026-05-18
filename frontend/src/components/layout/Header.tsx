import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { PrimaryButton } from '../common/PrimaryButton';
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

export function Header() {
  const { user, isTeamMember } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const closeMenu = () => setOpen(false);
  const toggleMenu = () => setOpen((prev) => !prev);
  const adminTarget = '/admin';

  return (
    <header className={styles.wrapper}>
      <div className={styles.inner}>
        <div className={styles.primaryRow}>
          <NavLink to="/" className={styles.brand} onClick={closeMenu}>
            <img
              src="/images/logo-text.png"
              alt="Playfunia"
              className={styles.brandSticker}
            />
            <span className={styles.brandTagline}>Indoor Play & Adventure Club</span>
          </NavLink>

          <div className={styles.actions}>
            {user ? <span className={styles.greeting}>Hi, {user.firstName}</span> : null}
            <div className={styles.desktopCtas}>
              <PrimaryButton to="/book-party" className={styles.ctaPrimary}>
                Book a Party
              </PrimaryButton>
              <PrimaryButton to="/buy-ticket" className={styles.ctaSecondary}>
                Buy Ticket
              </PrimaryButton>
              <PrimaryButton to="/account" className={styles.accountButton}>
                {user ? 'Account' : 'Sign in'}
              </PrimaryButton>
              {isTeamMember && (
                <PrimaryButton to={adminTarget} className={styles.adminButton}>
                  Admin
                </PrimaryButton>
              )}
            </div>
            <div className={styles.cartWrapper}>
              <CartIcon />
            </div>
            <button
              className={styles.menuButton}
              onClick={toggleMenu}
              aria-label="Toggle navigation"
              aria-expanded={open}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        {/* Nav links — always visible, scrollable on mobile */}
        <nav className={styles.nav}>
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

        {/* Mobile CTA drawer — toggled by hamburger */}
        <div className={`${styles.mobileDrawer} ${open ? styles.drawerOpen : ''}`}>
          <PrimaryButton to="/book-party" onClick={closeMenu} className={styles.drawerBtn}>
            Book a Party
          </PrimaryButton>
          <PrimaryButton to="/buy-ticket" onClick={closeMenu} className={styles.drawerBtn}>
            Buy Tickets
          </PrimaryButton>
          <PrimaryButton to="/account" onClick={closeMenu} className={styles.drawerBtn}>
            {user ? 'Account' : 'Sign in'}
          </PrimaryButton>
          {isTeamMember && (
            <PrimaryButton to="/admin" onClick={closeMenu} className={styles.adminButton}>
              Admin
            </PrimaryButton>
          )}
        </div>
      </div>
    </header>
  );
}
