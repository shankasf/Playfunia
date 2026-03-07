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
    let mounted = true;
    let timer1: ReturnType<typeof setTimeout>;
    let timer2: ReturnType<typeof setTimeout>;

    const handleCallback = async () => {
      try {
        // Check for error in URL params (from OAuth or magic link)
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (errorParam) {
          if (mounted) setError(errorDescription || errorParam);
          return;
        }

        // Get the session - Supabase handles the token exchange automatically
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          if (mounted) setError(sessionError.message);
          return;
        }

        if (session) {
          if (mounted) setMessage('Success! Redirecting...');
          // Small delay to show success message
          timer1 = setTimeout(() => {
            if (!mounted) return;
            // Check for redirect parameter in URL
            const rawRedirect = searchParams.get('redirect') || '/account';
            // Validate redirect is a safe relative path (prevent open redirect)
            const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') && !rawRedirect.startsWith('/\\') ? rawRedirect : '/account';
            navigate(redirectTo, { replace: true });
          }, 500);
        } else {
          // No session yet, might be handling a magic link
          // Wait a bit and check again
          if (mounted) setMessage('Verifying...');
          timer2 = setTimeout(async () => {
            if (!mounted) return;
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (!mounted) return;
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
        if (mounted) setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();

    return () => {
      mounted = false;
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
    };
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
