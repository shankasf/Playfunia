import { samplePastEvents } from "../../data/sampleData";
import styles from "./PastEventsGallery.module.css";

export function PastEventsGallery() {
  return (
    <section className={styles.section} aria-labelledby="past-events-heading">
      <div className={styles.header}>
        <span className={styles.tag}>Previous highlights</span>
        <h2 id="past-events-heading">Take a look at recent Playfunia events</h2>
        <p>We love capturing the smiles—here are just a few favorite moments from recent celebrations.</p>
      </div>
      <div className={styles.grid}>
        {samplePastEvents.map(event => (
          <figure key={event.id} className={styles.card}>
            <div className={styles.image} style={{ backgroundImage: `url(${event.imageUrl})` }} aria-hidden="true" />
            <figcaption>
              <h3>{event.title}</h3>
              <p>{event.description}</p>
              <span>{event.date}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}