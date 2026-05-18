import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiPost } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { isValidPhone } from '../../utils/validation';
import { toDateInputValue } from '../../lib/dateUtils';
import { PrimaryButton } from '../common/PrimaryButton';
import { SignaturePadModal } from './SignaturePadModal';
import styles from './WaiverForm.module.css';

interface ChildForm {
  id: string; // Frontend ID for React key
  childId?: number; // Database child_id for updates
  name: string;
  birthDate: string;
  gender: string;
}

interface FieldErrors {
  guardianName?: string;
  guardianPhone?: string;
  guardianDob?: string;
  relationship?: string;
  childErrors?: { [childId: string]: { name?: string; birthDate?: string } };
}

const TERMS_POLICY = 'terms_conditions';

const RELATIONSHIP_OPTIONS = ['Father', 'Mother', 'Other'] as const;

// Validation helpers
const isLettersOnly = (value: string): boolean => {
  // Allow letters (including accented), spaces, hyphens, and apostrophes for names
  return /^[A-Za-zÀ-ÿ\s'-]+$/.test(value);
};

// Get current date in New York timezone
const getNewYorkDate = (): { year: number; month: number; day: number } => {
  const nyDate = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [month, day, year] = nyDate.split('/').map(Number);
  return { year, month: month - 1, day }; // month is 0-indexed for consistency
};

const getNewYorkDateIso = (): string => {
  const { year, month, day } = getNewYorkDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const calculateAge = (birthDate: string): number => {
  const today = getNewYorkDate();
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  let age = today.year - birthYear;
  const monthDiff = today.month - (birthMonth - 1);
  if (monthDiff < 0 || (monthDiff === 0 && today.day < birthDay)) {
    age--;
  }
  return age;
};

const isParentAgeValid = (birthDate: string): boolean => {
  return calculateAge(birthDate) >= 18;
};

const isChildAgeValid = (birthDate: string): boolean => {
  const age = calculateAge(birthDate);
  return age >= 0 && age <= 13;
};

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

interface InitialChild {
  id?: string; // Can be database child_id as string
  childId?: number; // Database child_id as number
  name?: string;
  birthDate?: string;
  gender?: string;
}

export interface WaiverResult {
  waiverCode: string;
  childCount: number;
  signedAt: string;
  id: number;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianDob: string;
  relationship: string;
  children: Array<{ name: string; birthDate: string; gender?: string }>;
}

interface WaiverFormProps {
  returnUrl?: string;
  initialGuardianName?: string;
  initialGuardianEmail?: string;
  initialGuardianPhone?: string;
  initialGuardianDob?: string;
  initialRelationship?: string;
  initialMarketingOptIn?: boolean;
  initialSignature?: string;
  initialChildren?: InitialChild[];
  onSubmitted?: (data: WaiverResult) => void;
  onGoBack?: () => void;
}

export function WaiverForm({
  returnUrl,
  initialGuardianName,
  initialGuardianEmail,
  initialGuardianPhone,
  initialGuardianDob,
  initialRelationship,
  initialMarketingOptIn,
  initialSignature,
  initialChildren,
  onSubmitted,
  onGoBack,
}: WaiverFormProps) {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fallbackName = user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : '';
  const defaultGuardianName = (initialGuardianName ?? fallbackName).trim();
  const defaultGuardianEmail = initialGuardianEmail ?? user?.email ?? '';
  const defaultGuardianPhone = user?.phone ?? '';
  const defaultSignature = ((initialSignature ?? defaultGuardianName) || fallbackName).trim();
  const todayIso = getNewYorkDateIso();

  const initialChildrenRef = useRef<ChildForm[]>(
    (initialChildren && initialChildren.length > 0
      ? initialChildren
      : [{ id: undefined, name: '', birthDate: '', gender: '' }]
    ).map((child) => {
      // Parse childId from either childId field or id field (if numeric)
      const parsedChildId = child.childId ?? (child.id ? parseInt(child.id, 10) : undefined);
      const childId = parsedChildId && !isNaN(parsedChildId) ? parsedChildId : undefined;
      return {
        id: child.id ?? createId(),
        childId,
        name: (child.name ?? '').trim(),
        birthDate: toDateInputValue(child.birthDate),
        gender: child.gender ?? '',
      };
    })
  );

  const initialValuesRef = useRef({
    guardianName: defaultGuardianName,
    guardianEmail: defaultGuardianEmail,
    guardianPhone: (initialGuardianPhone ?? defaultGuardianPhone).trim(),
    guardianDob: toDateInputValue(initialGuardianDob),
    relationship: initialRelationship ?? '',
    marketingOptIn: initialMarketingOptIn ?? false,
    signature: defaultSignature,
  });

  const [guardianName, setGuardianName] = useState(initialValuesRef.current.guardianName);
  const [guardianEmail, setGuardianEmail] = useState(initialValuesRef.current.guardianEmail);
  const [guardianPhone, setGuardianPhone] = useState(initialValuesRef.current.guardianPhone);
  const [guardianDob, setGuardianDob] = useState(initialValuesRef.current.guardianDob);
  const [relationship, setRelationship] = useState(initialValuesRef.current.relationship);
  const [marketingOptIn, setMarketingOptIn] = useState(initialValuesRef.current.marketingOptIn);
  const [children, setChildren] = useState<ChildForm[]>(() =>
    initialChildrenRef.current.map((child) => ({ ...child }))
  );
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({
    type: 'idle',
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const addChild = () => {
    setChildren((prev) => [...prev, { id: createId(), childId: undefined, name: '', birthDate: '', gender: '' }]);
  };

  const removeChild = (id: string) => {
    setChildren((prev) => (prev.length === 1 ? prev : prev.filter((child) => child.id !== id)));
  };

  const updateChild = (id: string, field: keyof ChildForm, value: string) => {
    setChildren((prev) =>
      prev.map((child) => (child.id === id ? { ...child, [field]: value } : child))
    );
  };

  const resetForm = () => {
    setGuardianName(initialValuesRef.current.guardianName);
    setGuardianEmail(initialValuesRef.current.guardianEmail);
    setGuardianPhone(initialValuesRef.current.guardianPhone);
    setGuardianDob(initialValuesRef.current.guardianDob);
    setRelationship(initialValuesRef.current.relationship);
    setMarketingOptIn(initialValuesRef.current.marketingOptIn);
    setChildren(initialChildrenRef.current.map((child) => ({ ...child })));
    setAcceptTerms(false);
    setSignatureImage(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ type: 'idle' });
    setFieldErrors({});

    const errors: FieldErrors = {};

    // Validate guardian name (letters only)
    if (!guardianName.trim()) {
      errors.guardianName = 'Guardian name is required.';
    } else if (!isLettersOnly(guardianName.trim())) {
      errors.guardianName = 'Name must contain only letters, spaces, hyphens, or apostrophes.';
    }

    // Validate email
    if (!guardianEmail.trim()) {
      setStatus({ type: 'error', message: 'Email address is required.' });
      return;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail.trim())) {
      setStatus({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    // Validate phone (exactly 10 digits)
    if (!guardianPhone.trim()) {
      errors.guardianPhone = 'Phone number is required.';
    } else if (!isValidPhone(guardianPhone)) {
      errors.guardianPhone = 'Phone number must be exactly 10 digits.';
    }

    // Validate guardian date of birth (18+ years)
    if (!guardianDob) {
      errors.guardianDob = 'Date of birth is required.';
    } else if (!isParentAgeValid(guardianDob)) {
      errors.guardianDob = 'Parent/Guardian must be at least 18 years old.';
    }

    // Validate relationship (select dropdown, so only check presence)
    if (!relationship.trim()) {
      errors.relationship = 'Relationship is required.';
    }

    if (!signatureImage) {
      setStatus({ type: 'error', message: 'Please provide your signature using the signature pad.' });
      return;
    }

    if (!acceptTerms) {
      setStatus({ type: 'error', message: 'You must agree to the terms and conditions.' });
      return;
    }

    // Validate that all children have required fields
    const validChildren = children.filter(
      (child) => child.name.trim() && child.birthDate
    );
    if (validChildren.length === 0) {
      setStatus({ type: 'error', message: 'Please add at least one child with name and birth date.' });
      return;
    }

    // Check for incomplete children entries
    const incompleteChildren = children.some(
      (child) => (child.name.trim() && !child.birthDate) || (!child.name.trim() && child.birthDate)
    );
    if (incompleteChildren) {
      setStatus({ type: 'error', message: 'Please complete all child entries or remove incomplete ones.' });
      return;
    }

    // Validate children (name letters only, age 0-13)
    const childErrors: { [childId: string]: { name?: string; birthDate?: string } } = {};
    for (const child of children) {
      if (child.name.trim() || child.birthDate) {
        const childErr: { name?: string; birthDate?: string } = {};

        if (child.name.trim() && !isLettersOnly(child.name.trim())) {
          childErr.name = 'Child name must contain only letters.';
        }

        if (child.birthDate && !isChildAgeValid(child.birthDate)) {
          childErr.birthDate = 'Child age must be between 0 and 13 years.';
        }

        if (childErr.name || childErr.birthDate) {
          childErrors[child.id] = childErr;
        }
      }
    }

    if (Object.keys(childErrors).length > 0) {
      errors.childErrors = childErrors;
    }

    // If there are any validation errors, show them and return
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus({ type: 'error', message: 'Please correct the errors below.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        guardianName: guardianName.trim(),
        guardianEmail: guardianEmail.trim(),
        guardianPhone: guardianPhone.trim(),
        guardianDob,
        relationshipToChildren: relationship.trim(),
        signature: guardianName.trim(),
        signatureImage,
        acceptedPolicies: [TERMS_POLICY],
        marketingOptIn,
        children: validChildren.map((child) => ({
          childId: child.childId,
          name: child.name.trim(),
          birthDate: child.birthDate,
          gender: child.gender || undefined,
        })),
      };

      const response = await apiPost<{
        id: number;
        waiverCode?: string;
        signedAt?: string;
        children?: Array<{ name: string }>;
      }, typeof payload>('/waivers', payload);
      await refreshProfile();
      initialValuesRef.current = {
        guardianName,
        guardianEmail,
        guardianPhone,
        guardianDob,
        relationship,
        signature: guardianName,
        marketingOptIn,
      };
      initialChildrenRef.current = children.map((child) => ({ ...child }));
      setStatus({ type: 'success', message: 'Waiver submitted successfully!' });
      if (onSubmitted) {
        const waiverResult: WaiverResult = {
          waiverCode: response.waiverCode ?? '',
          childCount: validChildren.length,
          signedAt: response.signedAt ?? new Date().toISOString(),
          id: response.id ?? 0,
          guardianName: guardianName.trim(),
          guardianEmail: guardianEmail.trim(),
          guardianPhone: guardianPhone.trim(),
          guardianDob,
          relationship: relationship.trim(),
          children: validChildren.map((c) => ({
            name: c.name.trim(),
            birthDate: c.birthDate,
            gender: c.gender || undefined,
          })),
        };
        // Let parent handle navigation
        setTimeout(() => {
          onSubmitted(waiverResult);
        }, 1500);
      } else {
        // Redirect after a short delay to show success message
        setTimeout(() => {
          navigate(returnUrl ?? '/');
        }, 1500);
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unexpected error submitting waiver.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {onGoBack && (
        <button type="button" className={styles.backButton} onClick={onGoBack}>
          &larr; Go Back
        </button>
      )}

      <div className={styles.section}>
        <h2>Parent / Guardian information</h2>
        <div className={styles.grid}>
          <label>
            Full name <span className={styles.required}>*</span>
            <input
              type="text"
              value={guardianName}
              onChange={(event) => setGuardianName(event.target.value.replace(/[^A-Za-zÀ-ÿ\s'-]/g, ''))}
              required
              maxLength={200}
              pattern="[A-Za-zÀ-ÿ\s'\-]+"
              title="Letters, spaces, hyphens, and apostrophes only"
              autoComplete="name"
              className={fieldErrors.guardianName ? styles.inputError : ''}
            />
            {fieldErrors.guardianName && (
              <span className={styles.fieldError}>{fieldErrors.guardianName}</span>
            )}
          </label>
          <label>
            Email address <span className={styles.required}>*</span>
            <input
              type="email"
              value={guardianEmail}
              onChange={(event) => setGuardianEmail(event.target.value)}
              required
              maxLength={255}
              autoComplete="email"
            />
          </label>
          <label>
            Mobile phone (10 digits) <span className={styles.required}>*</span>
            <input
              type="tel"
              inputMode="numeric"
              value={guardianPhone}
              onChange={(event) => setGuardianPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
              required
              maxLength={10}
              pattern="\d{10}"
              title="10-digit phone number"
              placeholder="e.g., 5551234567"
              autoComplete="tel"
              className={fieldErrors.guardianPhone ? styles.inputError : ''}
            />
            {fieldErrors.guardianPhone && (
              <span className={styles.fieldError}>{fieldErrors.guardianPhone}</span>
            )}
          </label>
          <label>
            Date of birth <span className={styles.required}>*</span>
            <input
              type="date"
              max={todayIso}
              value={guardianDob}
              onChange={(event) => setGuardianDob(event.target.value)}
              required
              className={fieldErrors.guardianDob ? styles.inputError : ''}
            />
            {fieldErrors.guardianDob && (
              <span className={styles.fieldError}>{fieldErrors.guardianDob}</span>
            )}
          </label>
          <label>
            Relationship to child(ren) <span className={styles.required}>*</span>
            <select
              value={relationship}
              onChange={(event) => setRelationship(event.target.value)}
              required
              className={fieldErrors.relationship ? styles.inputError : ''}
            >
              <option value="">Select relationship</option>
              {RELATIONSHIP_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {fieldErrors.relationship && (
              <span className={styles.fieldError}>{fieldErrors.relationship}</span>
            )}
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <h2>Children covered by this waiver</h2>
        <p className={styles.helper}>Add each child who will be playing at Playfunia. Children must be 0-13 years old.</p>
        <div className={styles.childrenList}>
          {children.map((child) => (
            <div key={child.id} className={styles.childRow}>
              <label>
                Child name <span className={styles.required}>*</span>
                <input
                  type="text"
                  value={child.name}
                  onChange={(event) => updateChild(child.id, 'name', event.target.value.replace(/[^A-Za-zÀ-ÿ\s'-]/g, ''))}
                  required
                  maxLength={100}
                  pattern="[A-Za-zÀ-ÿ\s'\-]+"
                  title="Letters, spaces, hyphens, and apostrophes only"
                  className={fieldErrors.childErrors?.[child.id]?.name ? styles.inputError : ''}
                />
                {fieldErrors.childErrors?.[child.id]?.name && (
                  <span className={styles.fieldError}>{fieldErrors.childErrors[child.id].name}</span>
                )}
              </label>
              <label>
                Birth date <span className={styles.required}>*</span>
                <input
                  type="date"
                  max={todayIso}
                  value={child.birthDate}
                  onChange={(event) => updateChild(child.id, 'birthDate', event.target.value)}
                  required
                  className={fieldErrors.childErrors?.[child.id]?.birthDate ? styles.inputError : ''}
                />
                {fieldErrors.childErrors?.[child.id]?.birthDate && (
                  <span className={styles.fieldError}>{fieldErrors.childErrors[child.id].birthDate}</span>
                )}
              </label>
              <label>
                Gender (optional)
                <select
                  value={child.gender}
                  onChange={(event) => updateChild(child.id, 'gender', event.target.value)}
                >
                  <option value="">Prefer not to say</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              {children.length > 1 && (
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeChild(child.id)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className={styles.addButton} onClick={addChild}>
          + Add another child
        </button>
      </div>

      <div className={styles.section}>
        <h2>Agreements</h2>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(event) => setAcceptTerms(event.target.checked)}
          />
          I agree to the Playfunia Terms & Conditions and understand the assumption of risk.
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(event) => setMarketingOptIn(event.target.checked)}
          />
          <span className={styles.smsConsentText}>
            By providing your phone number and checking this box, you consent to receive transactional text messages from Playfunia (e.g., waiver confirmations, booking reminders, ticket codes, and membership alerts). Consent is not a condition of purchase. Msg &amp; data rates may apply. Msg frequency varies. Reply STOP to unsubscribe at any time. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> &amp; <a href="/waiver-policy" target="_blank" rel="noopener noreferrer">Terms</a>.
          </span>
        </label>
      </div>

      <div className={styles.section}>
        <h2>Signature <span className={styles.required}>*</span></h2>
        {signatureImage ? (
          <div className={styles.signaturePreview}>
            <img
              src={signatureImage}
              alt="Your signature"
              className={styles.signaturePreviewImage}
            />
            <button
              type="button"
              className={styles.resignButton}
              onClick={() => setSignaturePadOpen(true)}
            >
              Re-sign
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.signButton}
            onClick={() => setSignaturePadOpen(true)}
          >
            Tap to Sign
          </button>
        )}
        <p className={styles.helperSmall}>
          Your handwritten signature will be captured and included in the waiver document.
        </p>
      </div>

      <SignaturePadModal
        open={signaturePadOpen}
        onClose={() => setSignaturePadOpen(false)}
        onAccept={(dataUrl) => {
          setSignatureImage(dataUrl);
          setSignaturePadOpen(false);
        }}
      />

      {status.type === 'error' ? <p className={styles.error}>{status.message}</p> : null}
      {status.type === 'success' ? <p className={styles.success}>{status.message}</p> : null}

      <PrimaryButton type="submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit waiver'}
      </PrimaryButton>
    </form>
  );
}
