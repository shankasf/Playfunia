import { useAuth } from "../../context/AuthContext";
import { PrimaryButton } from "../common/PrimaryButton";
import styles from "./HeroSection.module.css";

const heroImage = "/images/hero-ballpit-logo.jpg";

export function HeroSection() {
  const { user } = useAuth();
  const greeting = user
    ? `Hey ${user.firstName}, ready for more Playfunia adventures?`
    : "Playfunia - indoor playgrounds designed for families";

  return (
    <section className={styles.hero} id="hero">
      <div className={styles.imagePanel} style={{ backgroundImage: `url(${heroImage})` }} />
      <div className={styles.content}>
        <span className={styles.tag}>{greeting}</span>
        <h1>The most fun indoor playground experience for kids ages 1-13.</h1>
        <p>
          From trampolines and slides to private party rooms, Playfunia makes every visit full of movement, laughter,
          and stress-free memories for parents. Enjoy unlimited play with every admission — and when it's time to celebrate,
          reserve a 2-hour party room and let our hosts handle the smiles and clean-up.
        </p>
        <p className={styles.note}>Grip socks required for play (available on-site for $3).</p>
        <div className={styles.actions}>
          <PrimaryButton to="/book-party">Book a Party</PrimaryButton>
          <PrimaryButton to="/buy-ticket" className={styles.secondaryButton}>
            Buy Tickets
          </PrimaryButton>
          <PrimaryButton to="/membership" className={styles.tertiaryButton}>
            Become a Member
          </PrimaryButton>
        </div>
        <div className={styles.metrics}>
          <div className={styles.metricCard}>
            <strong>2</strong>
            <span>Mall locations (NY & NJ)</span>
          </div>
          <div className={styles.metricCard}>
            <strong>1-13</strong>
            <span>Age range we welcome</span>
          </div>
          <div className={styles.metricCard}>
            <strong>3</strong>
            <span>Party packages to choose</span>
          </div>
        </div>
      </div>
    </section>
  );
}
