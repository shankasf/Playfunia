import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWaiverAuth } from '../context/WaiverAuthContext';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { WaiverForm, type WaiverResult } from '../components/waiver/WaiverForm';
import { apiPost } from '../api/client';
import { fetchMyWaivers, type GuardianWaiver } from '../api/waivers';
import { formatBirthDate, toDateInputValue } from '../lib/dateUtils';
import { isValidEmail, isValidPhone, formatPhoneInput } from '../utils/validation';
import styles from './WaiverPage.module.css';

const formatChildBirthDate = (value?: string) => {
  if (!value) {
    return 'Birth date not provided';
  }
  return formatBirthDate(value);
};

/** Build guardian name from waiver user, filtering out placeholder "Unknown" values */
function buildWaiverGuardianName(waiverUser: { guardianName?: string; guardianFirstName?: string; guardianLastName?: string } | null): string {
  if (!waiverUser) return '';
  if (waiverUser.guardianName && waiverUser.guardianName !== 'Unknown') return waiverUser.guardianName;
  const first = (waiverUser.guardianFirstName && waiverUser.guardianFirstName !== 'Unknown') ? waiverUser.guardianFirstName : '';
  const last = (waiverUser.guardianLastName && waiverUser.guardianLastName !== 'Unknown') ? waiverUser.guardianLastName : '';
  return `${first} ${last}`.trim();
}

export function WaiverPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const {
    waiverUser,
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
  const [completedWaiverData, setCompletedWaiverData] = useState<WaiverResult | null>(null);

  // Clear stale waiver auth sessions on page load.
  // When no main user is logged in, any waiver auth restored from localStorage
  // is from a previous session (e.g. admin signed out) and must be cleared.
  // Waiver sessions created during THIS page visit (isReturningUser) are preserved.
  const initialClearDone = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (initialClearDone.current) return;
    initialClearDone.current = true;
    if (!user && isWaiverAuthenticated && !isReturningUser) {
      logoutWaiverUser();
    }
  }, [authLoading, user, isWaiverAuthenticated, isReturningUser, logoutWaiverUser]);

  const returnUrl = searchParams.get('return') || undefined;
  const hasValidWaiver = user?.hasValidWaiver ?? false;

  // Authentication checks available via user/isWaiverAuthenticated/waiverUser directly

  // For regular users, show form if no valid waiver or explicitly editing
  const shouldShowMainUserForm = !hasValidWaiver || showForm;
  const guardianName = useMemo(
    () => (user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : buildWaiverGuardianName(waiverUser)),
    [user, waiverUser]
  );
  const summaryGuardianName = latestWaiver?.guardianName?.trim() || guardianName;
  const summaryGuardianEmail = latestWaiver?.guardianEmail ?? user?.email ?? '';
  const existingChildren = useMemo(() => user?.children ?? [], [user?.children]);
  const initialChildren = useMemo(() => {
    if (latestWaiver?.children?.length) {
      return latestWaiver.children.map((child, index) => ({
        id: child.childId?.toString() ?? (child.name ? `${child.name}-${index}` : undefined),
        childId: child.childId,
        name: child.name ?? '',
        birthDate: toDateInputValue(child.birthDate),
        gender: child.gender,
      }));
    }
    return existingChildren.map((child) => ({
      id: String(child.id),
      childId: typeof child.id === 'number' ? child.id : parseInt(String(child.id), 10),
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
      timeZone: 'America/New_York',
    });
  };
  const waiverSignedDate = formatSignedDateTime(latestWaiver?.signedAt);
  const summaryHeading = returnUrl
    ? '✅ You already have a valid waiver on file'
    : waiverSignedDate
      ? `✅ Waiver signed on ${waiverSignedDate}`
      : '✅ Your waiver is current';
  const summaryDescription = returnUrl
    ? 'Your current waiver covers all your registered children and is valid for 7 years. You can continue with your booking or update the details below if something has changed.'
    : 'Your waiver is on file and valid for 7 years. Update the details anytime to keep things accurate for your next visit.';

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
  }, [user, isWaiverAuthenticated]);

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

  const handleWaiverSubmitted = useCallback((data: WaiverResult) => {
    setShowForm(false);
    setCompletedWaiverData(data);
    if (isWaiverAuthenticated) {
      // For waiver-only users, mark waiver as completed in context
      markWaiverCompleted();
    } else {
      // For main users, reload waiver from server
      loadLatestWaiver();
    }
  }, [loadLatestWaiver, isWaiverAuthenticated, markWaiverCompleted]);

  // Reset waiver flow to sign another waiver (used by admin and success screen)
  const resetWaiverFlow = useCallback(() => {
    logoutWaiverUser();
    setIsReturningUser(false);
    setConfirmResubmit(false);
    setCompletedWaiverData(null);
    setShowForm(false);
    setLoginInput('');
    setLoginError(null);
    setQuickSignError(null);
  }, [logoutWaiverUser]);

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
          childId: child.childId,
          name: child.name || `${child.first_name || ''} ${child.last_name || ''}`.trim(),
          birthDate: child.birthDate || child.birth_date,
          gender: child.gender,
        })),
        // Flag for quick re-sign - backend will only record visit if data unchanged
        quickResign: true,
      };

      const response = await apiPost<{
        id: number;
        waiverCode?: string;
        signedAt?: string;
        children?: Array<{ name: string }>;
      }, typeof payload>('/waivers', payload);
      setCompletedWaiverData({
        waiverCode: response.waiverCode ?? latestWaiver.waiverCode ?? '',
        childCount: latestWaiver.children?.length ?? 0,
        signedAt: response.signedAt ?? new Date().toISOString(),
        id: response.id ?? 0,
        guardianName: latestWaiver.guardianName ?? '',
        guardianEmail: latestWaiver.guardianEmail ?? '',
        guardianPhone: latestWaiver.guardianPhone ?? '',
        guardianDob: latestWaiver.guardianDateOfBirth ?? '',
        relationship: latestWaiver.relationshipToChildren ?? '',
        children: (latestWaiver.children ?? []).map((c) => ({
          name: c.name || '',
          birthDate: c.birthDate || c.birth_date || '',
          gender: c.gender,
        })),
      });
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
          listed children and stays on file for seven years.
        </p>
      </div>

      {/* Terms & Conditions */}
      <div className={styles.termsSection}>
        <img src="/images/logo-text.png" alt="Playfunia" className={styles.termsLogo} />

        <h2 className={styles.termsWarningHeader}>IMPORTANT – READ CAREFULLY</h2>
        <p className={styles.termsBold}>THIS IS A RELEASE OF LIABILITY AND WAIVER OF CERTAIN LEGAL RIGHTS.</p>
        <p className={styles.termsBold}>BY SIGNING THIS DOCUMENT, YOU MAY BE WAIVING CERTAIN LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE.</p>
        <p className={styles.termsText}>By signing this Agreement, you acknowledge that you have read, understood, and voluntarily agree to the terms contained herein. This document affects your legal rights and includes a <strong>release of liability, assumption of risk, and indemnification provisions</strong>.</p>
        <p className={styles.termsText}>If you are signing this Agreement on behalf of a minor, you acknowledge that you are the parent or legal guardian and that you are giving up certain legal rights on behalf of the child.</p>

        <h2 className={styles.termsMainTitle}>PLAYFUNIA PARTICIPANT WAIVER, RELEASE, ASSUMPTION OF RISK, AND INDEMNIFICATION AGREEMENT</h2>
        <p className={styles.termsText}>This Waiver, Release, Assumption of Risk, and Indemnification Agreement ("Release") is voluntarily executed by the Participant on the date this agreement is signed ("Effective Date").</p>
        <p className={styles.termsText}>This Release pertains to the use of the facilities at Playfunia and its affiliates, agents, owners, officers, managers, shareholders, volunteers, participants, employees, assigns, and all other persons or entities acting in any capacity on its respective or collective behalf (collectively referred to herein as "Releasees").</p>

        <h3 className={styles.termsSectionHeading}>1. General Release</h3>
        <p className={styles.termsText}>I acknowledge and agree that this Release is intended to release and provide legal protections and consideration to Releasees for any claims that arise at the Playfunia facility ("Playfunia Facility") or from the attractions at the Playfunia Facility ("Playfunia Attractions").</p>
        <p className={styles.termsText}>I agree to accept and assume all risks existing in the Playfunia Attractions and Facilities, both known and unknown, including those caused by negligent acts or omissions of Releasees.</p>
        <p className={styles.termsText}>I voluntarily release, forever discharge, indemnify, and hold harmless Releasees from any and all damages, claims, actions, liabilities, or demands arising from participation in Playfunia activities, except in cases of gross negligence or intentional misconduct.</p>
        <p className={styles.termsText}>I further agree that I am solely responsible for my personal property while at the Playfunia Facility.</p>

        <h3 className={styles.termsSectionHeading}>2. Release of Potential Injuries for Attractions</h3>
        <p className={styles.termsText}>I acknowledge and agree that the attractions at Playfunia include designated <strong>infant (0–2), toddler (2–7), and big kid (3–13) play areas</strong>.</p>
        <p className={styles.termsText}>Participants of <strong>all ages, including infants</strong>, may be present within the Playfunia Facility and may be participating in activities or observing others.</p>
        <p className={styles.termsText}>Playfunia attractions include, but are not limited to bridges, tunnels, igloos, honeycomb play structures, slides, balloon house, light-up wall, swings, monkey bars, zip lines, ball pits, revolving doors, foam pits, LED dance floor, battery-operated toy cars, castle structures, climbing nets, and other similar equipment.</p>
        <p className={styles.termsText}>I acknowledge that the children in my care and invited guests are physically, mentally, and emotionally capable of participating.</p>
        <p className={styles.termsText}>I understand that these activities involve inherent risks including serious injury, illness, infection, paralysis, death, and property damage.</p>

        <h3 className={styles.termsSectionHeading}>3. Release of Potential Infection of Disease and Viruses</h3>
        <p className={styles.termsText}>I acknowledge that Playfunia is a public environment where guests interact daily.</p>
        <p className={styles.termsText}>Despite reasonable cleaning practices, I understand that exposure to illness or viruses including <strong>COVID-19</strong> may occur.</p>
        <p className={styles.termsText}>I release Playfunia and the Releasees from any claim related to illness or infection resulting from participation in or presence at Playfunia.</p>

        <h3 className={styles.termsSectionHeading}>4. Voluntary Assumption of Risk</h3>
        <p className={styles.termsText}>I acknowledge that participation in Playfunia activities is voluntary and involves inherent risks.</p>
        <p className={styles.termsText}>These risks may include:</p>
        <ul className={styles.termsList}>
          <li>Paralysis or death</li>
          <li>Cuts, bruises, sprains, fractures or other injuries</li>
          <li>Injuries caused by falls or contact with equipment or participants</li>
          <li>Illness, allergic reactions, dehydration, or exertion-related events</li>
          <li>Injuries occurring while observing activities</li>
        </ul>
        <p className={styles.termsText}>I voluntarily assume all such risks.</p>

        <h3 className={styles.termsSectionHeading}>5. Agreement to Pay My Own Medical Expenses</h3>
        <p className={styles.termsText}>I acknowledge and accept responsibility for any medical conditions affecting participation.</p>
        <p className={styles.termsText}>If medical assistance is required as a result of participation, I agree that all medical expenses are my responsibility.</p>

        <h3 className={styles.termsSectionHeading}>6. Photo / Video / Social Media Waiver</h3>
        <p className={styles.termsText}>I consent to the recording of my or the Child's likeness and voice through photographs, video, or other digital recordings.</p>
        <p className={styles.termsText}>I grant Playfunia permission to use such recordings for <strong>social media, promotional materials, and non-commercial advertising</strong> related to Playfunia.</p>
        <p className={styles.termsText}>Separate written consent is required for commercial advertising campaigns.</p>

        <h3 className={styles.termsSectionHeading}>7. Parent or Guardian Consent</h3>
        <p className={styles.termsText}>If signing on behalf of a minor, I certify that I am the parent or legal guardian and have authority to execute this Agreement.</p>
        <p className={styles.termsText}>I acknowledge that I am giving up legal rights on behalf of both myself and the child.</p>

        <h3 className={styles.termsSectionHeading}>8. Parent or Guardian Indemnification</h3>
        <p className={styles.termsText}>By signing this Agreement on behalf of a minor, I agree to indemnify and hold harmless Playfunia and Releasees for any claims arising from the child's participation.</p>

        <h3 className={styles.termsSectionHeading}>9. Marketing Communications Consent</h3>
        <p className={styles.termsText}>By signing this waiver, I agree to receive occasional marketing communications via text message or email from Playfunia regarding promotions, offers, and events.</p>
        <p className={styles.termsText}>Message and data rates may apply.</p>
        <p className={styles.termsText}>I may unsubscribe at any time by replying STOP or using the unsubscribe link.</p>
        <p className={styles.termsText}>Consent to marketing communications <strong>is not a condition of participation</strong>.</p>

        <h3 className={styles.termsSectionHeading}>10. Governing Law and Venue</h3>
        <p className={styles.termsText}>This Agreement shall be governed by the laws of the <strong>State of New York</strong>.</p>
        <p className={styles.termsText}>Any legal action must be brought exclusively in courts located in <strong>Albany County, New York</strong>.</p>

        <h3 className={styles.termsSectionHeading}>11. Arbitration Agreement</h3>
        <p className={styles.termsText}>Any dispute relating to this Agreement shall be resolved through <strong>binding arbitration</strong> conducted in Albany County, New York in accordance with the rules of the <strong>American Arbitration Association</strong>.</p>

        <h3 className={styles.termsSectionHeading}>12. Waiver of Jury Trial</h3>
        <p className={styles.termsText}>Participant and Parent or Guardian knowingly waive the right to a <strong>trial by jury</strong> in any legal action relating to this Agreement.</p>

        <h3 className={styles.termsSectionHeading}>13. Severability</h3>
        <p className={styles.termsText}>If any provision of this Agreement is determined to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.</p>

        <h3 className={styles.termsSectionHeading}>14. Entire Agreement</h3>
        <p className={styles.termsText}>This Agreement constitutes the entire agreement between Participant and Playfunia regarding participation in Playfunia activities.</p>

        <h3 className={styles.termsSectionHeading}>15. Limitation Period for Claims</h3>
        <p className={styles.termsText}>Any claim relating to participation at Playfunia must be filed within <strong>one (1) year</strong> of the incident.</p>
        <p className={styles.termsText}>Claims filed after this period are permanently barred.</p>

        <h3 className={styles.termsSectionHeading}>16. Class Action Waiver</h3>
        <p className={styles.termsText}>Participant agrees that any claim must be brought <strong>only in an individual capacity</strong> and not as part of a class action or collective proceeding.</p>

        <h3 className={styles.termsSectionHeading}>17. Acknowledgment of Understanding</h3>
        <p className={styles.termsText}>I acknowledge that I have carefully read and fully understand this Agreement.</p>
        <p className={styles.termsText}>I understand that by signing this document I am <strong>releasing Playfunia from liability and giving up important legal rights, including the right to sue</strong>.</p>
        <p className={styles.termsText}>I am signing this Agreement voluntarily and intend it to be a <strong>complete and unconditional release of liability to the fullest extent permitted by law</strong>.</p>
        <p className={styles.termsText}>If signing on behalf of a minor, I certify that I have legal authority to do so.</p>
      </div>

      {user && !isAdmin ? (
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
                  <h3>Children covered ({latestWaiver?.children?.length || existingChildren.length})</h3>
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
                <PrimaryButton to={returnUrl ?? '/account'} className={styles.primaryAction}>
                  {returnUrl ? 'Continue' : 'Back to Account'}
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
          {waiverUser.hasCompletedWaiver ? (() => {
            const name = completedWaiverData?.guardianName || buildWaiverGuardianName(waiverUser) || '';
            const email = completedWaiverData?.guardianEmail || waiverUser.email || '';
            const phone = completedWaiverData?.guardianPhone || waiverUser.phone || '';
            const dob = completedWaiverData?.guardianDob || waiverUser.guardianDateOfBirth || '';
            const rel = completedWaiverData?.relationship || waiverUser.relationshipToMinor || '';
            const kids = completedWaiverData?.children?.length
              ? completedWaiverData.children
              : (waiverUser.children ?? []).map((c) => ({ name: c.name, birthDate: c.birthDate, gender: c.gender }));
            const kidCount = kids.length;
            const code = completedWaiverData?.waiverCode || '';
            const signedAt = completedWaiverData?.signedAt || new Date().toISOString();
            const signedFormatted = new Date(signedAt).toLocaleString('en-US', {
              timeZone: 'America/New_York',
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });

            return (
            <div className={styles.existingWaiverNotice}>
              <div className={styles.summaryHeader}>
                <h2>Waiver Signed Successfully</h2>
                <p>Your waiver has been submitted and a confirmation email with a PDF copy has been sent to <strong>{email}</strong>.</p>
              </div>

              {/* Waiver code highlight */}
              {code && (
                <div className={styles.confirmationCode}>{code}</div>
              )}

              {/* Stats row */}
              <div className={styles.confirmationStats}>
                <div className={styles.confirmationStat}>
                  <span className={styles.confirmationStatLabel}>Signed On</span>
                  <span className={styles.confirmationStatValue}>{signedFormatted}</span>
                </div>
                <div className={styles.confirmationStat}>
                  <span className={styles.confirmationStatLabel}>Children Covered</span>
                  <span className={styles.confirmationStatValue}>{kidCount}</span>
                </div>
              </div>

              {/* Guardian details */}
              <div className={styles.summaryBlock}>
                <h3>Parent / Guardian Details</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Full Name</span>
                    <span className={styles.detailValue}>{name}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Email</span>
                    <span className={styles.detailValue}>{email}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Phone</span>
                    <span className={styles.detailValue}>{phone}</span>
                  </div>
                  {dob && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Date of Birth</span>
                      <span className={styles.detailValue}>{formatBirthDate(dob)}</span>
                    </div>
                  )}
                  {rel && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Relationship</span>
                      <span className={styles.detailValue}>{rel}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Children */}
              <div className={styles.summaryBlock}>
                <h3>Children Covered ({kidCount})</h3>
                {kidCount > 0 ? (
                  <ul className={styles.childList}>
                    {kids.map((child, index) => (
                      <li key={`${child.name}-${index}`} className={styles.childItem}>
                        <span className={styles.childName}>{child.name}</span>
                        <span className={styles.childMeta}>
                          {child.birthDate ? formatBirthDate(child.birthDate) : 'Birth date not provided'}
                          {child.gender ? ` · ${child.gender}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.summarySecondary}>No children listed.</p>
                )}
              </div>

              <div className={styles.confirmationWarning}>
                Waivers must be completed on the same day as your visit.
              </div>
              <div className={styles.waiverActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={resetWaiverFlow}
                >
                  {isAdmin ? 'Sign another waiver' : 'Sign in with different email/phone'}
                </button>
              </div>
            </div>
            );
          })()
          : isReturningUser && !showForm ? (
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
                    {(latestWaiver?.children?.length || waiverUser?.children?.length) ? (
                      <ul className={styles.childList}>
                        {(latestWaiver?.children ?? waiverUser?.children ?? []).map((child, index) => (
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
                  <button type="button" className={styles.logoutButton} onClick={resetWaiverFlow}>
                    Use a different email/phone
                  </button>
                </div>
              </div>
            ) : (
              /* No previous waiver found - show form with saved user data */
              <WaiverForm
                key="new-waiver-user-form"
                returnUrl={returnUrl}
                initialGuardianName={buildWaiverGuardianName(waiverUser)}
                initialGuardianEmail={waiverUser?.email ?? ''}
                initialGuardianPhone={waiverUser?.phone ?? ''}
                initialGuardianDob={waiverUser?.guardianDateOfBirth ?? undefined}
                initialRelationship={waiverUser?.relationshipToMinor ?? undefined}
                initialMarketingOptIn={false}
                initialSignature={''}
                initialChildren={waiverUser?.children?.map((child, index) => ({
                  id: child.childId?.toString() ?? child.id ?? `child-${index}`,
                  childId: child.childId,
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
                initialGuardianName={latestWaiver?.guardianName ?? buildWaiverGuardianName(waiverUser)}
                initialGuardianEmail={latestWaiver?.guardianEmail ?? waiverUser?.email ?? ''}
                initialGuardianPhone={latestWaiver?.guardianPhone ?? waiverUser?.phone ?? ''}
                initialGuardianDob={latestWaiver?.guardianDateOfBirth ?? waiverUser?.guardianDateOfBirth ?? undefined}
                initialRelationship={latestWaiver?.relationshipToChildren ?? waiverUser?.relationshipToMinor ?? undefined}
                initialMarketingOptIn={latestWaiver?.marketingOptIn ?? false}
                initialSignature={latestWaiver?.signature ?? ''}
                initialChildren={waiverUser?.children?.map((child, index) => ({
                  id: child.childId?.toString() ?? child.id ?? `child-${index}`,
                  childId: child.childId,
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
              initialGuardianName={buildWaiverGuardianName(waiverUser)}
              initialGuardianEmail={waiverUser?.email ?? ''}
              initialGuardianPhone={waiverUser?.phone ?? ''}
              initialGuardianDob={waiverUser?.guardianDateOfBirth ?? undefined}
              initialRelationship={waiverUser?.relationshipToMinor ?? undefined}
              initialMarketingOptIn={false}
              initialSignature={''}
              initialChildren={waiverUser?.children?.map((child, index) => ({
                id: child.childId?.toString() ?? child.id ?? `child-${index}`,
                childId: child.childId,
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
        /* Not authenticated (or admin) - show email/phone login form */
        <div className={styles.authPrompt}>
          <h2>{isAdmin ? 'Sign waiver for a customer' : 'Enter your email or phone to continue'}</h2>
          <p>{isAdmin ? "Enter the customer's email or phone to look up or create their waiver." : "We'll check if you've already signed a waiver. No password required."}</p>

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

              // Validate email or phone format
              if (loginMode === 'email' && !isValidEmail(loginInput.trim())) {
                setLoginError('Please enter a valid email address');
                return;
              }
              if (loginMode === 'phone' && !isValidPhone(loginInput.trim())) {
                setLoginError('Please enter a valid 10-digit phone number');
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
              inputMode={loginMode === 'phone' ? 'numeric' : undefined}
              className={styles.loginInput}
              placeholder={loginMode === 'email' ? 'you@example.com' : '5551234567'}
              value={loginInput}
              onChange={(e) => {
                const value = loginMode === 'phone' ? formatPhoneInput(e.target.value) : e.target.value.trim();
                setLoginInput(value);
              }}
              required
              maxLength={loginMode === 'phone' ? 10 : 255}
              pattern={loginMode === 'phone' ? '\\d{10}' : undefined}
              title={loginMode === 'phone' ? '10-digit phone number' : undefined}
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
