import styles from './PrivacyPage.module.css';

export function SmsTermsPage() {
  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>SMS Terms &amp; Conditions</h1>
        <p>Last updated: November 1, 2026</p>
      </div>

      <div className={styles.content}>
        <h2>Program Description</h2>
        <p>
          The <strong>Playfunia</strong> SMS program (operated by Real International LLC, doing business as Playfunia, at Crossgates Mall, Albany, NY) sends transactional text messages to customers who have opted in, and marketing text messages to customers who separately opt in to marketing. By providing your mobile phone number and agreeing to receive messages, you consent to receive SMS text messages from Playfunia. Customer messages may include: party booking confirmations with reference numbers, ticket purchase codes for facility entry, waiver signing confirmations, membership activation and expiry alerts, and booking reminders. Marketing messages may include promotions, party offers, and event announcements, and are sent up to 4 times per month only to customers who tick the optional marketing text message box on the waiver at playfunia.com.
        </p>
        <p>
          <strong>Sample messages:</strong>
        </p>
        <ul>
          <li>"Playfunia: Your party booking #PF12345 for Sat 4/25 at 2:00 PM is confirmed. Reply HELP for help, STOP to cancel."</li>
          <li>"Playfunia: Your ticket entry code is 87321. Show this at the door. Reply HELP for help, STOP to cancel."</li>
        </ul>

        <h2>How to Opt In</h2>
        <p>
          You opt in to receive transactional messages by entering your mobile number and ticking the separate, unticked checkbox when you create an account, check out, book a party, or sign a waiver on <a href="https://playfunia.com">playfunia.com</a>. The checkbox reads &quot;By providing your phone number and checking this box, you consent to receive transactional text messages from Playfunia (e.g., booking confirmations, ticket codes, membership alerts, waiver confirmations, and reminders). Consent is not a condition of purchase. Msg &amp; data rates may apply. Msg frequency varies. Reply HELP for help, STOP to unsubscribe at any time.&quot; You may also give verbal consent when booking in person at our facility, for booking messages only. Marketing text messages require a separate, optional opt-in (<a href="/sms-opt-in">see how to opt in</a>): an unticked box on the waiver form reading &quot;Optional: Yes, send me marketing text messages from Playfunia about promotions, offers, and events, sent using automated technology to the phone number provided. Consent is not a condition of purchase or participation. Msg &amp; data rates may apply. Up to 4 marketing msgs per month. Reply HELP for help, STOP to unsubscribe.&quot; Consent to receive SMS messages is not a condition of any purchase.
        </p>

        <h2>Message Frequency</h2>
        <p>
          Message frequency varies based on your activity and account events (typically up to 10 messages per month). You should expect messages only when triggered by your actions (e.g., booking a party, buying tickets, signing a waiver) or by automated system events related to your account.
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
          <li>Address: Playfunia (Real International LLC), Crossgates Mall, Albany, NY</li>
        </ul>
      </div>
    </section>
  );
}
