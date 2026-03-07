import styles from './PrivacyPage.module.css';

export function GuestPolicyPage() {
  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Guest Policy</h1>
      </div>

      <div className={styles.content}>
        <p>
          The client agrees to pay for any additional guests or services not included in the original package. If the number of children or adults attending the event exceeds the amount specified in the selected package, the client understands that additional charges will apply. These charges will be calculated and invoiced after the conclusion of the party.
        </p>
      </div>
    </section>
  );
}
