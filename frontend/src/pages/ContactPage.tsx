import { ContactSection } from '../components/home/ContactSection';
import { FaqSection } from '../components/home/FaqSection';
import { useHomeContent } from '../hooks/useHomeContent';
import styles from './ContactPage.module.css';

const buildGoogleMapsSearchUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const locationDetails = [
  {
    name: 'Poughkeepsie, NY',
    address: '2001 South Rd Unit A108, Poughkeepsie Galleria Mall, Poughkeepsie, NY 12601',
    hours: 'Daily 9:00 AM - 7:00 PM',
    contactLabel: 'Call 845-632-2185',
    contactHref: 'tel:+18456322185',
    mapTitle: 'Playfunia Poughkeepsie',
    mapSrc:
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2967.760513389102!2d-73.93506022340412!3d41.65145077913788!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89dd41b3f9f190c3%3A0x89ae19a20b6617f1!2sPoughkeepsie%20Galleria!5e0!3m2!1sen!2sus!4v1709573099000!5m2!1sen!2sus',
    mapSearchUrl: buildGoogleMapsSearchUrl(
      '2001 South Rd Unit A108, Poughkeepsie Galleria Mall, Poughkeepsie, NY 12601'
    ),
  },
  {
    name: 'Deptford, NJ',
    address: '2000 Deptford Center Rd, Deptford Mall, Deptford, NJ 08096',
    hours: 'Daily 9:00 AM - 7:00 PM',
    contactLabel: 'Email info@playfunia.com',
    contactHref: 'mailto:info@playfunia.com',
    mapTitle: 'Playfunia Deptford',
    mapSrc:
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3068.4948973631116!2d-75.07290522361245!3d39.849902567098974!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c6c9bd2c23d7df%3A0xf4d9159c76f7db13!2sDeptford%20Mall!5e0!3m2!1sen!2sus!4v1709573312000!5m2!1sen!2sus',
    mapSearchUrl: buildGoogleMapsSearchUrl(
      '2000 Deptford Center Rd, Deptford Mall, Deptford, NJ 08096'
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
          <h1 id="location-heading">Two mall locations ready for big adventures</h1>
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
