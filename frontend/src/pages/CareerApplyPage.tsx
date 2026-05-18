import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getJobListings, submitApplication, type JobListing } from '../api/careers';
import styles from './CareerApplyPage.module.css';

const HOW_HEARD_OPTIONS = [
  'Walk-in',
  'Instagram',
  'Facebook',
  'Friend/Referral',
  'Indeed',
  'Other',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const NAME_REGEX = /^[A-Za-zÀ-ÿ\s'-]+$/;
const ALLOWED_FILE_TYPES = ['.pdf', '.doc', '.docx', '.txt'];

export function CareerApplyPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const [listings, setListings] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListingId, setSelectedListingId] = useState(listingId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    getJobListings()
      .then(data => {
        setListings(data);
        if (listingId && data.some(l => String(l.id) === listingId)) {
          setSelectedListingId(listingId);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [listingId]);

  const selectedListing = listings.find(l => String(l.id) === selectedListingId);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg('');
    setErrorMsg('');

    const form = e.currentTarget;

    // Validate name format
    const firstName = (form.elements.namedItem('firstName') as HTMLInputElement).value.trim();
    const lastName = (form.elements.namedItem('lastName') as HTMLInputElement).value.trim();
    if (!NAME_REGEX.test(firstName)) {
      setErrorMsg('First name can only contain letters, spaces, hyphens, and apostrophes.');
      setSubmitting(false);
      return;
    }
    if (!NAME_REGEX.test(lastName)) {
      setErrorMsg('Last name can only contain letters, spaces, hyphens, and apostrophes.');
      setSubmitting(false);
      return;
    }

    // Validate phone (digits only, at least 10)
    const phoneVal = (form.elements.namedItem('phone') as HTMLInputElement).value.replace(/\D/g, '');
    if (phoneVal.length < 10) {
      setErrorMsg('Please enter a valid phone number with at least 10 digits.');
      setSubmitting(false);
      return;
    }

    // Validate email format
    const emailVal = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      setErrorMsg('Please enter a valid email address.');
      setSubmitting(false);
      return;
    }

    // Validate resume (required)
    const resumeInput = form.elements.namedItem('resume') as HTMLInputElement;
    if (!resumeInput.files || !resumeInput.files[0]) {
      setErrorMsg('Please upload your resume.');
      setSubmitting(false);
      return;
    }
    const resumeFile = resumeInput.files[0];
    if (resumeFile.size > MAX_FILE_SIZE) {
      setErrorMsg('Resume file must be under 5MB. Please choose a smaller file.');
      setSubmitting(false);
      return;
    }
    const resumeExt = resumeFile.name.toLowerCase().slice(resumeFile.name.lastIndexOf('.'));
    if (!ALLOWED_FILE_TYPES.includes(resumeExt)) {
      setErrorMsg('Resume must be a PDF, DOC, DOCX, or TXT file.');
      setSubmitting(false);
      return;
    }

    // Validate DOB age (must be at least 14 for employment)
    const dobVal = (form.elements.namedItem('dateOfBirth') as HTMLInputElement).value;
    if (dobVal) {
      const birthDate = new Date(dobVal);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age < 14) {
        setErrorMsg('Applicants must be at least 14 years old.');
        setSubmitting(false);
        return;
      }
    }

    // Validate start date is not in the past
    const startDateVal = (form.elements.namedItem('availableStartDate') as HTMLInputElement).value;
    if (startDateVal) {
      const startDate = new Date(startDateVal + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        setErrorMsg('Available start date cannot be in the past.');
        setSubmitting(false);
        return;
      }
    }

    const fd = new FormData();

    fd.append('listingId', (form.elements.namedItem('listingId') as HTMLSelectElement).value);
    fd.append('firstName', (form.elements.namedItem('firstName') as HTMLInputElement).value);
    fd.append('lastName', (form.elements.namedItem('lastName') as HTMLInputElement).value);
    fd.append('email', (form.elements.namedItem('email') as HTMLInputElement).value);
    fd.append('phone', (form.elements.namedItem('phone') as HTMLInputElement).value);

    const dob = (form.elements.namedItem('dateOfBirth') as HTMLInputElement).value;
    if (dob) fd.append('dateOfBirth', dob);

    const gender = (form.elements.namedItem('gender') as HTMLSelectElement).value;
    if (gender) fd.append('gender', gender);

    const pronouns = (form.elements.namedItem('pronouns') as HTMLSelectElement).value;
    if (pronouns) fd.append('pronouns', pronouns);

    const expCheckbox = form.elements.namedItem('hasExperienceWithChildren') as HTMLInputElement;
    fd.append('hasExperienceWithChildren', String(expCheckbox.checked));

    // Schedule preference
    const schedRadios = form.elements.namedItem('schedulePreference') as RadioNodeList;
    const schedVal = (schedRadios as unknown as HTMLInputElement).value;
    if (schedVal) fd.append('schedulePreference', schedVal);

    const startDate = (form.elements.namedItem('availableStartDate') as HTMLInputElement).value;
    if (startDate) fd.append('availableStartDate', startDate);

    const howHeard = (form.elements.namedItem('howHeard') as HTMLSelectElement).value;
    if (howHeard) fd.append('howHeard', howHeard);

    const coverLetter = (form.elements.namedItem('coverLetter') as HTMLTextAreaElement).value;
    if (coverLetter) fd.append('coverLetter', coverLetter);

    const ecName = (form.elements.namedItem('emergencyContactName') as HTMLInputElement).value;
    if (ecName) fd.append('emergencyContactName', ecName);

    const ecPhone = (form.elements.namedItem('emergencyContactPhone') as HTMLInputElement).value;
    if (ecPhone) fd.append('emergencyContactPhone', ecPhone);

    // Resume file
    if (resumeInput.files && resumeInput.files[0]) {
      fd.append('resume', resumeInput.files[0]);
    }

    try {
      const result = await submitApplication(fd);
      setSuccessMsg(result.message);
      form.reset();
      setSelectedListingId('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.loading}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to="/careers" className={styles.backLink}>&larr; Back to Careers</Link>

        {selectedListing && (
          <div className={styles.positionHeader}>
            <h1>Apply for {selectedListing.title}</h1>
            <div className={styles.positionMeta}>
              <span className={styles.metaBadge}>{selectedListing.department}</span>
              <span className={styles.metaBadge}>{selectedListing.employmentType}</span>
              {selectedListing.payRange && (
                <span className={styles.metaBadge}>{selectedListing.payRange}</span>
              )}
            </div>
          </div>
        )}

        {!selectedListing && (
          <div className={styles.positionHeader}>
            <h1>Apply Now</h1>
          </div>
        )}

        <section className={styles.formSection}>
          <p className={styles.formSubtitle}>
            Fill out the form below and we'll get back to you soon!
          </p>

          <form onSubmit={handleSubmit} className={styles.formGrid}>
            {/* Position */}
            <div className={styles.formGroupFull}>
              <label htmlFor="listingId">Position <span className={styles.required}>*</span></label>
              <select
                id="listingId"
                name="listingId"
                required
                value={selectedListingId}
                onChange={e => setSelectedListingId(e.target.value)}
              >
                <option value="">Select a position...</option>
                {listings.map(l => (
                  <option key={l.id} value={l.id}>{l.title} ({l.employmentType})</option>
                ))}
              </select>
            </div>

            {/* Personal Info */}
            <div className={styles.formGroup}>
              <label htmlFor="firstName">First Name <span className={styles.required}>*</span></label>
              <input type="text" id="firstName" name="firstName" required maxLength={100} pattern="[A-Za-zÀ-ÿ\s'\-]+" title="Letters, spaces, hyphens, and apostrophes only" autoComplete="given-name" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="lastName">Last Name <span className={styles.required}>*</span></label>
              <input type="text" id="lastName" name="lastName" required maxLength={100} pattern="[A-Za-zÀ-ÿ\s'\-]+" title="Letters, spaces, hyphens, and apostrophes only" autoComplete="family-name" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="email">Email <span className={styles.required}>*</span></label>
              <input type="email" id="email" name="email" required maxLength={255} autoComplete="email" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="phone">Phone <span className={styles.required}>*</span></label>
              <input type="tel" inputMode="numeric" id="phone" name="phone" required maxLength={10} pattern="\d{10}" title="10-digit phone number" autoComplete="tel" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="dateOfBirth">Date of Birth</label>
              <input type="date" id="dateOfBirth" name="dateOfBirth" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="availableStartDate">Available Start Date</label>
              <input type="date" id="availableStartDate" name="availableStartDate" min={new Date().toISOString().slice(0, 10)} />
            </div>

            {/* Gender & Pronouns */}
            <div className={styles.formGroup}>
              <label htmlFor="gender">Gender</label>
              <select id="gender" name="gender">
                <option value="">Prefer not to say</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="pronouns">Pronouns</label>
              <select id="pronouns" name="pronouns">
                <option value="">Prefer not to say</option>
                <option value="He/Him">He/Him</option>
                <option value="She/Her">She/Her</option>
                <option value="They/Them">They/Them</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Experience */}
            <div className={styles.formGroupFull}>
              <div className={styles.checkboxGroup}>
                <input type="checkbox" id="hasExperienceWithChildren" name="hasExperienceWithChildren" />
                <label htmlFor="hasExperienceWithChildren">I have experience working with children</label>
              </div>
            </div>

            {/* Availability */}
            <div className={styles.formGroupFull}>
              <label>Schedule Preference</label>
              <div className={styles.radioGroup}>
                {(['weekdays', 'weekends', 'evenings', 'flexible'] as const).map(opt => (
                  <div key={opt} className={styles.radioOption}>
                    <input type="radio" id={`sched_${opt}`} name="schedulePreference" value={opt} />
                    <label htmlFor={`sched_${opt}`}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</label>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="howHeard">How did you hear about us?</label>
              <select id="howHeard" name="howHeard">
                <option value="">Select...</option>
                {HOW_HEARD_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Resume & Cover Letter */}
            <div className={styles.formGroupFull}>
              <label htmlFor="resume">Resume <span className={styles.required}>*</span></label>
              <input
                type="file"
                id="resume"
                name="resume"
                accept=".pdf,.doc,.docx,.txt"
                required
                className={styles.fileInput}
              />
              <span className={styles.fileHint}>PDF, DOCX, or TXT - max 5MB</span>
            </div>

            <div className={styles.formGroupFull}>
              <label htmlFor="coverLetter">Why do you want to work at Playfunia?</label>
              <textarea
                id="coverLetter"
                name="coverLetter"
                rows={4}
                maxLength={5000}
                placeholder="Tell us what excites you about working at Playfunia..."
              />
            </div>

            {/* Emergency Contact */}
            <div className={styles.formGroup}>
              <label htmlFor="emergencyContactName">Emergency Contact Name</label>
              <input type="text" id="emergencyContactName" name="emergencyContactName" maxLength={200} pattern="[A-Za-zÀ-ÿ\s'\-]+" title="Letters, spaces, hyphens, and apostrophes only" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="emergencyContactPhone">Emergency Contact Phone</label>
              <input type="tel" inputMode="numeric" id="emergencyContactPhone" name="emergencyContactPhone" maxLength={10} pattern="\d{10}" title="10-digit phone number" />
            </div>

            {/* Status Messages */}
            {successMsg && <div className={styles.successMsg}>{successMsg}</div>}
            {errorMsg && <div className={styles.errorMsg}>{errorMsg}</div>}

            {/* Submit */}
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default CareerApplyPage;
