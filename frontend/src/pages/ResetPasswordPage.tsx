import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthCallbackPage.module.css';

export function ResetPasswordPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to account page with forgot-password mode after a short delay
    const timer = setTimeout(() => {
      navigate('/account', { replace: true });
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className={styles.title}>Reset Your Password</h2>
        <p className={styles.message}>
          To reset your password, please use the "Forgot password?" link on the sign-in page.
        </p>
        <p className={styles.message} style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#6b7280' }}>
          Redirecting you there now...
        </p>
        <a
          href="/account"
          className={styles.link}
          style={{ marginTop: '1rem' }}
        >
          Go to Sign In
        </a>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
