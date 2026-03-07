import { useState, FormEvent } from "react";
import { apiPost } from "../../api/client";
import {
  formatNameInput,
  isValidName,
  isValidEmail,
} from "../../utils/validation";
import styles from "./ContactSection.module.css";

export function ContactSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string | null }>({
    type: null,
    message: null,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus({ type: null, message: null });

    // Validation
    if (!name.trim()) {
      setStatus({ type: "error", message: "Please enter your name." });
      return;
    }
    if (!isValidName(name)) {
      setStatus({ type: "error", message: "Name can only contain letters, spaces, hyphens, and apostrophes." });
      return;
    }
    if (!email.trim()) {
      setStatus({ type: "error", message: "Please enter your email address." });
      return;
    }
    if (!isValidEmail(email)) {
      setStatus({ type: "error", message: "Please enter a valid email address." });
      return;
    }

    setSubmitting(true);
    try {
      await apiPost("/contact", {
        name: name.trim(),
        email: email.trim(),
        preferredDate: preferredDate || undefined,
        message: message.trim() || undefined,
      });
      setStatus({ type: "success", message: "Thank you! We'll get back to you within one business day." });
      // Reset form
      setName("");
      setEmail("");
      setPreferredDate("");
      setMessage("");
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to send message. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

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
              <a href="mailto:playfunia@playfunia.com">playfunia@playfunia.com</a>
            </div>
            <div>
              <strong>Albany, NY</strong>
              <span>1 Crossgates Mall Rd, Unit N202, Level 2, Near Macy's, Albany, NY 12203</span>
            </div>
          </div>
        </div>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            Grown-up name
            <input
              type="text"
              placeholder="Alex Rivera"
              value={name}
              onChange={(e) => setName(formatNameInput(e.target.value))}
              required
              maxLength={100}
              pattern="[A-Za-zÀ-ÿ\s'\-]+"
              title="Letters, spaces, hyphens, and apostrophes only"
              autoComplete="name"
            />
          </label>
          <label>
            Email address
            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              required
              maxLength={255}
              autoComplete="email"
            />
          </label>
          <label>
            Preferred visit date
            <input
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label>
            How can we help?
            <textarea
              rows={4}
              placeholder="Tell us about your party or play plans"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
            />
          </label>
          {status.type === "error" && <p className={styles.formError}>{status.message}</p>}
          {status.type === "success" && <p className={styles.formSuccess}>{status.message}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Sending..." : "Connect with the Playfunia team"}
          </button>
          <p className={styles.formNote}>We'll reach out within one business day. Please check your spam folder as well.</p>
        </form>
      </div>
    </section>
  );
}
