import { Link } from 'react-router-dom';

import styles from './PrivacyPage.module.css';

export function SmsOptInPage() {
  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>How to Opt In to Playfunia Text Messages</h1>
        <p>Last updated: November 1, 2026</p>
      </div>

      <div className={styles.content}>
        <p>
          Playfunia (operated by Real International LLC), an indoor play and party venue at Crossgates Mall, Albany, NY, sends text messages only to people who opt in. Each checkbox below starts unticked, and neither is required to book, buy tickets, or sign a waiver.
        </p>

        <h2>Marketing text messages</h2>
        <ol>
          <li>Go to <Link to="/waiver">playfunia.com/waiver</Link>.</li>
          <li>Enter your email or phone number. The two consent checkboxes below appear directly under that field; tick the optional marketing box if you want marketing texts, then select Continue to open the waiver form.</li>
          <li>Enter your mobile number in the form.</li>
          <li>In the Agreements section, the same optional checkbox appears again; make sure it is ticked, then sign the waiver:</li>
        </ol>
        <label>
          <input type="checkbox" disabled />{' '}
          Optional: Yes, send me marketing text messages from Playfunia about promotions, offers, and events, sent using automated technology to the phone number provided. Consent is not a condition of purchase or participation. Msg &amp; data rates may apply. Up to 4 marketing msgs per month. Reply HELP for help, STOP to unsubscribe. <Link to="/privacy">Privacy Policy</Link> &amp; <Link to="/sms-terms">SMS Terms</Link>.
        </label>
        <p>The checkbox on the live waiver form:</p>
        <img
          src="/images/sms-opt-in-waiver.png"
          alt="Agreements section of the Playfunia waiver form showing the unticked optional marketing text message checkbox"
          style={{ maxWidth: '100%', height: 'auto' }}
        />

        <h2>Transactional text messages</h2>
        <p>
          When you create an account, check out, book a party, or sign a waiver on playfunia.com, you can enter your phone number and tick this separate checkbox:
        </p>
        <label>
          <input type="checkbox" disabled />{' '}
          By providing your phone number and checking this box, you consent to receive transactional text messages from Playfunia (e.g., booking confirmations, ticket codes, membership alerts, waiver confirmations, and reminders). Consent is not a condition of purchase. Msg &amp; data rates may apply. Msg frequency varies. Reply HELP for help, STOP to unsubscribe at any time. <Link to="/privacy">Privacy Policy</Link> &amp; <Link to="/waiver-policy">Terms</Link>.
        </label>

        <h2>Example messages</h2>
        <ul>
          <li>Marketing: "Playfunia: Trick or Treat + Costume Contest Sat 10/31, 3-6PM! Win surprise gifts: https://instagram.com/p/DenPdsLuE-A Reply STOP to opt out."</li>
          <li>Transactional: "Playfunia Tickets! Hi [Name], your tickets: [Ticket Type] x[Qty]. Your entry codes: [Code1], [Code2]. Show these at the front desk on arrival. Reply STOP to opt out."</li>
        </ul>

        <h2>Help and opting out</h2>
        <p>
          Reply <strong>STOP</strong> to any message to unsubscribe, or <strong>HELP</strong> for help. You can also email <a href="mailto:info@playfunia.com">info@playfunia.com</a>. No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. See our <Link to="/sms-terms">SMS Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </section>
  );
}
