import { Outlet } from 'react-router-dom';

import { Header } from './Header';
import { Footer } from './Footer';
import styles from './Layout.module.css';
import { Chatbot } from '../chat/Chatbot';

export function Layout() {
  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer />
      <Chatbot />
    </div>
  );
}
