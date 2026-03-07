import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getJobListings, type JobListing } from '../api/careers';
import styles from './CareersPage.module.css';

const workPerks = [
  { icon: '🎉', title: 'Fun Environment', desc: 'Work in a vibrant, play-filled space every day' },
  { icon: '📅', title: 'Flexible Hours', desc: 'Schedules that work with school, life, and other commitments' },
  { icon: '🚀', title: 'Growth Opportunities', desc: 'Start part-time, grow into leadership roles' },
];

export function CareersPage() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [listings, setListings] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const loadListings = () => {
    setLoading(true);
    setLoadError(false);
    getJobListings()
      .then(data => {
        setListings(data);
        // Auto-expand the job matching the slug
        if (slug) {
          const match = data.find(l => l.slug === slug);
          if (match) {
            setExpandedId(match.id);
            // Scroll to the card after render
            setTimeout(() => {
              cardRefs.current[match.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
          }
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadListings(); }, [slug]);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* Open Positions */}
        <section className={styles.positionsSection}>
          <h2>Open Positions</h2>

          {loading && <div className={styles.loading}>Loading positions...</div>}

          {!loading && loadError && (
            <div className={styles.errorState}>
              <p>Unable to load open positions. Please try again.</p>
              <button className={styles.retryBtn} onClick={loadListings}>Retry</button>
            </div>
          )}

          {!loading && !loadError && listings.length === 0 && (
            <div className={styles.loading}>
              No open positions at this time. Check back soon!
            </div>
          )}

          {listings.map(listing => {
            const isOpen = expandedId === listing.id;
            const toggleExpand = () => {
              if (isOpen) {
                setExpandedId(null);
                navigate('/careers', { replace: true });
              } else {
                setExpandedId(listing.id);
                navigate(`/careers/${listing.slug}`, { replace: true });
              }
            };
            return (
              <div key={listing.id} ref={el => { cardRefs.current[listing.id] = el; }} className={`${styles.jobCard} ${isOpen ? styles.jobCardOpen : ''}`}>
                <div className={styles.jobCardHeader}>
                  <div className={styles.jobCardLeft}>
                    <Link to={`/careers/${listing.slug}`} className={styles.jobTitleLink} onClick={e => { e.preventDefault(); toggleExpand(); }}>
                      <div className={styles.jobTitle}>{listing.title}</div>
                    </Link>
                    <div className={styles.jobMeta}>
                      <span className={`${styles.badge} ${styles.badgeDept}`}>{listing.department}</span>
                      <span className={`${styles.badge} ${styles.badgeType}`}>{listing.employmentType}</span>
                      {listing.payRange && (
                        <span className={`${styles.badge} ${styles.badgePay}`}>{listing.payRange}</span>
                      )}
                      <span className={`${styles.badge} ${styles.badgeAge}`}>{listing.minimumAge}+</span>
                    </div>
                  </div>
                  <button
                    className={`${styles.knowMoreBtn} ${isOpen ? styles.knowMoreBtnActive : ''}`}
                    onClick={toggleExpand}
                  >
                    {isOpen ? 'Show Less' : 'Know More'}
                  </button>
                </div>

                {isOpen && (
                  <div className={styles.jobDetails}>
                    <p className={styles.jobDescription}>{listing.description}</p>

                    {listing.scheduleNotes && (
                      <p className={styles.scheduleNote}>{listing.scheduleNotes}</p>
                    )}

                    <div className={styles.detailsGrid}>
                      {listing.responsibilities.length > 0 && (
                        <div className={styles.detailSection}>
                          <h4>What You'll Do</h4>
                          <ul>
                            {listing.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}

                      {listing.qualifications.length > 0 && (
                        <div className={styles.detailSection}>
                          <h4>What We're Looking For</h4>
                          <ul>
                            {listing.qualifications.map((q, i) => <li key={i}>{q}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>

                    {listing.niceToHave.length > 0 && (
                      <div className={styles.detailSection}>
                        <h4>Nice to Have</h4>
                        <div className={styles.niceToHaveList}>
                          {listing.niceToHave.map((n, i) => (
                            <span key={i} className={styles.niceToHaveChip}>{n}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {listing.perks.length > 0 && (
                      <div className={styles.detailSection}>
                        <h4>Perks</h4>
                        <div className={styles.niceToHaveList}>
                          {listing.perks.map((p, i) => (
                            <span key={i} className={styles.perkChip}>{p}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={styles.jobActions}>
                      <Link to={`/careers/apply/${listing.id}`} className={styles.applyBtn}>
                        Apply Now &rarr;
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* Hero */}
        <section className={styles.hero}>
          <span className={styles.tag}>We're Hiring</span>
          <h1>Join the Playfunia Family</h1>
          <p>
            Love working with kids and creating unforgettable experiences? We're looking for enthusiastic, friendly team members to join our indoor playground crew!
          </p>
        </section>

        {/* Why Work Here */}
        <section className={styles.whySection}>
          <h2>Why Work at Playfunia?</h2>
          <div className={styles.perksGrid}>
            {workPerks.map(perk => (
              <div key={perk.title} className={styles.perkCard}>
                <div className={styles.perkIcon}>{perk.icon}</div>
                <h3>{perk.title}</h3>
                <p>{perk.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default CareersPage;
