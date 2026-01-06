import { ContactSection } from '../components/home/ContactSection';
import { FaqSection } from '../components/home/FaqSection';
import { useHomeContent } from '../hooks/useHomeContent';
import styles from './ContactPage.module.css';

const buildGoogleMapsSearchUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const locationDetails = [
  {
    name: 'Albany, NY',
    address: '1 Crossgates Mall Rd, Unit N202, Level 2, Near Macy\'s, Albany, NY 12203',
    hours: 'Daily 9:00 AM - 7:00 PM',
    contactLabel: 'Call +1 (201) 539-5928',
    contactHref: 'tel:+12015395928',
    mapTitle: 'PlayFunia Albany',
    mapSrc:
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2926.8276644097!2d-73.85076492335!3d42.6858833!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89de0a3aa5dc0b3b%3A0x2c3b8d2a74b8b8b8!2sCrossgates%20Mall!5e0!3m2!1sen!2sus!4v1709573099000!5m2!1sen!2sus',
    mapSearchUrl: buildGoogleMapsSearchUrl(
      '1 Crossgates Mall Rd, Unit N202, Albany, NY 12203'
    ),
  },
];

export function ContactPage() {
  const { faqs } = useHomeContent();
  const faqItems = faqs.data.slice(0, 3);

  return (
    <>
      <section className={styles.mapSection} aria-labelledby="location-heading">
        <div className={styles.header}>
          <span className={styles.tag}>Visit Playfunia</span>
          <h1 id="location-heading">Visit us at Crossgates Mall for big adventures</h1>
          <p>
            Drop in during open play hours or schedule a tour to explore our party rooms and STEM
            stations.
          </p>
        </div>
        <div className={styles.mapGrid}>
          {locationDetails.map((location) => (
            <article key={location.name} className={styles.mapCard}>
              <h2>{location.name}</h2>
              <p>{location.address}</p>
              <div className={styles.mapFrame}>
                <iframe
                  title={location.mapTitle}
                  src={location.mapSrc}
                  loading="lazy"
                  allowFullScreen
                />
              </div>
              <a
                className={styles.mapButton}
                href={location.mapSearchUrl}
                target="_blank"
                rel="noreferrer"
              >
                View in Google Maps
              </a>
              <p className={styles.hours}>
                <strong>Hours:</strong> {location.hours}
              </p>
              <a className={styles.link} href={location.contactHref}>
                {location.contactLabel}
              </a>
            </article>
          ))}
        </div>
      </section>

      <ContactSection />

      <FaqSection
        items={faqItems}
        isLoading={faqs.isLoading}
        sectionId="contact-faq"
        tagLabel="Quick answers"
        title="Helpful info before you visit"
        description="Questions about ages, socks, or snacks? Start here, or head to the full FAQ for more."
      />
    </>
  );
}
