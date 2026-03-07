/**
 * Countdown Timer Component
 *
 * Displays a countdown timer for slot reservations during checkout.
 * Shows minutes:seconds format with visual warning when time is running low.
 */

import { useEffect, useState, useCallback } from 'react';
import styles from './CountdownTimer.module.css';

interface CountdownTimerProps {
  /** ISO timestamp when the reservation expires */
  expiresAt: string;
  /** Callback when timer reaches zero */
  onExpire: () => void;
  /** Optional: Show warning styling when less than this many seconds remain (default: 60) */
  warningThreshold?: number;
  /** Optional: Custom label (default: "Time remaining") */
  label?: string;
}

export function CountdownTimer({
  expiresAt,
  onExpire,
  warningThreshold = 60,
  label = 'Time remaining',
}: CountdownTimerProps) {
  const calculateTimeRemaining = useCallback(() => {
    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();
    return Math.max(0, expiryTime - now);
  }, [expiresAt]);

  const [timeRemaining, setTimeRemaining] = useState(calculateTimeRemaining);

  useEffect(() => {
    // Update immediately when expiresAt changes
    setTimeRemaining(calculateTimeRemaining());

    // Set up interval for countdown
    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire, calculateTimeRemaining]);

  // Calculate minutes and seconds
  const totalSeconds = Math.ceil(timeRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // Determine styling based on time remaining
  const isWarning = totalSeconds <= warningThreshold && totalSeconds > 0;
  const isExpired = totalSeconds === 0;

  if (isExpired) {
    return (
      <div className={`${styles.timerContainer} ${styles.expired}`}>
        <span className={styles.icon}>⏱️</span>
        <span className={styles.label}>Session expired</span>
      </div>
    );
  }

  return (
    <div className={`${styles.timerContainer} ${isWarning ? styles.warning : ''}`}>
      <span className={styles.icon}>⏱️</span>
      <span className={styles.label}>{label}:</span>
      <span className={styles.time}>
        {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
      {isWarning && <span className={styles.hurryText}>Complete your payment soon!</span>}
    </div>
  );
}

export default CountdownTimer;
