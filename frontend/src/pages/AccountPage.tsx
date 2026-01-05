import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { PrimaryButton } from '../components/common/PrimaryButton';
import { formatDate, formatBirthDate } from '../lib/dateUtils';
import { fetchMyWaivers, type GuardianWaiver } from '../api/waivers';
import styles from './AccountPage.module.css';
import { useAuth } from '../context/AuthContext';

export function AccountPage() {
  const { user, login, register, logout, isLoading, isTeamMember } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
  });
  const [status, setStatus] = useState<{
    type: 'error' | 'success' | null;
    message: string | null;
  }>({
    type: null,
    message: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [latestWaiver, setLatestWaiver] = useState<GuardianWaiver | null>(null);
  const [waiverLoading, setWaiverLoading] = useState(false);
  const redirectTarget = searchParams.get('redirect');
  const safeRedirect = redirectTarget?.startsWith('/') ? redirectTarget : null;

  const loadLatestWaiver = useCallback(async () => {
    if (!user) {
      setLatestWaiver(null);
      return;
    }
    setWaiverLoading(true);
    try {
      const waivers = await fetchMyWaivers();
      setLatestWaiver(waivers[0] ?? null);
    } catch (error) {
      console.warn('Unable to load waiver details', error);
      setLatestWaiver(null);
    } finally {
      setWaiverLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (safeRedirect) {
      navigate(safeRedirect, { replace: true });
      return;
    }
    if (isTeamMember) {
      navigate('/admin', { replace: true });
    }
  }, [user, safeRedirect, isTeamMember, navigate]);

  useEffect(() => {
    if (user) {
      loadLatestWaiver();
    }
  }, [user, loadLatestWaiver]);

  const handleChange =
    (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ type: null, message: null });

    try {
      if (mode === 'login') {
        await login(form.email, form.password);
        setStatus({ type: 'success', message: 'Welcome back!' });
      } else {
        await register({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
        });
        setStatus({ type: 'success', message: 'Account created!' });
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Something went wrong';
      // Make common error messages more user-friendly
      let friendlyMessage = rawMessage;
      if (rawMessage.toLowerCase().includes('invalid email or password')) {
        friendlyMessage = 'Incorrect email or password. Please try again.';
      } else if (rawMessage.toLowerCase().includes('already exists')) {
        friendlyMessage = 'This email is already registered. Please sign in.';
      }
      setStatus({
        type: 'error',
        message: friendlyMessage,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className={styles.center}>Loading your account...</div>;
  }

  if (user) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const initials = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'U';
    const joinedDate = user.createdAt ? new Date(user.createdAt) : null;
    const membershipExpiry = user.membership?.expiresAt ? new Date(user.membership.expiresAt) : null;
    const waiverExpiry = latestWaiver?.expiresAt ? new Date(latestWaiver.expiresAt) : null;

    return (
      <section className={styles.dashboard}>
        {/* Hero Header */}
        <div className={styles.heroHeader}>
          <div className={styles.heroContent}>
            <div className={styles.avatarSection}>
              <div className={styles.avatar}>{initials}</div>
              <div className={styles.userInfo}>
                <h1>Welcome back, {user.firstName}!</h1>
                <p className={styles.userEmail}>{user.email}</p>
              </div>
            </div>
            <button type="button" className={styles.signOutBtn} onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>

        <div className={styles.dashboardContent}>
          {/* Quick Actions */}
          <div className={styles.quickActions}>
            <a href="/buy-ticket" className={styles.actionCard}>
              <div className={styles.actionIcon} data-type="ticket">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
              <span>Buy Tickets</span>
            </a>
            <a href="/book-party" className={styles.actionCard}>
              <div className={styles.actionIcon} data-type="party">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15.5V18a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.5M12 3v12m0 0l-3-3m3 3l3-3M8.5 8.5L12 3l3.5 5.5" />
                </svg>
              </div>
              <span>Book Party</span>
            </a>
            <a href="/waiver" className={styles.actionCard}>
              <div className={styles.actionIcon} data-type="waiver">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span>Waiver</span>
            </a>
            <a href="/membership" className={styles.actionCard}>
              <div className={styles.actionIcon} data-type="membership">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <span>Membership</span>
            </a>
          </div>

          {/* Stats Cards Row */}
          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <div className={styles.statIcon} data-status={user.membership?.tierName ? 'active' : 'inactive'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Membership</span>
                <span className={styles.statValue}>{user.membership?.tierName || 'None'}</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} data-status={user.hasValidWaiver ? 'active' : 'inactive'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Waiver Status</span>
                <span className={styles.statValue}>{user.hasValidWaiver ? 'Valid' : 'Required'}</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} data-status="neutral">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Member Since</span>
                <span className={styles.statValue}>
                  {joinedDate
                    ? joinedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className={styles.twoColumnGrid}>
            {/* Profile Card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Profile Details</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.profileRow}>
                  <span className={styles.profileLabel}>Full Name</span>
                  <span className={styles.profileValue}>{fullName || 'Not provided'}</span>
                </div>
                <div className={styles.profileRow}>
                  <span className={styles.profileLabel}>Email</span>
                  <span className={styles.profileValue}>{user.email}</span>
                </div>
                <div className={styles.profileRow}>
                  <span className={styles.profileLabel}>Phone</span>
                  <span className={styles.profileValue}>{user.phone || 'Not provided'}</span>
                </div>
              </div>
            </div>

            {/* Membership Card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Membership</h2>
                {user.membership?.tierName && (
                  <span className={styles.statusBadge} data-status="active">Active</span>
                )}
              </div>
              <div className={styles.cardBody}>
                {user.membership?.tierName ? (
                  <>
                    <div className={styles.membershipTier}>{user.membership.tierName}</div>
                    <div className={styles.profileRow}>
                      <span className={styles.profileLabel}>Auto-Renewal</span>
                      <span className={styles.profileValue}>
                        {user.membership.autoRenew ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    {typeof user.membership.visitsPerMonth === 'number' &&
                    user.membership.visitsPerMonth > 0 ? (
                      <div className={styles.profileRow}>
                        <span className={styles.profileLabel}>Visits</span>
                        <span className={styles.profileValue}>
                          {user.membership.visitsUsed ?? 0} / {user.membership.visitsPerMonth}
                        </span>
                      </div>
                    ) : (
                      <div className={styles.profileRow}>
                        <span className={styles.profileLabel}>Visits</span>
                        <span className={styles.profileValue}>Unlimited</span>
                      </div>
                    )}
                    {membershipExpiry && (
                      <div className={styles.profileRow}>
                        <span className={styles.profileLabel}>Renews</span>
                        <span className={styles.profileValue}>
                          {membershipExpiry.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <p>No active membership</p>
                    <PrimaryButton to="/membership">View Plans</PrimaryButton>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Waiver Section - Full Width */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Waiver Information</h2>
              {user.hasValidWaiver && (
                <span className={styles.statusBadge} data-status="active">Valid</span>
              )}
            </div>
            <div className={styles.cardBody}>
              {waiverLoading ? (
                <div className={styles.loadingState}>Loading waiver details...</div>
              ) : user.hasValidWaiver && latestWaiver ? (
                <div className={styles.waiverGrid}>
                  <div className={styles.waiverItem}>
                    <span className={styles.waiverItemLabel}>Guardian</span>
                    <span className={styles.waiverItemValue}>
                      {latestWaiver.guardianName || 'Not provided'}
                    </span>
                  </div>
                  <div className={styles.waiverItem}>
                    <span className={styles.waiverItemLabel}>Signed</span>
                    <span className={styles.waiverItemValue}>
                      {latestWaiver.signedAt
                        ? new Date(latestWaiver.signedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Unknown'}
                    </span>
                  </div>
                  <div className={styles.waiverItem}>
                    <span className={styles.waiverItemLabel}>Expires</span>
                    <span className={styles.waiverItemValue}>
                      {waiverExpiry
                        ? waiverExpiry.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'N/A'}
                    </span>
                  </div>
                  <div className={styles.childrenSection}>
                    <span className={styles.waiverItemLabel}>Children Covered</span>
                    {latestWaiver.children?.length ? (
                      <div className={styles.childrenList}>
                        {latestWaiver.children.map((child, index) => (
                          <div key={`${child.name}-${index}`} className={styles.childCard}>
                            <div className={styles.childAvatar}>
                              {child.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className={styles.childInfo}>
                              <span className={styles.childName}>{child.name || 'Unnamed'}</span>
                              {child.birthDate && (
                                <span className={styles.childAge}>
                                  {formatBirthDate(child.birthDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.noChildren}>No children listed</p>
                    )}
                  </div>
                  <div className={styles.waiverAction}>
                    <PrimaryButton to="/waiver">Update Waiver</PrimaryButton>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <p>No valid waiver on file</p>
                  <p className={styles.emptyStateHint}>Complete a waiver before your visit</p>
                  <PrimaryButton to="/waiver">Complete Waiver</PrimaryButton>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.loginCard}>
        <div className={styles.switcher}>
          <button
            className={mode === 'login' ? styles.activeTab : styles.tab}
            onClick={() => setMode('login')}
            type="button"
          >
            Sign in
          </button>
          <button
            className={mode === 'register' ? styles.activeTab : styles.tab}
            onClick={() => setMode('register')}
            type="button"
          >
            Create account
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className={styles.grid}>
              <label>
                First name
                <input
                  value={form.firstName}
                  onChange={handleChange('firstName')}
                  required
                  autoComplete="given-name"
                />
              </label>
              <label>
                Last name
                <input
                  value={form.lastName}
                  onChange={handleChange('lastName')}
                  required
                  autoComplete="family-name"
                />
              </label>
            </div>
          )}

          <label>
            Email address
            <input
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              required
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={handleChange('password')}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (
            <label>
              Phone (optional)
              <input value={form.phone} onChange={handleChange('phone')} autoComplete="tel" />
            </label>
          )}

          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </PrimaryButton>

          {status.message ? (
            <p className={status.type === 'error' ? styles.error : styles.success}>
              {status.message}
            </p>
          ) : null}
        </form>

        <p className={styles.helperText}>
          By creating an account you agree to our <a href="/terms">Terms</a> and{' '}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </div>
    </section>
  );
}
