import { useEffect, useState } from 'react';
import { ContactSection } from '../components/home/ContactSection';
import { getStoreHours } from '../api/content';
import styles from './ContactPage.module.css';

const buildGoogleMapsSearchUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const locationDetails = [
  {
    name: 'Albany, NY',
    address: '1 Crossgates Mall Rd, Unit N202, Level 2, Near Macy\'s, Albany, NY 12203',
    phone: '+1 (201) 539-5928',
    phoneHref: 'tel:+12015395928',
    email: 'info@playfunia.com',
    mapTitle: 'PlayFunia Albany',
    mapSrc:
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2926.8276644097!2d-73.85076492335!3d42.6858833!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89de0a3aa5dc0b3b%3A0x2c3b8d2a74b8b8b8!2sCrossgates%20Mall!5e0!3m2!1sen!2sus!4v1709573099000!5m2!1sen!2sus',
    mapSearchUrl: buildGoogleMapsSearchUrl(
      '1 Crossgates Mall Rd, Unit N202, Albany, NY 12203'
    ),
  },
];

export function ContactPage() {
  const [storeHours, setStoreHours] = useState<{ day: string; hours: string }[] | null>(null);
  const [hoursError, setHoursError] = useState(false);

  useEffect(() => {
    getStoreHours('Albany')
      .then((hours) => {
        if (hours && hours.length > 0) {
          setStoreHours(hours.map((h) => ({ day: h.day, hours: h.hours })));
        } else {
          setHoursError(true);
        }
      })
      .catch(() => {
        setHoursError(true);
      });
  }, []);

  const location = locationDetails[0];

  return (
    <>
      <section className={styles.mapSection} aria-labelledby="location-heading">
        <div className={styles.inner}>
          <div className={styles.header}>
            <span className={styles.tag}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              Visit Playfunia
            </span>
            <h1 id="location-heading">Visit us at Crossgates Mall for big adventures</h1>
            <p className={styles.subtitle}>
              Come explore our indoor playground, party rooms, and play zones. Fun for kids ages 1-13!
            </p>
          </div>

          <div className={styles.mapGrid}>
            {/* Map Card */}
            <div className={styles.mapCard}>
              <div className={styles.mapFrame}>
                <iframe
                  title={location.mapTitle}
                  src={location.mapSrc}
                  loading="lazy"
                  allowFullScreen
                />
              </div>
              <div className={styles.mapCardBody}>
                <h2>{location.name}</h2>
                <div className={styles.addressRow}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
                  <span>{location.address}</span>
                </div>
                <a
                  className={styles.mapButton}
                  href={location.mapSearchUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.71 11.29l-9-9c-.39-.39-1.02-.39-1.41 0l-9 9c-.39.39-.39 1.02 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9c.39-.38.39-1.01 0-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z" /></svg>
                  Get Directions
                </a>
              </div>
            </div>

            {/* Info Card — Hours + Contact */}
            <div className={styles.infoCard}>
              <div className={styles.hoursBlock}>
                <div className={styles.hoursTitle}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  Hours
                </div>
                {hoursError ? (
                  <p className={styles.hoursError}>Hours unavailable — please call for details.</p>
                ) : storeHours ? (
                  <ul className={styles.hoursList}>
                    {storeHours.map((item) => (
                      <li key={item.day}>
                        <span>{item.day}</span>
                        <span>{item.hours}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.hoursLoading}>Loading hours...</p>
                )}
              </div>

              <div className={styles.contactBlock}>
                <p className={styles.contactBlockTitle}>Get in Touch</p>
                <a href={location.phoneHref} className={styles.contactItem}>
                  <div className={`${styles.contactIcon} ${styles.phone}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                  </div>
                  <div className={styles.contactText}>
                    <a href={location.phoneHref}>{location.phone}</a>
                    <span>Call or text us anytime</span>
                  </div>
                </a>
                <a href={`mailto:${location.email}`} className={styles.contactItem}>
                  <div className={`${styles.contactIcon} ${styles.email}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                  </div>
                  <div className={styles.contactText}>
                    <a href={`mailto:${location.email}`}>{location.email}</a>
                    <span>We reply within 1 business day</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ContactSection />
    </>
  );
}
