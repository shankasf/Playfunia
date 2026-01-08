import { useState } from 'react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { PrimaryButton } from '../common/PrimaryButton';
import { CartIcon } from '../cart/CartIcon';
import styles from './Header.module.css';

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Memberships', to: '/membership' },
  { label: 'Parties', to: '/parties' },
  { label: 'Events', to: '/events' },
  { label: 'Testimonials', to: '/testimonials' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact', to: '/contact' },
  { label: 'Waiver', to: '/waiver' },
];

export function Header() {
  const { user, isTeamMember } = useAuth();
  const [open, setOpen] = useState(false);

  const closeMenu = () => setOpen(false);
  const toggleMenu = () => setOpen((prev) => !prev);
  const adminTarget = '/admin';

  return (
    <header className={styles.wrapper}>
      <div className={styles.inner}>
        <div className={styles.primaryRow}>
          <NavLink to="/" className={styles.brand} onClick={closeMenu}>
            <img
              src="/images/logo.png"
              alt="Playfunia"
              className={styles.brandLogo}
            />
            <div className={styles.brandText}>
              <span className={styles.brandTitle}>Playfunia</span>
              <span className={styles.brandTagline}>Indoor Play & Adventure Club</span>
            </div>
          </NavLink>

          <div className={styles.actions}>
            {user ? <span className={styles.greeting}>Hi, {user.firstName}</span> : null}
            <div className={styles.desktopCtas}>
              <PrimaryButton to="/book-party" className={styles.ctaPrimary}>
                Book a Party
              </PrimaryButton>
              <PrimaryButton to="/buy-ticket" className={styles.ctaSecondary}>
                Buy Tickets
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

        <nav className={`${styles.nav} ${open ? styles.navOpen : ''}`}>
          {navLinks.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.activeLink : ''}`.trim()
              }
              onClick={closeMenu}
            >
              {link.label}
            </NavLink>
          ))}
          <div className={styles.mobileCtas}>
            <PrimaryButton to="/book-party" onClick={closeMenu}>
              Book a Party
            </PrimaryButton>
            <PrimaryButton to="/buy-ticket" onClick={closeMenu}>
              Buy Tickets
            </PrimaryButton>
            <PrimaryButton to="/account" onClick={closeMenu}>
              {user ? 'Account' : 'Sign in'}
            </PrimaryButton>
            {isTeamMember && (
              <PrimaryButton to="/admin" onClick={closeMenu} className={styles.adminButton}>
                Admin
              </PrimaryButton>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
