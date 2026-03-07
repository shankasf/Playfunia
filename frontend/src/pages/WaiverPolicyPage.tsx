import styles from './PrivacyPage.module.css';

export function WaiverPolicyPage() {
  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Waiver Policy</h1>
      </div>

      <div className={styles.content}>
        <p>
          All children attending the event must have a waiver signed by their parent or legal guardian prior to participating in any activities. It is the responsibility of the client to ensure that all waivers are completed and submitted before the start of the event. Children without a signed waiver will not be permitted to participate in any activities.
        </p>
      </div>
    </section>
  );
}
