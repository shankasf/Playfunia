import styles from './PrivacyPage.module.css';

export function RefundPolicyPage() {
  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Party Booking Refund Policy</h1>
      </div>

      <div className={styles.content}>
        <h2>Rescheduling</h2>
        <p>
          Clients may reschedule their event up to <strong>10 calendar days</strong> before the scheduled date at no additional charge, subject to availability.
        </p>

        <h2>Cancellation &amp; Refunds</h2>
        <ul>
          <li>
            If the event is canceled <strong>more than 10 calendar days</strong> prior to the scheduled date, <strong>75%</strong> of the total payment will be refunded. A <strong>25% cancellation fee</strong> will be retained to cover administrative and planning costs.
          </li>
          <li>
            Cancellations made <strong>within 10 calendar days</strong> of the scheduled event will receive a <strong>50% refund</strong>.
          </li>
          <li>
            Cancellations made <strong>within 72 hours</strong> of the scheduled event are <strong>non-refundable</strong> due to staffing, scheduling, and preparation commitments.
          </li>
        </ul>

        <h2>No Show Policy</h2>
        <p>
          If the client does not show up for the event without prior cancellation, <strong>no refund will be issued</strong>.
        </p>

        <h2>Customized Party Packages</h2>
        <p>
          Costs for any custom or special-order items (including themed decorations, balloon garlands, cakes, or character rentals) are <strong>non-refundable once confirmed and ordered</strong>. These costs will be deducted from any eligible refund amount.
        </p>

        <div className={styles.agreement}>
          <p>
            By completing a booking, the client acknowledges and agrees to this refund and cancellation policy.
          </p>
        </div>
      </div>
    </section>
  );
}
