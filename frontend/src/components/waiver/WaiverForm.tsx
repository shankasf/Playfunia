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

interface AdultForm {
  id: string; // Frontend ID for React key
  name: string;
  signatureImage: string | null;
}

type PersonErrors = { [id: string]: { name?: string; birthDate?: string } };

interface FieldErrors {
  guardianName?: string;
  guardianPhone?: string;
  guardianDob?: string;
  relationship?: string;
  childErrors?: PersonErrors;
  hasTeens?: string;
  teenErrors?: PersonErrors;
  adultErrors?: { [adultId: string]: { name?: string; signature?: string } };
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

// Kids are 0-12, teens 13-17; anyone 18+ is an adult who signs for themselves
const KID_MAX_AGE = 12;
const TEEN_MIN_AGE = 13;
const TEEN_MAX_AGE = 17;
const ADULT_AGE_MESSAGE = 'Anyone 18 or older must be added as an adult below and sign for themselves.';

const kidAgeError = (birthDate: string): string | undefined => {
  const age = calculateAge(birthDate);
  if (age > TEEN_MAX_AGE) return ADULT_AGE_MESSAGE;
  if (age > KID_MAX_AGE) return 'Kids must be 0-12 years old. Add ages 13-17 in the teen section below.';
  if (age < 0) return 'Birth date cannot be in the future.';
  return undefined;
};

const teenAgeError = (birthDate: string): string | undefined => {
  const age = calculateAge(birthDate);
  if (age > TEEN_MAX_AGE) return ADULT_AGE_MESSAGE;
  if (age < TEEN_MIN_AGE) return 'Teens must be 13-17 years old. Add younger children in the kids section above.';
  return undefined;
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
  teens?: Array<{ name: string; birthDate: string; gender?: string }>;
  additionalAdults?: Array<{ name: string }>;
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
  initialTeens?: InitialChild[];
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
  initialTeens,
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

  const toChildForm = (child: InitialChild): ChildForm => {
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
  };
  // Saved minors are re-sorted by today's age, so a kid who has turned 13 moves to the teen list
  const savedMinors = [...(initialChildren ?? []), ...(initialTeens ?? [])].map(toChildForm);
  const isSavedTeen = (child: ChildForm) => Boolean(child.birthDate) && calculateAge(child.birthDate) >= TEEN_MIN_AGE;
  const savedKids = savedMinors.filter((child) => !isSavedTeen(child));
  const savedTeens = savedMinors.filter(isSavedTeen);
  const blankMinor = (): ChildForm => ({ id: createId(), childId: undefined, name: '', birthDate: '', gender: '' });

  const initialChildrenRef = useRef<ChildForm[]>(savedKids.length > 0 ? savedKids : [blankMinor()]);
  const initialTeensRef = useRef<ChildForm[]>(savedTeens);

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
  // Teens question must be answered each time: 'yes' | 'no' | '' (unanswered)
  const [hasTeens, setHasTeens] = useState<'yes' | 'no' | ''>(initialTeensRef.current.length > 0 ? 'yes' : '');
  const [teens, setTeens] = useState<ChildForm[]>(() =>
    initialTeensRef.current.length > 0 ? initialTeensRef.current.map((teen) => ({ ...teen })) : [blankMinor()]
  );
  // Additional adults always start empty: nobody's signature is carried over from a past visit
  const [adults, setAdults] = useState<AdultForm[]>([]);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  // Whose signature the pad is capturing: 'guardian' or an additional adult's id
  const [signingFor, setSigningFor] = useState<string | null>(null);
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

  const addTeen = () => {
    setTeens((prev) => [...prev, blankMinor()]);
  };

  const removeTeen = (id: string) => {
    setTeens((prev) => (prev.length === 1 ? prev : prev.filter((teen) => teen.id !== id)));
  };

  const updateTeen = (id: string, field: keyof ChildForm, value: string) => {
    setTeens((prev) => prev.map((teen) => (teen.id === id ? { ...teen, [field]: value } : teen)));
  };

  const addAdult = () => {
    setAdults((prev) => [...prev, { id: createId(), name: '', signatureImage: null }]);
  };

  const removeAdult = (id: string) => {
    setAdults((prev) => prev.filter((adult) => adult.id !== id));
  };

  // Changing an adult's name clears their signature, so it always belongs to the named person
  const updateAdultName = (id: string, name: string) => {
    setAdults((prev) => prev.map((adult) => (adult.id === id ? { ...adult, name, signatureImage: null } : adult)));
  };

  const signingAdult = signingFor && signingFor !== 'guardian'
    ? adults.find((adult) => adult.id === signingFor)
    : undefined;

  const resetForm = () => {
    setGuardianName(initialValuesRef.current.guardianName);
    setGuardianEmail(initialValuesRef.current.guardianEmail);
    setGuardianPhone(initialValuesRef.current.guardianPhone);
    setGuardianDob(initialValuesRef.current.guardianDob);
    setRelationship(initialValuesRef.current.relationship);
    setMarketingOptIn(initialValuesRef.current.marketingOptIn);
    setChildren(initialChildrenRef.current.map((child) => ({ ...child })));
    setHasTeens(initialTeensRef.current.length > 0 ? 'yes' : '');
    setTeens(initialTeensRef.current.length > 0 ? initialTeensRef.current.map((teen) => ({ ...teen })) : [blankMinor()]);
    setAdults([]);
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

    // Teens question must be answered
    if (!hasTeens) {
      errors.hasTeens = 'Please answer whether any teens (ages 13-17) are with you.';
    }
    const activeTeens = hasTeens === 'yes' ? teens : [];

    const validChildren = children.filter((child) => child.name.trim() && child.birthDate);
    const validTeens = activeTeens.filter((teen) => teen.name.trim() && teen.birthDate);

    // Check for incomplete kid/teen entries
    const isIncomplete = (person: ChildForm) =>
      (person.name.trim() && !person.birthDate) || (!person.name.trim() && person.birthDate);
    if (children.some(isIncomplete) || activeTeens.some(isIncomplete)) {
      setStatus({ type: 'error', message: 'Please complete all child and teen entries or remove incomplete ones.' });
      return;
    }

    if (hasTeens === 'yes' && validTeens.length === 0) {
      errors.hasTeens = 'Add each teen (ages 13-17) with their name and birth date, or answer No.';
    }

    if (hasTeens && validChildren.length + validTeens.length === 0) {
      setStatus({ type: 'error', message: 'Please add at least one child or teen with name and birth date.' });
      return;
    }

    // Validate kids (name letters only, age 0-12) and teens (age 13-17)
    const validatePeople = (people: ChildForm[], ageError: (birthDate: string) => string | undefined) => {
      const peopleErrors: PersonErrors = {};
      for (const person of people) {
        if (!person.name.trim() && !person.birthDate) continue;
        const personErr: { name?: string; birthDate?: string } = {};
        if (person.name.trim() && !isLettersOnly(person.name.trim())) {
          personErr.name = 'Name must contain only letters.';
        }
        if (person.birthDate) {
          personErr.birthDate = ageError(person.birthDate);
        }
        if (personErr.name || personErr.birthDate) {
          peopleErrors[person.id] = personErr;
        }
      }
      return peopleErrors;
    };

    const childErrors = validatePeople(children, kidAgeError);
    if (Object.keys(childErrors).length > 0) {
      errors.childErrors = childErrors;
    }
    const teenErrors = validatePeople(activeTeens, teenAgeError);
    if (Object.keys(teenErrors).length > 0) {
      errors.teenErrors = teenErrors;
    }

    // Every additional adult needs a name and their own signature, and appears once
    const adultErrors: NonNullable<FieldErrors['adultErrors']> = {};
    const seenAdultNames = new Set([guardianName.trim().toLowerCase()]);
    for (const adult of adults) {
      const adultErr: { name?: string; signature?: string } = {};
      const name = adult.name.trim();
      if (!name) {
        adultErr.name = 'Full name is required.';
      } else if (!isLettersOnly(name)) {
        adultErr.name = 'Name must contain only letters, spaces, hyphens, or apostrophes.';
      } else if (seenAdultNames.has(name.toLowerCase())) {
        adultErr.name = 'This person is already on the waiver. Each adult is listed once.';
      }
      if (name) seenAdultNames.add(name.toLowerCase());
      if (!adult.signatureImage) {
        adultErr.signature = `${name || 'This adult'} must sign for themselves.`;
      }
      if (adultErr.name || adultErr.signature) {
        adultErrors[adult.id] = adultErr;
      }
    }
    if (Object.keys(adultErrors).length > 0) {
      errors.adultErrors = adultErrors;
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
        teens: validTeens.map((teen) => ({
          childId: teen.childId,
          name: teen.name.trim(),
          birthDate: teen.birthDate,
          gender: teen.gender || undefined,
        })),
        additionalAdults: adults.map((adult) => ({
          name: adult.name.trim(),
          signatureImage: adult.signatureImage as string,
        })),
      };

      const response = await apiPost<{
        id: number;
        waiverCode?: string;
        signedAt?: string;
        children?: Array<{ name: string }>;
      }, typeof payload>('/waivers', payload, undefined, { preferWaiverToken: true });
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
      initialTeensRef.current = validTeens.map((teen) => ({ ...teen }));
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
          teens: validTeens.map((t) => ({
            name: t.name.trim(),
            birthDate: t.birthDate,
            gender: t.gender || undefined,
          })),
          additionalAdults: adults.map((a) => ({ name: a.name.trim() })),
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
        <p className={styles.helper}>Add each child who will be playing at Playfunia. Children must be 0-12 years old.</p>
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
        <h2>Teens (ages 13-17)</h2>
        <fieldset className={styles.questionGroup}>
          <legend className={styles.questionLabel}>
            Are there any teens (ages 13-17) with you? You must add them here. <span className={styles.required}>*</span>
          </legend>
          <div className={styles.choiceRow}>
            <label className={`${styles.choice} ${hasTeens === 'yes' ? styles.choiceActive : ''}`}>
              <input
                type="radio"
                name="hasTeens"
                value="yes"
                checked={hasTeens === 'yes'}
                onChange={() => setHasTeens('yes')}
              />
              Yes
            </label>
            <label className={`${styles.choice} ${hasTeens === 'no' ? styles.choiceActive : ''}`}>
              <input
                type="radio"
                name="hasTeens"
                value="no"
                checked={hasTeens === 'no'}
                onChange={() => setHasTeens('no')}
              />
              No
            </label>
          </div>
          {fieldErrors.hasTeens && <span className={styles.fieldError}>{fieldErrors.hasTeens}</span>}
        </fieldset>
        {hasTeens === 'yes' && (
          <>
            <p className={styles.helper}>
              The parent/guardian signs for each teen. Anyone 18 or older must be added as an adult below.
            </p>
            <div className={styles.childrenList}>
              {teens.map((teen) => (
                <div key={teen.id} className={styles.childRow}>
                  <label>
                    Teen name <span className={styles.required}>*</span>
                    <input
                      type="text"
                      value={teen.name}
                      onChange={(event) => updateTeen(teen.id, 'name', event.target.value.replace(/[^A-Za-zÀ-ÿ\s'-]/g, ''))}
                      required
                      maxLength={100}
                      pattern="[A-Za-zÀ-ÿ\s'\-]+"
                      title="Letters, spaces, hyphens, and apostrophes only"
                      className={fieldErrors.teenErrors?.[teen.id]?.name ? styles.inputError : ''}
                    />
                    {fieldErrors.teenErrors?.[teen.id]?.name && (
                      <span className={styles.fieldError}>{fieldErrors.teenErrors[teen.id].name}</span>
                    )}
                  </label>
                  <label>
                    Birth date <span className={styles.required}>*</span>
                    <input
                      type="date"
                      max={todayIso}
                      value={teen.birthDate}
                      onChange={(event) => updateTeen(teen.id, 'birthDate', event.target.value)}
                      required
                      className={fieldErrors.teenErrors?.[teen.id]?.birthDate ? styles.inputError : ''}
                    />
                    {fieldErrors.teenErrors?.[teen.id]?.birthDate && (
                      <span className={styles.fieldError}>{fieldErrors.teenErrors[teen.id].birthDate}</span>
                    )}
                  </label>
                  <label>
                    Gender (optional)
                    <select
                      value={teen.gender}
                      onChange={(event) => updateTeen(teen.id, 'gender', event.target.value)}
                    >
                      <option value="">Prefer not to say</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  {teens.length > 1 && (
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => removeTeen(teen.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className={styles.addButton} onClick={addTeen}>
              + Add another teen
            </button>
          </>
        )}
      </div>

      <div className={styles.section}>
        <h2>Other adults (18+)</h2>
        <p className={styles.helper}>
          Every adult who enters must be on the waiver. Each adult signs for themselves on this device &mdash;
          one adult cannot sign for another.
        </p>
        {adults.length > 0 && (
          <div className={styles.childrenList}>
            {adults.map((adult, index) => {
              const adultError = fieldErrors.adultErrors?.[adult.id];
              const displayName = adult.name.trim() || `Adult ${index + 2}`;
              return (
                <div key={adult.id} className={styles.adultRow}>
                  <label>
                    Full name <span className={styles.required}>*</span>
                    <input
                      type="text"
                      value={adult.name}
                      onChange={(event) => updateAdultName(adult.id, event.target.value.replace(/[^A-Za-zÀ-ÿ\s'-]/g, ''))}
                      required
                      maxLength={200}
                      pattern="[A-Za-zÀ-ÿ\s'\-]+"
                      title="Letters, spaces, hyphens, and apostrophes only"
                      autoComplete="off"
                      className={adultError?.name ? styles.inputError : ''}
                    />
                    {adultError?.name && <span className={styles.fieldError}>{adultError.name}</span>}
                  </label>
                  <div className={styles.adultSignature}>
                    <span className={styles.adultSignatureLabel}>
                      Signature of {displayName} <span className={styles.required}>*</span>
                    </span>
                    {adult.signatureImage ? (
                      <div className={styles.signaturePreview}>
                        <img
                          src={adult.signatureImage}
                          alt={`Signature of ${displayName}`}
                          className={styles.signaturePreviewImage}
                        />
                        <button
                          type="button"
                          className={styles.resignButton}
                          onClick={() => setSigningFor(adult.id)}
                        >
                          Re-sign
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.signButton}
                        onClick={() => setSigningFor(adult.id)}
                        disabled={!adult.name.trim()}
                      >
                        {adult.name.trim() ? `Hand the tablet to ${adult.name.trim()} to sign` : 'Enter their name, then tap to sign'}
                      </button>
                    )}
                    {adultError?.signature && <span className={styles.fieldError}>{adultError.signature}</span>}
                    <p className={styles.helperSmall}>
                      By signing, {displayName} confirms they are 18 or older, have read and agree to this waiver, and are signing for themselves.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeAdult(adult.id)}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" className={styles.addButton} onClick={addAdult}>
          + Add another adult
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
        <h2>{adults.length > 0 ? 'Parent / Guardian signature' : 'Signature'} <span className={styles.required}>*</span></h2>
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
              onClick={() => setSigningFor('guardian')}
            >
              Re-sign
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.signButton}
            onClick={() => setSigningFor('guardian')}
          >
            Tap to Sign
          </button>
        )}
        <p className={styles.helperSmall}>
          {adults.length > 0 || hasTeens === 'yes'
            ? 'The parent/guardian signs for themselves and for every child and teen listed above.'
            : 'Your handwritten signature will be captured and included in the waiver document.'}
        </p>
      </div>

      <SignaturePadModal
        open={signingFor !== null}
        signerName={
          signingAdult
            ? signingAdult.name.trim()
            : adults.length > 0 ? guardianName.trim() || undefined : undefined
        }
        onClose={() => setSigningFor(null)}
        onAccept={(dataUrl) => {
          if (signingFor === 'guardian') {
            setSignatureImage(dataUrl);
          } else if (signingFor) {
            setAdults((prev) =>
              prev.map((adult) => (adult.id === signingFor ? { ...adult, signatureImage: dataUrl } : adult))
            );
          }
          setSigningFor(null);
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
