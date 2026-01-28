import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { PrimaryButton } from '../components/common/PrimaryButton';
import { formatDate, formatBirthDate } from '../lib/dateUtils';
import { fetchMyWaivers, type GuardianWaiver } from '../api/waivers';
import {
  formatNameInput,
  formatPhoneInput,
  isValidName,
  isValidEmail,
  isValidPhone,
} from '../utils/validation';
import {
  fetchMyBookings,
  fetchMyTickets,
  cancelMyBooking,
  rescheduleMyBooking,
  fetchBookingSlots,
  type CustomerBooking,
  type CustomerTicket,
  type BookingSlot,
} from '../api/bookings';
import styles from './AccountPage.module.css';
import { useAuth } from '../context/AuthContext';

export function AccountPage() {
  const {
    user,
    signInWithEmail,
    signUpWithEmail,
    verifyRegistrationOTP,
    signInWithGoogle,
    signUpWithGoogle,
    signInWithMagicLink,
    sendPasswordResetOTP,
    resetPasswordWithOTP,
    logout,
    isLoading,
    isTeamMember,
    authError,
    clearAuthError,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register' | 'magic-link' | 'forgot-password'>('login');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
  });
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [registerStep, setRegisterStep] = useState<'form' | 'otp'>('form');
  const [registerOtp, setRegisterOtp] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetStep, setResetStep] = useState<'email' | 'otp' | 'password' | 'done'>('email');
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
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState<{
    open: boolean;
    booking: CustomerBooking | null;
    selectedDate: string;
    selectedTime: string;
    slots: BookingSlot[];
    slotsLoading: boolean;
    submitting: boolean;
    error: string | null;
  }>({
    open: false,
    booking: null,
    selectedDate: '',
    selectedTime: '',
    slots: [],
    slotsLoading: false,
    submitting: false,
    error: null,
  });
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
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

  const loadBookings = useCallback(async () => {
    if (!user) {
      setBookings([]);
      return;
    }
    setBookingsLoading(true);
    try {
      const data = await fetchMyBookings();
      setBookings(data);
    } catch (error) {
      console.warn('Unable to load bookings', error);
      setBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }, [user]);

  const loadTickets = useCallback(async () => {
    if (!user) {
      setTickets([]);
      return;
    }
    setTicketsLoading(true);
    try {
      const data = await fetchMyTickets();
      setTickets(data);
    } catch (error) {
      console.warn('Unable to load tickets', error);
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, [user]);

  const handleCancelBooking = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    setCancellingBookingId(bookingId);
    try {
      await cancelMyBooking(bookingId);
      await loadBookings();
    } catch (error) {
      console.error('Failed to cancel booking', error);
      alert('Failed to cancel booking. Please try again.');
    } finally {
      setCancellingBookingId(null);
    }
  };

  const openRescheduleModal = (booking: CustomerBooking) => {
    setRescheduleModal({
      open: true,
      booking,
      selectedDate: '',
      selectedTime: '',
      slots: [],
      slotsLoading: false,
      submitting: false,
      error: null,
    });
  };

  const closeRescheduleModal = () => {
    setRescheduleModal({
      open: false,
      booking: null,
      selectedDate: '',
      selectedTime: '',
      slots: [],
      slotsLoading: false,
      submitting: false,
      error: null,
    });
  };

  const handleRescheduleDateChange = async (date: string) => {
    if (!rescheduleModal.booking) return;
    setRescheduleModal((prev) => ({
      ...prev,
      selectedDate: date,
      selectedTime: '',
      slotsLoading: true,
      error: null,
    }));
    try {
      const response = await fetchBookingSlots({
        location: rescheduleModal.booking.location,
        eventDate: date,
      });
      setRescheduleModal((prev) => ({
        ...prev,
        slots: response.slots,
        slotsLoading: false,
      }));
    } catch (error) {
      console.error('Failed to load slots', error);
      setRescheduleModal((prev) => ({
        ...prev,
        slots: [],
        slotsLoading: false,
        error: 'Failed to load available times.',
      }));
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleModal.booking || !rescheduleModal.selectedDate || !rescheduleModal.selectedTime) {
      return;
    }
    setRescheduleModal((prev) => ({ ...prev, submitting: true, error: null }));
    try {
      await rescheduleMyBooking(
        rescheduleModal.booking.id,
        rescheduleModal.selectedDate,
        rescheduleModal.selectedTime
      );
      closeRescheduleModal();
      await loadBookings();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reschedule booking.';
      setRescheduleModal((prev) => ({ ...prev, submitting: false, error: message }));
    }
  };

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
      loadBookings();
      loadTickets();
    }
  }, [user, loadLatestWaiver, loadBookings, loadTickets]);

  // Reset registration state when user logs out
  useEffect(() => {
    if (!user && !isLoading) {
      setRegisterStep('form');
      setRegisterOtp('');
      setResetStep('email');
      setResetOtp('');
      setResetSent(false);
      setMagicLinkSent(false);
      setStatus({ type: null, message: null });
    }
  }, [user, isLoading]);

  // Show auth error from context (e.g., when Google sign-in fails for new user)
  useEffect(() => {
    if (authError) {
      setStatus({ type: 'error', message: authError });
      setSubmitting(false);
      // Clear the auth error after showing it
      clearAuthError();
    }
  }, [authError, clearAuthError]);

  const handleChange =
    (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
      let value = event.target.value;
      // Apply formatting for specific fields
      if (field === 'firstName' || field === 'lastName') {
        value = formatNameInput(value);
      } else if (field === 'phone') {
        value = formatPhoneInput(value);
      }
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ type: null, message: null });

    try {
      if (mode === 'login') {
        // Validate email format
        if (!isValidEmail(form.email)) {
          setStatus({ type: 'error', message: 'Please enter a valid email address.' });
          return;
        }
        await signInWithEmail(form.email, form.password);
        setStatus({ type: 'success', message: 'Welcome back!' });
      } else if (mode === 'register') {
        if (registerStep === 'form') {
          // Validate all registration fields
          if (!form.firstName.trim()) {
            setStatus({ type: 'error', message: 'First name is required.' });
            return;
          }
          if (!isValidName(form.firstName)) {
            setStatus({ type: 'error', message: 'First name can only contain letters, spaces, hyphens, and apostrophes.' });
            return;
          }
          if (!form.lastName.trim()) {
            setStatus({ type: 'error', message: 'Last name is required.' });
            return;
          }
          if (!isValidName(form.lastName)) {
            setStatus({ type: 'error', message: 'Last name can only contain letters, spaces, hyphens, and apostrophes.' });
            return;
          }
          if (!isValidEmail(form.email)) {
            setStatus({ type: 'error', message: 'Please enter a valid email address.' });
            return;
          }
          if (form.password.length < 8) {
            setStatus({ type: 'error', message: 'Password must be at least 8 characters.' });
            return;
          }
          if (form.phone && !isValidPhone(form.phone)) {
            setStatus({ type: 'error', message: 'Please enter a valid 10-digit phone number.' });
            return;
          }
          // Step 1: Submit registration form, send OTP
          const result = await signUpWithEmail({
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            password: form.password,
            phone: form.phone || undefined,
          });
          if (result.requiresVerification) {
            setRegisterStep('otp');
            setStatus({ type: 'success', message: 'Verification code sent to your email.' });
          }
        } else if (registerStep === 'otp') {
          // Step 2: Verify OTP, create account, and sign in
          if (registerOtp.length !== 6) {
            setStatus({ type: 'error', message: 'Please enter the 6-digit code.' });
            return;
          }
          const result = await verifyRegistrationOTP(form.email, registerOtp, form.password);
          if (result.success) {
            if (result.needsSignIn) {
              // Account created but needs manual sign in
              setMode('login');
              setRegisterStep('form');
              setRegisterOtp('');
              setStatus({ type: 'success', message: 'Account created! Please sign in with your credentials.' });
            } else {
              // Successfully signed in - will redirect via useEffect
              setStatus({ type: 'success', message: 'Account created successfully! Welcome!' });
            }
          } else {
            setStatus({ type: 'error', message: result.message });
          }
        }
      } else if (mode === 'magic-link') {
        if (!isValidEmail(form.email)) {
          setStatus({ type: 'error', message: 'Please enter a valid email address.' });
          return;
        }
        const result = await signInWithMagicLink(form.email.trim());
        if (result.success) {
          setMagicLinkSent(true);
          setStatus({ type: 'success', message: result.message });
        } else {
          setStatus({ type: 'error', message: result.message });
        }
      } else if (mode === 'forgot-password') {
        if (resetStep === 'email') {
          if (!isValidEmail(form.email)) {
            setStatus({ type: 'error', message: 'Please enter a valid email address.' });
            return;
          }
          // Step 1: Send OTP to email
          const result = await sendPasswordResetOTP(form.email.trim());
          if (result.success) {
            setResetStep('otp');
            setStatus({ type: 'success', message: 'Verification code sent to your email.' });
          } else {
            setStatus({ type: 'error', message: result.message });
          }
        } else if (resetStep === 'otp') {
          // Step 2: Verify OTP - move to password step
          if (resetOtp.length !== 6) {
            setStatus({ type: 'error', message: 'Please enter the 6-digit code.' });
            return;
          }
          setResetStep('password');
          setStatus({ type: null, message: null });
        } else if (resetStep === 'password') {
          // Step 3: Reset password with OTP
          if (newPassword.length < 8) {
            setStatus({ type: 'error', message: 'Password must be at least 8 characters.' });
            return;
          }
          if (newPassword !== confirmNewPassword) {
            setStatus({ type: 'error', message: 'Passwords do not match.' });
            return;
          }
          const result = await resetPasswordWithOTP(form.email, resetOtp, newPassword);
          if (result.success) {
            setResetStep('done');
            setStatus({ type: 'success', message: 'Password reset successfully!' });
          } else {
            setStatus({ type: 'error', message: result.message });
          }
        }
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Something went wrong';
      // Make common error messages more user-friendly
      let friendlyMessage = rawMessage;
      if (rawMessage.toLowerCase().includes('invalid login credentials')) {
        friendlyMessage = 'Incorrect email or password. Please try again.';
      } else if (rawMessage.toLowerCase().includes('already registered') || rawMessage.toLowerCase().includes('already exists')) {
        friendlyMessage = 'This email is already registered. Please sign in.';
      } else if (rawMessage.toLowerCase().includes('email not confirmed')) {
        friendlyMessage = 'Please check your email and verify your account first.';
      }
      setStatus({
        type: 'error',
        message: friendlyMessage,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setSubmitting(true);
    setStatus({ type: null, message: null });
    try {
      if (mode === 'register') {
        // Sign-up flow: allows creating new users with Google profile name
        await signUpWithGoogle();
      } else {
        // Sign-in flow: requires existing account
        await signInWithGoogle();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google authentication failed';
      setStatus({ type: 'error', message });
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

          {/* My Bookings Section */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>My Bookings</h2>
              <a href="/book-party" className={styles.cardHeaderLink}>Book a Party</a>
            </div>
            <div className={styles.cardBody}>
              {bookingsLoading ? (
                <div className={styles.loadingState}>Loading your bookings...</div>
              ) : bookings.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No bookings yet</p>
                  <p className={styles.emptyStateHint}>Book a party for your little one</p>
                  <PrimaryButton to="/book-party">Book a Party</PrimaryButton>
                </div>
              ) : (
                <div className={styles.bookingsList}>
                  {bookings.map((booking) => {
                    const eventDate = new Date(booking.eventDate);
                    const isPast = eventDate < new Date();
                    const isCancelled = booking.status === 'Cancelled';
                    const canModify = !isPast && !isCancelled;

                    return (
                      <div
                        key={booking.id}
                        className={styles.bookingCard}
                        data-status={isCancelled ? 'cancelled' : isPast ? 'past' : 'upcoming'}
                      >
                        <div className={styles.bookingHeader}>
                          <div className={styles.bookingRef}>
                            <span className={styles.bookingRefLabel}>Ref:</span>
                            <span className={styles.bookingRefValue}>{booking.reference}</span>
                          </div>
                          <span
                            className={styles.bookingStatus}
                            data-status={isCancelled ? 'cancelled' : isPast ? 'completed' : booking.status.toLowerCase()}
                          >
                            {isCancelled ? 'Cancelled' : isPast ? 'Completed' : booking.status}
                          </span>
                        </div>

                        <div className={styles.bookingDetails}>
                          <div className={styles.bookingPackage}>{booking.partyPackage.name}</div>
                          <div className={styles.bookingInfo}>
                            <div className={styles.bookingInfoItem}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>
                                {eventDate.toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                            <div className={styles.bookingInfoItem}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 6v6l4 2" />
                              </svg>
                              <span>{booking.startTime} - {booking.endTime}</span>
                            </div>
                            <div className={styles.bookingInfoItem}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span>{booking.location}</span>
                            </div>
                            <div className={styles.bookingInfoItem}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              <span>{booking.guests} guests</span>
                            </div>
                          </div>
                          {(booking.balanceRemaining ?? 0) > 0 && !isCancelled && (
                            <div className={styles.bookingBalance}>
                              Balance due: ${(booking.balanceRemaining ?? 0).toFixed(2)}
                            </div>
                          )}
                        </div>

                        {canModify && (
                          <div className={styles.bookingActions}>
                            <button
                              type="button"
                              className={styles.bookingActionBtn}
                              onClick={() => openRescheduleModal(booking)}
                            >
                              Reschedule
                            </button>
                            <button
                              type="button"
                              className={`${styles.bookingActionBtn} ${styles.cancelBtn}`}
                              onClick={() => handleCancelBooking(booking.id)}
                              disabled={cancellingBookingId === booking.id}
                            >
                              {cancellingBookingId === booking.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* My Tickets Section */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>My Tickets</h2>
              <a href="/buy-ticket" className={styles.cardHeaderLink}>Buy Tickets</a>
            </div>
            <div className={styles.cardBody}>
              {ticketsLoading ? (
                <div className={styles.loadingState}>Loading your tickets...</div>
              ) : tickets.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No tickets purchased yet</p>
                  <p className={styles.emptyStateHint}>Get play passes for your little ones</p>
                  <PrimaryButton to="/buy-ticket">Buy Tickets</PrimaryButton>
                </div>
              ) : (
                <div className={styles.ticketsList}>
                  {tickets.map((ticket) => {
                    const redeemedCount = ticket.codes.filter(c => c.status === 'redeemed').length;
                    const allRedeemed = redeemedCount === ticket.codes.length;

                    return (
                      <div key={ticket.id} className={styles.ticketCard}>
                        <div className={styles.ticketHeader}>
                          <div className={styles.ticketType}>{ticket.type}</div>
                          <span
                            className={styles.ticketStatus}
                            data-status={allRedeemed ? 'redeemed' : 'active'}
                          >
                            {allRedeemed ? 'All Used' : `${redeemedCount}/${ticket.codes.length} Used`}
                          </span>
                        </div>
                        <div className={styles.ticketDetails}>
                          <div className={styles.ticketInfo}>
                            <span className={styles.ticketQuantity}>{ticket.quantity} admission(s)</span>
                            <span className={styles.ticketTotal}>${(ticket.total ?? 0).toFixed(2)}</span>
                          </div>
                          <div className={styles.ticketCodes}>
                            {ticket.codes.map((code) => (
                              <div
                                key={code.code}
                                className={`${styles.ticketCode} ${code.status === 'redeemed' ? styles.ticketCodeRedeemed : styles.ticketCodeUnused}`}
                              >
                                <span className={styles.ticketCodeText}>{code.code}</span>
                                {code.status === 'redeemed' && code.redeemedAt && (
                                  <span className={styles.ticketCodeDate}>
                                    Used {formatDate(code.redeemedAt)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className={styles.ticketPurchaseDate}>
                            Purchased: {formatDate(ticket.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Reschedule Modal */}
          {rescheduleModal.open && rescheduleModal.booking && (
            <div className={styles.modalOverlay} onClick={closeRescheduleModal}>
              <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h3>Reschedule Booking</h3>
                  <button
                    type="button"
                    className={styles.modalClose}
                    onClick={closeRescheduleModal}
                  >
                    &times;
                  </button>
                </div>
                <div className={styles.modalBody}>
                  <p className={styles.modalSubtitle}>
                    Current: {new Date(rescheduleModal.booking.eventDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })} at {rescheduleModal.booking.startTime}
                  </p>

                  <label className={styles.modalLabel}>
                    New Date
                    <input
                      type="date"
                      value={rescheduleModal.selectedDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => handleRescheduleDateChange(e.target.value)}
                      className={styles.modalInput}
                    />
                  </label>

                  {rescheduleModal.selectedDate && (
                    <div className={styles.slotsSection}>
                      <label className={styles.modalLabel}>Available Times</label>
                      {rescheduleModal.slotsLoading ? (
                        <p className={styles.slotsLoading}>Loading available times...</p>
                      ) : rescheduleModal.slots.length === 0 ? (
                        <p className={styles.noSlots}>No available times for this date.</p>
                      ) : (
                        <div className={styles.slotsGrid}>
                          {rescheduleModal.slots
                            .filter((slot) => slot.available)
                            .map((slot) => (
                              <button
                                key={slot.startTime}
                                type="button"
                                className={`${styles.slotBtn} ${rescheduleModal.selectedTime === slot.startTime ? styles.slotBtnSelected : ''}`}
                                onClick={() => setRescheduleModal((prev) => ({ ...prev, selectedTime: slot.startTime }))}
                              >
                                {slot.startTime}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {rescheduleModal.error && (
                    <p className={styles.error}>{rescheduleModal.error}</p>
                  )}
                </div>
                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.modalCancelBtn}
                    onClick={closeRescheduleModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.modalSubmitBtn}
                    onClick={handleRescheduleSubmit}
                    disabled={
                      rescheduleModal.submitting ||
                      !rescheduleModal.selectedDate ||
                      !rescheduleModal.selectedTime
                    }
                  >
                    {rescheduleModal.submitting ? 'Rescheduling...' : 'Confirm Reschedule'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Magic link sent view
  if (mode === 'magic-link' && magicLinkSent) {
    return (
      <section className={styles.section}>
        <div className={styles.loginCard}>
          <div className={styles.successMessage}>
            <div className={styles.successIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2>Check your email</h2>
            <p>We sent a sign-in link to <strong>{form.email}</strong></p>
            <p className={styles.hintText}>Click the link in the email to sign in.</p>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => { setMagicLinkSent(false); setMode('login'); }}
            >
              Back to sign in
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Password reset done view
  if (mode === 'forgot-password' && resetStep === 'done') {
    return (
      <section className={styles.section}>
        <div className={styles.loginCard}>
          <div className={styles.successMessage}>
            <div className={styles.successIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2>Password Reset!</h2>
            <p>Your password has been successfully reset.</p>
            <p className={styles.hintText}>You can now sign in with your new password.</p>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setResetStep('email');
                setResetOtp('');
                setNewPassword('');
                setConfirmNewPassword('');
                setMode('login');
                setStatus({ type: null, message: null });
              }}
            >
              Back to sign in
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.loginCard}>
        {/* Main login/register tabs */}
        {(mode === 'login' || mode === 'register') && (
          <>
            <div className={styles.switcher}>
              <button
                className={mode === 'login' ? styles.activeTab : styles.tab}
                onClick={() => { setMode('login'); setRegisterStep('form'); setRegisterOtp(''); setStatus({ type: null, message: null }); }}
                type="button"
              >
                Sign in
              </button>
              <button
                className={mode === 'register' ? styles.activeTab : styles.tab}
                onClick={() => { setMode('register'); setRegisterStep('form'); setRegisterOtp(''); setStatus({ type: null, message: null }); }}
                type="button"
              >
                Create account
              </button>
            </div>

            {/* Google Auth Button */}
            <button
              type="button"
              className={styles.googleButton}
              onClick={handleGoogleAuth}
              disabled={submitting}
            >
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {mode === 'register' ? 'Sign up with Google' : 'Sign in with Google'}
            </button>

            <div className={styles.divider}>
              <span>or</span>
            </div>
          </>
        )}

        {/* Magic link / Forgot password header */}
        {mode === 'magic-link' && (
          <div className={styles.modeHeader}>
            <h2>Sign in with email link</h2>
            <p>We'll send you a magic link to sign in instantly.</p>
          </div>
        )}

        {mode === 'forgot-password' && (
          <div className={styles.modeHeader}>
            <h2>Reset your password</h2>
            <p>
              {resetStep === 'email' && 'Enter your email and we\'ll send you a verification code.'}
              {resetStep === 'otp' && `Enter the 6-digit code sent to ${form.email}`}
              {resetStep === 'password' && 'Create your new password.'}
            </p>
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          {/* Registration form fields - only shown in form step */}
          {mode === 'register' && registerStep === 'form' && (
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

          {/* Email field - shown for login, register (form step), magic-link, and forgot-password (email step) */}
          {(mode === 'login' || mode === 'magic-link' || (mode === 'register' && registerStep === 'form') || (mode === 'forgot-password' && resetStep === 'email')) && (
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
          )}

          {/* OTP field - shown for registration OTP step */}
          {mode === 'register' && registerStep === 'otp' && (
            <>
              <p style={{ marginBottom: '1rem', color: '#666' }}>
                We sent a verification code to <strong>{form.email}</strong>
              </p>
              <label>
                Verification Code
                <input
                  type="text"
                  value={registerOtp}
                  onChange={(e) => setRegisterOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  autoComplete="one-time-code"
                  style={{ letterSpacing: '0.3em', textAlign: 'center' }}
                />
              </label>
            </>
          )}

          {/* OTP field - shown for forgot-password OTP step */}
          {mode === 'forgot-password' && resetStep === 'otp' && (
            <label>
              Verification Code
              <input
                type="text"
                value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                placeholder="Enter 6-digit code"
                autoComplete="one-time-code"
                style={{ letterSpacing: '0.3em', textAlign: 'center' }}
              />
            </label>
          )}

          {/* New password fields - shown for forgot-password password step */}
          {mode === 'forgot-password' && resetStep === 'password' && (
            <>
              <label>
                New Password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </label>
              <label>
                Confirm New Password
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Confirm your new password"
                />
              </label>
            </>
          )}

          {(mode === 'login' || (mode === 'register' && registerStep === 'form')) && (
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
          )}

          {mode === 'register' && registerStep === 'form' && (
            <label>
              Phone (optional)
              <input value={form.phone} onChange={handleChange('phone')} autoComplete="tel" />
            </label>
          )}

          <PrimaryButton type="submit" disabled={submitting}>
            {submitting
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'register'
                  ? registerStep === 'form'
                    ? 'Create account'
                    : 'Verify & Complete Registration'
                  : mode === 'magic-link'
                    ? 'Send magic link'
                    : mode === 'forgot-password'
                      ? resetStep === 'email'
                        ? 'Send verification code'
                        : resetStep === 'otp'
                          ? 'Verify code'
                          : 'Reset password'
                      : 'Submit'}
          </PrimaryButton>

          {status.message ? (
            <p className={status.type === 'error' ? styles.error : styles.success}>
              {status.message}
            </p>
          ) : null}
        </form>

        {/* Footer links */}
        {mode === 'login' && (
          <div className={styles.footerLinks}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => { setMode('forgot-password'); setStatus({ type: null, message: null }); }}
            >
              Forgot password?
            </button>
            <span className={styles.linkDivider}>|</span>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => { setMode('magic-link'); setStatus({ type: null, message: null }); }}
            >
              Sign in with email link
            </button>
          </div>
        )}

        {mode === 'magic-link' && (
          <div className={styles.footerLinks}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => { setMode('login'); setStatus({ type: null, message: null }); }}
            >
              Back to sign in
            </button>
          </div>
        )}

        {mode === 'forgot-password' && (
          <div className={styles.footerLinks}>
            {resetStep === 'email' && (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => { setMode('login'); setStatus({ type: null, message: null }); }}
              >
                Back to sign in
              </button>
            )}
            {resetStep === 'otp' && (
              <>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => { setResetStep('email'); setResetOtp(''); setStatus({ type: null, message: null }); }}
                >
                  Change email
                </button>
                <span className={styles.linkDivider}>|</span>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={async () => {
                    setSubmitting(true);
                    const result = await sendPasswordResetOTP(form.email);
                    setSubmitting(false);
                    if (result.success) {
                      setStatus({ type: 'success', message: 'New code sent!' });
                    } else {
                      setStatus({ type: 'error', message: result.message });
                    }
                  }}
                  disabled={submitting}
                >
                  Resend code
                </button>
              </>
            )}
            {resetStep === 'password' && (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => { setResetStep('otp'); setStatus({ type: null, message: null }); }}
              >
                Back to code entry
              </button>
            )}
          </div>
        )}

        <p className={styles.helperText}>
          By creating an account you agree to our <a href="/terms">Terms</a> and{' '}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </div>
    </section>
  );
}
