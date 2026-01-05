import { sampleSocialPosts } from "../../data/sampleData";
import styles from "./SocialHighlights.module.css";

export function SocialHighlights() {
  return (
    <section className={styles.section} aria-labelledby="social-heading">
      <div className={styles.header}>
        <span className={styles.tag}>See the smiles</span>
        <h2 id="social-heading">Snapshots from our Instagram feed</h2>
        <p>Catch the latest parties, STEM workshops, and toddler giggles in real time.</p>
      </div>
      <div className={styles.grid}>
        {sampleSocialPosts.map(post => (
          <a key={post.id} className={styles.card} href={post.link} target="_blank" rel="noreferrer">
            <div className={styles.image} style={{ backgroundImage: `url(${post.imageUrl})` }} aria-hidden="true" />
            <p>{post.caption}</p>
          </a>
        ))}
      </div>
    </section>
  );
}