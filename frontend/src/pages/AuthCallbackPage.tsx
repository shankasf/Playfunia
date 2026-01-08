import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import styles from './AuthCallbackPage.module.css';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('Completing sign in...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for error in URL params (from OAuth or magic link)
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (errorParam) {
          setError(errorDescription || errorParam);
          return;
        }

        // Get the session - Supabase handles the token exchange automatically
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        if (session) {
          setMessage('Success! Redirecting...');
          // Small delay to show success message
          setTimeout(() => {
            // Check for redirect parameter in URL
            const redirectTo = searchParams.get('redirect') || '/account';
            navigate(redirectTo, { replace: true });
          }, 500);
        } else {
          // No session yet, might be handling a magic link
          // Wait a bit and check again
          setMessage('Verifying...');
          setTimeout(async () => {
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (retrySession) {
              navigate('/account', { replace: true });
            } else {
              // Still no session, redirect to login
              navigate('/account', { replace: true });
            }
          }, 1000);
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.errorIcon}>!</div>
          <h2 className={styles.title}>Authentication Error</h2>
          <p className={styles.message}>{error}</p>
          <a href="/account" className={styles.link}>
            Return to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.spinner}></div>
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
}

export default AuthCallbackPage;
