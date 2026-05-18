import styles from './PrivacyPage.module.css';

export function SmsTermsPage() {
  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>SMS Terms &amp; Conditions</h1>
        <p>Last updated: April 17, 2026</p>
      </div>

      <div className={styles.content}>
        <h2>Program Description</h2>
        <p>
          The <strong>Playfunia</strong> SMS program (operated by Playfunia at Crossgates Mall, Albany, NY) sends transactional and operational text messages to customers and employees who have opted in. By providing your mobile phone number and agreeing to receive messages, you consent to receive SMS text messages from Playfunia. Customer messages may include: party booking confirmations with reference numbers, ticket purchase codes for facility entry, waiver signing confirmations, membership activation and expiry alerts, and booking reminders. Employee messages may include: work schedule assignments, task assignment alerts, and clock-in/out reminders. We do <strong>not</strong> send marketing or promotional content through this program.
        </p>
        <p>
          <strong>Sample messages:</strong>
        </p>
        <ul>
          <li>"Playfunia: Your party booking #PF12345 for Sat 4/25 at 2:00 PM is confirmed. Reply HELP for help, STOP to cancel."</li>
          <li>"Playfunia: Your ticket entry code is 87321. Show this at the door. Reply HELP for help, STOP to cancel."</li>
          <li>"Playfunia: Reminder — your shift starts tomorrow at 9:00 AM. Reply HELP for help, STOP to cancel."</li>
        </ul>

        <h2>How to Opt In</h2>
        <p>
          You opt in to receive messages by submitting your mobile number during a booking, ticket purchase, waiver signing, membership sign-up, or employee onboarding on <a href="https://playfunia.com">playfunia.com</a>, or by providing your number directly to a Playfunia representative. Consent to receive SMS messages is not a condition of any purchase.
        </p>

        <h2>Message Frequency</h2>
        <p>
          Message frequency varies based on your activity and account events (typically up to 10 messages per month for customers, and up to 30 messages per month for employees during active work periods). You should expect messages only when triggered by your actions (e.g., booking a party, buying tickets, signing a waiver) or by automated system events related to your account or employment.
        </p>

        <h2>Message and Data Rates</h2>
        <p>
          <strong>Message and data rates may apply.</strong> Your mobile carrier's standard messaging, data, and other rates and fees will apply to any messages sent to you from Playfunia and to any messages you send to us. Please contact your wireless provider for details on your messaging plan.
        </p>

        <h2>How to Opt Out (STOP)</h2>
        <p>
          You can cancel the SMS service at any time. Reply <strong>STOP</strong> to any message you receive from us. After you send the SMS message <strong>STOP</strong>, we will send you an SMS message to confirm that you have been unsubscribed. After this, you will no longer receive SMS messages from us. If you want to join again, sign up as you did the first time and we will start sending SMS messages to you again.
        </p>

        <h2>Help (HELP)</h2>
        <p>
          If you are experiencing issues with the messaging program you can reply with the keyword <strong>HELP</strong> for more assistance, or you can get help directly by emailing <a href="mailto:info@playfunia.com">info@playfunia.com</a> or calling the venue.
        </p>

        <h2>Supported Carriers</h2>
        <p>
          Carriers are not liable for delayed or undelivered messages. Supported carriers include AT&amp;T, T-Mobile, Verizon Wireless, Sprint, Boost, U.S. Cellular, MetroPCS, and other major and minor carriers. T-Mobile is not liable for delayed or undelivered messages.
        </p>

        <h2>Privacy</h2>
        <p>
          We respect your privacy. Information collected through this SMS program will be used in accordance with our <a href="/privacy">Privacy Policy</a>. <strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</strong> All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties. Information sharing to subcontractors in support services, such as customer service or message delivery (e.g., our SMS provider), is permitted solely to operate the program.
        </p>

        <h2>Changes to These Terms</h2>
        <p>
          We reserve the right to change or terminate our SMS messaging program at any time. Any material changes to these SMS Terms &amp; Conditions will be posted on this page with an updated effective date.
        </p>

        <h2>Contact Us</h2>
        <p>
          If you have any questions about these SMS Terms &amp; Conditions, please contact us:
        </p>
        <ul>
          <li>Email: <a href="mailto:info@playfunia.com">info@playfunia.com</a></li>
          <li>Website: <a href="https://playfunia.com/contact">playfunia.com/contact</a></li>
          <li>Address: Playfunia, Crossgates Mall, Albany, NY</li>
        </ul>
      </div>
    </section>
  );
}
