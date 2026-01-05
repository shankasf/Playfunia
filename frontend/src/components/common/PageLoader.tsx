import styles from "./PageLoader.module.css";

export function PageLoader() {
  return (
    <div className={styles.loader}>
      <div className={styles.spinner}>
        <div className={styles.dot} />
        <div className={styles.dot} />
        <div className={styles.dot} />
      </div>
      <p className={styles.text}>Loading...</p>
    </div>
  );
}
