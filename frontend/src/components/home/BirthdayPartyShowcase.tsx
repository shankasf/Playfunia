import { LazyImage } from "../common/LazyImage";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./BirthdayPartyShowcase.module.css";

const partyImages = [
  {
    id: 1,
    src: "/images/playground/party/party-celebration.jpg",
    title: "Celebrate Together",
    description: "Kids wearing party hats enjoying the celebration",
  },
  {
    id: 2,
    src: "/images/playground/party/party-balloons.jpg",
    title: "Balloons & Smiles",
    description: "Star balloons and happy faces everywhere",
  },
  {
    id: 3,
    src: "/images/playground/party/party-cake.jpg",
    title: "Sweet Moments",
    description: "Beautiful cakes and colorful decorations",
  },
];

export function BirthdayPartyShowcase() {
  return (
    <section className={styles.section} aria-labelledby="party-heading">
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.tag}>Birthday Parties</span>
          <h2 id="party-heading">Celebrate at Playfunia</h2>
          <p>Make your child's birthday unforgettable with our party packages</p>
        </div>
        <div className={styles.grid}>
          {partyImages.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.imageWrapper}>
                <LazyImage
                  src={item.src}
                  alt={item.title}
                  aspectRatio="4/3"
                  placeholderColor="#ffe0ec"
                />
                <div className={styles.badge}>Party Time!</div>
              </div>
              <div className={styles.cardContent}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
        <div className={styles.cta}>
          <PrimaryButton to="/book-party">Book a Party</PrimaryButton>
          <PrimaryButton to="/parties" className={styles.secondaryBtn}>
            View Packages
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
