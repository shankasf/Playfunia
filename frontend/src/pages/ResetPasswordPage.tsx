import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import styles from './AuthCallbackPage.module.css';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if we have a valid recovery session from the URL hash
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');

    if (type === 'recovery' && accessToken) {
      // Supabase will automatically handle the session from the URL
      setLoading(false);
    } else {
      // Check if there's already a session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setLoading(false);
        } else {
          setError('Invalid or expired reset link. Please request a new password reset.');
          setLoading(false);
        }
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setUpdating(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/account', { replace: true });
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.spinner}></div>
          <p className={styles.message}>Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h2 className={styles.title}>Password Updated!</h2>
          <p className={styles.message}>Redirecting to your account...</p>
        </div>
      </div>
    );
  }

  if (error && !password) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.errorIcon}>!</div>
          <h2 className={styles.title}>Reset Error</h2>
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
        <h2 className={styles.title}>Set New Password</h2>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
              }}
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
              }}
            />
          </div>
          {error && (
            <p style={{ color: '#dc2626', margin: 0, fontSize: '0.9rem' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={updating}
            style={{
              background: '#c44569',
              color: 'white',
              border: 'none',
              padding: '0.875rem 1.5rem',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: updating ? 'not-allowed' : 'pointer',
              opacity: updating ? 0.7 : 1,
            }}
          >
            {updating ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
