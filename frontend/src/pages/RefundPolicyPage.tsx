import styles from './PrivacyPage.module.css';

export function RefundPolicyPage() {
  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Party Booking Refund Policy</h1>
      </div>

      <div className={styles.content}>
        <p>
          Clients may reschedule their event up to 10 calendar days before the scheduled date at no additional charge, subject to availability.
        </p>
        <p>
          If the event is canceled more than 10 calendar days prior to the scheduled date, 75% of the total payment will be refunded. A 25% cancellation fee will be retained to cover administrative and planning costs.
        </p>
        <p>
          Cancellations made within 10 calendar days of the scheduled event will receive a 50% refund.
        </p>
        <p>
          Cancellations made within 72 hours of the scheduled event are non-refundable due to staffing, scheduling, and preparation commitments.
        </p>
        <p>
          <strong>No Show Policy:</strong> If the client does not show up for the event without prior cancellation, no refund will be issued.
        </p>
        <p>
          <strong>Customized Party Packages:</strong> Costs for any custom or special-order items (including themed decorations, balloon garlands, cakes, or character rentals) are non-refundable once confirmed and ordered. These costs will be deducted from any eligible refund amount.
        </p>
        <p>
          By completing a booking, the client acknowledges and agrees to this refund and cancellation policy.
        </p>
      </div>
    </section>
  );
}
