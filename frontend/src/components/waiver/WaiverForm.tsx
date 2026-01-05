import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiPost } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PrimaryButton } from '../common/PrimaryButton';
import styles from './WaiverForm.module.css';

interface ChildForm {
  id: string;
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

const isValidPhone = (value: string): boolean => {
  // Extract only digits from the phone number
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.length === 10;
};

const calculateAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
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
  id?: string;
  name?: string;
  birthDate?: string;
  gender?: string;
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
  onSubmitted?: () => void;
  onGoBack?: () => void;
}

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
  const todayIso = new Date().toISOString().slice(0, 10);

  const initialChildrenRef = useRef<ChildForm[]>(
    (initialChildren && initialChildren.length > 0
      ? initialChildren
      : [{ id: undefined, name: '', birthDate: '', gender: '' }]
    ).map((child) => ({
      id: child.id ?? createId(),
      name: (child.name ?? '').trim(),
      birthDate: toDateInputValue(child.birthDate),
      gender: child.gender ?? '',
    }))
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
  const [signature, setSignature] = useState(initialValuesRef.current.signature);
  const [guardianPhone, setGuardianPhone] = useState(initialValuesRef.current.guardianPhone);
  const [guardianDob, setGuardianDob] = useState(initialValuesRef.current.guardianDob);
  const [relationship, setRelationship] = useState(initialValuesRef.current.relationship);
  const [marketingOptIn, setMarketingOptIn] = useState(initialValuesRef.current.marketingOptIn);
  const [children, setChildren] = useState<ChildForm[]>(() =>
    initialChildrenRef.current.map((child) => ({ ...child }))
  );
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({
    type: 'idle',
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const addChild = () => {
    setChildren((prev) => [...prev, { id: createId(), name: '', birthDate: '', gender: '' }]);
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
    setSignature(initialValuesRef.current.signature);
    setGuardianPhone(initialValuesRef.current.guardianPhone);
    setGuardianDob(initialValuesRef.current.guardianDob);
    setRelationship(initialValuesRef.current.relationship);
    setMarketingOptIn(initialValuesRef.current.marketingOptIn);
    setChildren(initialChildrenRef.current.map((child) => ({ ...child })));
    setAcceptTerms(false);
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

    // Validate relationship
    if (!relationship.trim()) {
      errors.relationship = 'Relationship is required.';
    } else if (!isLettersOnly(relationship.trim())) {
      errors.relationship = 'Relationship must contain only letters.';
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
        signature: signature.trim(),
        acceptedPolicies: [TERMS_POLICY],
        marketingOptIn,
        children: validChildren.map((child) => ({
          name: child.name.trim(),
          birthDate: child.birthDate,
          gender: child.gender || undefined,
        })),
      };

      await apiPost('/waivers', payload);
      await refreshProfile();
      initialValuesRef.current = {
        guardianName,
        guardianEmail,
        guardianPhone,
        guardianDob,
        relationship,
        signature,
        marketingOptIn,
      };
      initialChildrenRef.current = children.map((child) => ({ ...child }));
      setStatus({ type: 'success', message: 'Waiver submitted successfully!' });
      resetForm();
      if (onSubmitted) {
        // Let parent handle navigation
        setTimeout(() => {
          onSubmitted();
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
            Full name
            <input
              type="text"
              value={guardianName}
              onChange={(event) => setGuardianName(event.target.value)}
              required
              className={fieldErrors.guardianName ? styles.inputError : ''}
            />
            {fieldErrors.guardianName && (
              <span className={styles.fieldError}>{fieldErrors.guardianName}</span>
            )}
          </label>
          <label>
            Email address
            <input
              type="email"
              value={guardianEmail}
              onChange={(event) => setGuardianEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Mobile phone (10 digits)
            <input
              type="tel"
              inputMode="tel"
              value={guardianPhone}
              onChange={(event) => setGuardianPhone(event.target.value)}
              required
              placeholder="e.g., 5551234567"
              className={fieldErrors.guardianPhone ? styles.inputError : ''}
            />
            {fieldErrors.guardianPhone && (
              <span className={styles.fieldError}>{fieldErrors.guardianPhone}</span>
            )}
          </label>
          <label>
            Date of birth
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
            Relationship to attending child(ren)
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
                Child name
                <input
                  type="text"
                  value={child.name}
                  onChange={(event) => updateChild(child.id, 'name', event.target.value)}
                  required
                  className={fieldErrors.childErrors?.[child.id]?.name ? styles.inputError : ''}
                />
                {fieldErrors.childErrors?.[child.id]?.name && (
                  <span className={styles.fieldError}>{fieldErrors.childErrors[child.id].name}</span>
                )}
              </label>
              <label>
                Birth date
                <input
                  type="date"
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
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeChild(child.id)}
              >
                Remove
              </button>
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
          I would like to receive updates about promotions and events.
        </label>
      </div>

      <div className={styles.section}>
        <h2>Signature</h2>
        <label>
          Type your full name
          <input
            type="text"
            value={signature}
            onChange={(event) => setSignature(event.target.value)}
            required
          />
        </label>
        <p className={styles.helperSmall}>Typing your name serves as your digital signature.</p>
      </div>

      {status.type === 'error' ? <p className={styles.error}>{status.message}</p> : null}
      {status.type === 'success' ? <p className={styles.success}>{status.message}</p> : null}

      <PrimaryButton type="submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit waiver'}
      </PrimaryButton>
    </form>
  );
}
