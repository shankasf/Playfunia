import styles from "./ContactSection.module.css";

export function ContactSection() {
  return (
    <section className={styles.section} id="contact">
      <div className={styles.card}>
        <div className={styles.content}>
          <span className={styles.tag}>Plan your visit</span>
          <h2>Ready to book a party or schedule playtime?</h2>
          <p>
            Share a few details and the Playfunia concierge team will get back within one business day with available
            dates, pricing, or custom party ideas.
          </p>
          <div className={styles.details}>
            <div>
              <strong>Call</strong>
              <a href="tel:+12015395928">+1 (201) 539-5928</a>
            </div>
            <div>
              <strong>Email</strong>
              <a href="mailto:info@playfunia.com">info@playfunia.com</a>
            </div>
            <div>
              <strong>Albany, NY</strong>
              <span>1 Crossgates Mall Rd, Unit N202, Level 2, Near Macy's, Albany, NY 12203</span>
            </div>
          </div>
        </div>
        <form className={styles.form}>
          <label>
            Grown-up name
            <input type="text" placeholder="Alex Rivera" required />
          </label>
          <label>
            Email address
            <input type="email" placeholder="you@email.com" required />
          </label>
          <label>
            Preferred visit date
            <input type="date" />
          </label>
          <label>
            How can we help?
            <textarea rows={4} placeholder="Tell us about your party or play plans" />
          </label>
          <button type="submit">Connect with the Playfunia team</button>
          <p className={styles.formNote}>We'll reach out within one business day. No spam, ever.</p>
        </form>
      </div>
    </section>
  );
}
