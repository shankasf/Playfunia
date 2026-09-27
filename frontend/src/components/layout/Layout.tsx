import { Outlet, useLocation } from 'react-router-dom';

import { Header } from './Header';
import { Footer } from './Footer';
import styles from './Layout.module.css';
import { Chatbot } from '../chat/Chatbot';
import { CookieConsent } from '../common/CookieConsent';

export function Layout() {
  const location = useLocation();
  // Admin pages don't need the customer-facing chatbot.
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer />
      {!isAdminRoute && <Chatbot />}
      <CookieConsent />
    </div>
  );
}
