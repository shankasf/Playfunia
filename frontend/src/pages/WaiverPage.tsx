import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWaiverAuth } from '../context/WaiverAuthContext';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { WaiverForm } from '../components/waiver/WaiverForm';
import { apiPost } from '../api/client';
import { fetchMyWaivers, type GuardianWaiver } from '../api/waivers';
import { formatBirthDate } from '../lib/dateUtils';
import styles from './WaiverPage.module.css';

const toDateInputValue = (value?: string) => {
  if (!value) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString().slice(0, 10);
};

const formatChildBirthDate = (value?: string) => {
  if (!value) {
    return 'Birth date not provided';
  }
  return formatBirthDate(value);
};

export function WaiverPage() {
  const { user } = useAuth();
  const {
    waiverUser,
    waiverToken,
    isWaiverAuthenticated,
    lookup,
    loginOrRegister,
    logout: logoutWaiverUser,
    error: waiverAuthError,
    markWaiverCompleted,
  } = useWaiverAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [latestWaiver, setLatestWaiver] = useState<GuardianWaiver | null>(null);
  const [waiverLoading, setWaiverLoading] = useState(false);

  // Email/phone login state
  const [loginMode, setLoginMode] = useState<'email' | 'phone'>('email');
  const [loginInput, setLoginInput] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Returning user state
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [confirmResubmit, setConfirmResubmit] = useState(false);
  const [quickSignLoading, setQuickSignLoading] = useState(false);
  const [quickSignError, setQuickSignError] = useState<string | null>(null);

  // Clear waiver auth on page load to always show login form first (unless main user is logged in)
  useEffect(() => {
    if (!user) {
      logoutWaiverUser();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const returnUrl = searchParams.get('return') || undefined;
  const hasValidWaiver = user?.hasValidWaiver ?? false;

  // Determine if user is authenticated (either main or waiver-only)
  const isAuthenticated = Boolean(user) || isWaiverAuthenticated;
  const effectiveUser = user ?? waiverUser;

  // For regular users, show form if no valid waiver or explicitly editing
  const shouldShowMainUserForm = !hasValidWaiver || showForm;
  const guardianName = useMemo(
    () => (user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : waiverUser?.guardianName ?? ''),
    [user, waiverUser]
  );
  const summaryGuardianName = latestWaiver?.guardianName?.trim() || guardianName;
  const summaryGuardianEmail = latestWaiver?.guardianEmail ?? user?.email ?? '';
  const existingChildren = user?.children ?? [];
  const initialChildren = useMemo(() => {
    if (latestWaiver?.children?.length) {
      return latestWaiver.children.map((child, index) => ({
        id: child.name ? `${child.name}-${index}` : undefined,
        name: child.name ?? '',
        birthDate: toDateInputValue(child.birthDate),
        gender: child.gender,
      }));
    }
    return existingChildren.map((child) => ({
      id: child.id,
      name: [child.firstName, child.lastName].filter(Boolean).join(' ').trim(),
      birthDate: toDateInputValue(child.birthDate),
    }));
  }, [existingChildren, latestWaiver]);
  const formatSignedDateTime = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };
  const waiverSignedDate = formatSignedDateTime(latestWaiver?.signedAt);
  const summaryHeading = returnUrl
    ? '✅ You already have a valid waiver on file'
    : waiverSignedDate
      ? `✅ Waiver signed on ${waiverSignedDate}`
      : '✅ Your waiver is current';
  const summaryDescription = returnUrl
    ? 'Your current waiver covers all your registered children and is valid for 5 years. You can continue with your booking or update the details below if something has changed.'
    : 'Your waiver is on file and valid for 5 years. Update the details anytime to keep things accurate for your next visit.';

  const loadLatestWaiver = useCallback(async () => {
    // Works for both regular users and waiver-only users
    if (!user && !isWaiverAuthenticated) {
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
  }, [user?.id, isWaiverAuthenticated]);

  useEffect(() => {
    // For main users, load waivers immediately
    if (user) {
      loadLatestWaiver();
      return;
    }
    // For waiver-only users, only load after they've logged in via this page's form
    // (isReturningUser is set by the login flow, not from localStorage restoration)
    if (!isWaiverAuthenticated) {
      setLatestWaiver(null);
    }
  }, [loadLatestWaiver, user, isWaiverAuthenticated]);

  // Load previous waiver data when returning user is detected
  useEffect(() => {
    if (isReturningUser && isWaiverAuthenticated && !latestWaiver) {
      loadLatestWaiver();
    }
  }, [isReturningUser, isWaiverAuthenticated, latestWaiver, loadLatestWaiver]);

  const handleWaiverSubmitted = useCallback(() => {
    setShowForm(false);
    if (isWaiverAuthenticated) {
      // For waiver-only users, mark waiver as completed in context
      markWaiverCompleted();
    } else {
      // For main users, reload waiver from server
      loadLatestWaiver();
    }
  }, [loadLatestWaiver, isWaiverAuthenticated, markWaiverCompleted]);

  // Quick re-sign handler for returning users
  const handleQuickReSign = useCallback(async () => {
    if (!latestWaiver) return;

    // Check required fields that MUST have values (not empty)
    const missingRequired =
      !latestWaiver.guardianName ||
      !latestWaiver.guardianEmail ||
      !latestWaiver.guardianPhone ||
      !latestWaiver.guardianDateOfBirth ||
      !latestWaiver.relationshipToChildren ||
      !latestWaiver.signature ||
      !latestWaiver.acceptedPolicies?.length ||
      !latestWaiver.children?.length ||
      latestWaiver.children.some((child) => !child.name || !child.birthDate);

    if (missingRequired) {
      setQuickSignError('Some required details are missing from your previous waiver. Please complete all fields.');
      setShowForm(true);
      setConfirmResubmit(true);
      return;
    }

    setQuickSignLoading(true);
    setQuickSignError(null);

    try {
      const payload = {
        guardianName: latestWaiver.guardianName,
        guardianEmail: latestWaiver.guardianEmail,
        guardianPhone: latestWaiver.guardianPhone,
        guardianDob: latestWaiver.guardianDateOfBirth,
        relationshipToChildren: latestWaiver.relationshipToChildren,
        signature: latestWaiver.signature,
        acceptedPolicies: latestWaiver.acceptedPolicies,
        marketingOptIn: latestWaiver.marketingOptIn,
        children: latestWaiver.children.map((child) => ({
          name: child.name || `${child.first_name || ''} ${child.last_name || ''}`.trim(),
          birthDate: child.birthDate || child.birth_date,
          gender: child.gender,
        })),
        // Flag for quick re-sign - backend will only record visit if data unchanged
        quickResign: true,
      };

      await apiPost('/waivers', payload);
      markWaiverCompleted();
    } catch (error) {
      setQuickSignError(error instanceof Error ? error.message : 'Failed to sign waiver. Please try again.');
    } finally {
      setQuickSignLoading(false);
    }
  }, [latestWaiver, markWaiverCompleted]);

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <span className={styles.tag}>📋 Digital Waiver Form</span>
        <h1>Complete the Playfunia waiver before you arrive</h1>
        <p>
          Save time at check-in by submitting your waiver in advance. Your waiver applies to all
          listed children and stays on file for five years.
        </p>
      </div>

      {/* Playground Rules - Full Image Display */}
      <div className={styles.rulesSection}>
        <h2 className={styles.rulesTitle}>📜 Playground Safety Rules</h2>
        <p className={styles.rulesSubtitle}>Please review our safety guidelines before signing</p>
        <div className={styles.rulesImageContainer}>
          <img
            src="/images/playground-rules.jpg"
            alt="Playfunia playground safety rules"
            className={styles.rulesImage}
            loading="lazy"
          />
        </div>
      </div>

      {user ? (
        <>
          {hasValidWaiver ? (
            <div className={styles.existingWaiverNotice}>
              <div className={styles.summaryHeader}>
                <h2>{summaryHeading}</h2>
                <p>{summaryDescription}</p>
              </div>
              <div className={styles.summaryDetails}>
                <div className={styles.summaryBlock}>
                  <h3>Parent / Guardian</h3>
                  <p className={styles.summaryPrimary}>
                    {summaryGuardianName || 'Name not provided yet'}
                  </p>
                  <p className={styles.summarySecondary}>{summaryGuardianEmail}</p>
                </div>
                <div className={styles.summaryBlock}>
                  <h3>Children covered</h3>
                  {latestWaiver?.children?.length ? (
                    <ul className={styles.childList}>
                      {latestWaiver.children.map((child, index) => {
                        const name = child.name?.trim();
                        return (
                          <li
                            key={`${child.name ?? 'child'}-${index}`}
                            className={styles.childItem}
                          >
                            <span className={styles.childName}>
                              {name || 'Child name not provided'}
                            </span>
                            <span className={styles.childMeta}>
                              {formatChildBirthDate(child.birthDate)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : existingChildren.length > 0 ? (
                    <ul className={styles.childList}>
                      {existingChildren.map((child) => {
                        const name = [child.firstName, child.lastName]
                          .filter(Boolean)
                          .join(' ')
                          .trim();
                        return (
                          <li key={child.id} className={styles.childItem}>
                            <span className={styles.childName}>
                              {name || 'Child name not provided'}
                            </span>
                            <span className={styles.childMeta}>
                              {formatChildBirthDate(child.birthDate)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className={styles.summarySecondary}>No children on file yet.</p>
                  )}
                </div>
              </div>
              <div className={styles.waiverActions}>
                <PrimaryButton to={returnUrl ?? '/book-party'} className={styles.primaryAction}>
                  {returnUrl ? 'Continue with Existing Waiver' : 'Book a Party'}
                </PrimaryButton>
                {showForm ? (
                  <button
                    type="button"
                    className={styles.tertiaryButton}
                    onClick={() => setShowForm(false)}
                  >
                    Cancel edit
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setShowForm(true)}
                  >
                    Modify waiver details
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {shouldShowMainUserForm ? (
            user.hasValidWaiver && waiverLoading ? (
              <div className={styles.formLoader}>Loading saved waiver details…</div>
            ) : (
              <WaiverForm
                key={latestWaiver?.id ?? 'new-waiver'}
                returnUrl={returnUrl}
                initialGuardianName={latestWaiver?.guardianName ?? guardianName}
                initialGuardianEmail={latestWaiver?.guardianEmail ?? user.email}
                initialGuardianPhone={latestWaiver?.guardianPhone ?? user.phone}
                initialGuardianDob={latestWaiver?.guardianDateOfBirth ?? undefined}
                initialRelationship={latestWaiver?.relationshipToChildren ?? undefined}
                initialMarketingOptIn={latestWaiver?.marketingOptIn ?? undefined}
                initialSignature={latestWaiver?.signature ?? guardianName}
                initialChildren={initialChildren}
                onSubmitted={handleWaiverSubmitted}
                onGoBack={hasValidWaiver ? () => setShowForm(false) : () => navigate(-1)}
              />
            )
          ) : null}
        </>
      ) : isWaiverAuthenticated && waiverUser ? (
        /* Waiver-only user authenticated */
        <>
          {/* Success state - show after waiver is signed */}
          {waiverUser.hasCompletedWaiver ? (
            <div className={styles.existingWaiverNotice}>
              <div className={styles.summaryHeader}>
                <h2>✅ Waiver signed successfully!</h2>
                <p className={styles.lastSignedDate}>
                  📅 Signed on: <strong>{new Date().toLocaleString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}</strong>
                </p>
                <p>You're all set. Enjoy your visit to Playfunia!</p>
              </div>
              <div className={styles.waiverActions}>
                <PrimaryButton to={returnUrl ?? '/'} className={styles.primaryAction}>
                  {returnUrl ? 'Continue' : 'Back to Home'}
                </PrimaryButton>
              </div>
            </div>
          ) : isReturningUser && !showForm ? (
            waiverLoading ? (
              <div className={styles.formLoader}>Loading your saved details…</div>
            ) : latestWaiver ? (
              <div className={styles.existingWaiverNotice}>
                <div className={styles.summaryHeader}>
                  <h2>👋 Welcome back!</h2>
                  {latestWaiver.signedAt && (
                    <p className={styles.lastSignedDate}>
                      📅 Last signed: <strong>{formatSignedDateTime(latestWaiver.signedAt)}</strong>
                    </p>
                  )}
                  <p>For safety and legal purposes, <strong>a new waiver must be signed for each visit</strong>. Please review your details below.</p>
                </div>

                <div className={styles.summaryDetails}>
                  <div className={styles.summaryBlock}>
                    <h3>Parent / Guardian</h3>
                    <p className={styles.summaryPrimary}>{latestWaiver.guardianName}</p>
                    <p className={styles.summarySecondary}>{latestWaiver.guardianEmail || latestWaiver.guardianPhone}</p>
                    {latestWaiver.relationshipToChildren && (
                      <p className={styles.summarySecondary}>Relationship: {latestWaiver.relationshipToChildren}</p>
                    )}
                  </div>

                  <div className={styles.summaryBlock}>
                    <h3>Children covered</h3>
                    {waiverUser?.children?.length ? (
                      <ul className={styles.childList}>
                        {waiverUser.children.map((child, index) => (
                          <li key={`${child.name}-${index}`} className={styles.childItem}>
                            <span className={styles.childName}>{child.name || 'Child name not provided'}</span>
                            <span className={styles.childMeta}>{formatChildBirthDate(child.birthDate)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.summarySecondary}>No children on file yet.</p>
                    )}
                  </div>

                </div>

                <div className={styles.confirmSection}>
                  <label className={styles.confirmCheckbox}>
                    <input
                      type="checkbox"
                      checked={confirmResubmit}
                      onChange={(e) => setConfirmResubmit(e.target.checked)}
                    />
                    <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms & Conditions</a> and confirm a new waiver for today's visit</span>
                  </label>
                </div>

                {quickSignError && <p className={styles.loginError}>{quickSignError}</p>}

                <div className={styles.waiverActions}>
                  <PrimaryButton
                    disabled={!confirmResubmit || quickSignLoading}
                    onClick={handleQuickReSign}
                    className={!confirmResubmit ? styles.disabledButton : ''}
                  >
                    {quickSignLoading ? 'Signing…' : '✍️ Sign Waiver Now'}
                  </PrimaryButton>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setShowForm(true)}
                  >
                    Modify My Details
                  </button>
                </div>

                <div className={styles.logoutSection}>
                  <button type="button" className={styles.logoutButton} onClick={() => { logoutWaiverUser(); setIsReturningUser(false); setConfirmResubmit(false); setQuickSignError(null); }}>
                    Use a different email/phone
                  </button>
                </div>
              </div>
            ) : (
              /* No previous waiver found - show form with saved user data */
              <WaiverForm
                key="new-waiver-user-form"
                returnUrl={returnUrl}
                initialGuardianName={waiverUser?.guardianName ?? `${waiverUser?.guardianFirstName ?? ''} ${waiverUser?.guardianLastName ?? ''}`.trim()}
                initialGuardianEmail={waiverUser?.email ?? ''}
                initialGuardianPhone={waiverUser?.phone ?? ''}
                initialGuardianDob={waiverUser?.guardianDateOfBirth ?? undefined}
                initialRelationship={waiverUser?.relationshipToMinor ?? undefined}
                initialMarketingOptIn={false}
                initialSignature={''}
                initialChildren={waiverUser?.children?.map((child, index) => ({
                  id: child.id ?? `child-${index}`,
                  name: child.name ?? '',
                  birthDate: toDateInputValue(child.birthDate),
                  gender: child.gender,
                })) ?? []}
                onSubmitted={handleWaiverSubmitted}
                onGoBack={() => { logoutWaiverUser(); setIsReturningUser(false); }}
              />
            )
          ) : showForm ? (
            /* Editing mode for returning user */
            waiverLoading ? (
              <div className={styles.formLoader}>Loading saved waiver details…</div>
            ) : (
              <WaiverForm
                key={latestWaiver?.id ?? 'waiver-user-form-edit'}
                returnUrl={returnUrl}
                initialGuardianName={latestWaiver?.guardianName ?? waiverUser?.guardianName ?? `${waiverUser?.guardianFirstName ?? ''} ${waiverUser?.guardianLastName ?? ''}`.trim()}
                initialGuardianEmail={latestWaiver?.guardianEmail ?? waiverUser?.email ?? ''}
                initialGuardianPhone={latestWaiver?.guardianPhone ?? waiverUser?.phone ?? ''}
                initialGuardianDob={latestWaiver?.guardianDateOfBirth ?? waiverUser?.guardianDateOfBirth ?? undefined}
                initialRelationship={latestWaiver?.relationshipToChildren ?? waiverUser?.relationshipToMinor ?? undefined}
                initialMarketingOptIn={latestWaiver?.marketingOptIn ?? false}
                initialSignature={latestWaiver?.signature ?? ''}
                initialChildren={waiverUser?.children?.map((child, index) => ({
                  id: child.id ?? `child-${index}`,
                  name: child.name ?? '',
                  birthDate: toDateInputValue(child.birthDate),
                  gender: child.gender,
                })) ?? []}
                onSubmitted={handleWaiverSubmitted}
                onGoBack={() => setShowForm(false)}
              />
            )
          ) : (
            /* New waiver user - first time signing */
            <WaiverForm
              key="new-waiver-form"
              returnUrl={returnUrl}
              initialGuardianName={waiverUser?.guardianName ?? `${waiverUser?.guardianFirstName ?? ''} ${waiverUser?.guardianLastName ?? ''}`.trim()}
              initialGuardianEmail={waiverUser?.email ?? ''}
              initialGuardianPhone={waiverUser?.phone ?? ''}
              initialGuardianDob={waiverUser?.guardianDateOfBirth ?? undefined}
              initialRelationship={waiverUser?.relationshipToMinor ?? undefined}
              initialMarketingOptIn={false}
              initialSignature={''}
              initialChildren={waiverUser?.children?.map((child, index) => ({
                id: child.id ?? `child-${index}`,
                name: child.name ?? '',
                birthDate: toDateInputValue(child.birthDate),
                gender: child.gender,
              })) ?? []}
              onSubmitted={handleWaiverSubmitted}
              onGoBack={() => { logoutWaiverUser(); setIsReturningUser(false); }}
            />
          )}
        </>
      ) : (
        /* Not authenticated - show email/phone login form */
        <div className={styles.authPrompt}>
          <h2>Enter your email or phone to continue</h2>
          <p>We'll check if you've already signed a waiver. No password required.</p>

          <div className={styles.loginModeToggle}>
            <button
              type="button"
              className={`${styles.modeButton} ${loginMode === 'email' ? styles.modeActive : ''}`}
              onClick={() => { setLoginMode('email'); setLoginInput(''); setLoginError(null); }}
            >
              Email
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${loginMode === 'phone' ? styles.modeActive : ''}`}
              onClick={() => { setLoginMode('phone'); setLoginInput(''); setLoginError(null); }}
            >
              Phone
            </button>
          </div>

          <form
            className={styles.loginForm}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!loginInput.trim()) {
                setLoginError(`Please enter your ${loginMode}`);
                return;
              }

              setLoginLoading(true);
              setLoginError(null);

              try {
                const lookupPayload = loginMode === 'email'
                  ? { email: loginInput.trim() }
                  : { phone: loginInput.trim() };
                const result = await lookup(lookupPayload);

                // Track if this is a returning user (either main_user or waiver_user)
                const returning = result === 'waiver_user' || result === 'main_user';
                setIsReturningUser(returning);
                setConfirmResubmit(false);

                // For all users (including main_user), continue with waiver flow
                // This allows signing waivers without requiring full account login
                await loginOrRegister(lookupPayload);
              } catch (err) {
                setLoginError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
              } finally {
                setLoginLoading(false);
              }
            }}
          >
            <input
              type={loginMode === 'email' ? 'email' : 'tel'}
              className={styles.loginInput}
              placeholder={loginMode === 'email' ? 'you@example.com' : '(555) 123-4567'}
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              autoComplete={loginMode === 'email' ? 'email' : 'tel'}
              disabled={loginLoading}
            />
            {loginError && <p className={styles.loginError}>{loginError}</p>}
            {waiverAuthError && <p className={styles.loginError}>{waiverAuthError}</p>}
            <PrimaryButton type="submit" disabled={loginLoading}>
              {loginLoading ? 'Checking…' : 'Continue'}
            </PrimaryButton>
          </form>

          <p className={styles.loginHint}>
            💡 Already signed a waiver before? Just enter the same email or phone — we'll find your details and let you sign with one tap!
          </p>
        </div>
      )}
    </section>
  );
}
