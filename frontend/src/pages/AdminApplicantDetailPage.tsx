import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  fetchAdminJobApplication,
  updateAdminJobApplication,
  deleteAdminJobApplication,
  fetchAdminJobListings,
  type AdminJobApplication,
  type AdminJobApplicationUpdateInput,
  type AdminJobListing,
} from '../api/admin';
import { formatDate } from '../lib/dateUtils';
import styles from './AdminApplicantDetailPage.module.css';

const STATUSES = ['new', 'reviewed', 'interview_scheduled', 'offered', 'hired', 'rejected', 'withdrawn'] as const;
const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  interview_scheduled: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const NA = 'N/A';

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  pronouns: string;
  listing_id: string;
  schedule_preference: string;
  available_start_date: string;
  has_experience_with_children: boolean;
  how_heard: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  cover_letter: string;
  status: string;
  admin_notes: string;
};

function toForm(app: AdminJobApplication): FormState {
  return {
    first_name: app.first_name ?? '',
    last_name: app.last_name ?? '',
    email: app.email ?? '',
    phone: app.phone ?? '',
    date_of_birth: app.date_of_birth ?? '',
    gender: app.gender ?? '',
    pronouns: app.pronouns ?? '',
    listing_id: String(app.listing_id ?? ''),
    schedule_preference: app.schedule_preference ?? '',
    available_start_date: app.available_start_date ?? '',
    has_experience_with_children: !!app.has_experience_with_children,
    how_heard: app.how_heard ?? '',
    emergency_contact_name: app.emergency_contact_name ?? '',
    emergency_contact_phone: app.emergency_contact_phone ?? '',
    cover_letter: app.cover_letter ?? '',
    status: app.status ?? 'new',
    admin_notes: app.admin_notes ?? '',
  };
}

function diffPayload(original: FormState, current: FormState): AdminJobApplicationUpdateInput {
  const payload: AdminJobApplicationUpdateInput = {};
  const orig = original as unknown as Record<string, unknown>;
  const cur = current as unknown as Record<string, unknown>;

  const stringFields: Array<keyof FormState> = [
    'first_name', 'last_name', 'email', 'phone',
    'date_of_birth', 'gender', 'pronouns',
    'schedule_preference', 'available_start_date',
    'how_heard', 'emergency_contact_name', 'emergency_contact_phone',
    'cover_letter', 'status', 'admin_notes',
  ];
  const nullableFields: Array<keyof FormState> = [
    'date_of_birth', 'gender', 'pronouns',
    'schedule_preference', 'available_start_date',
    'how_heard', 'emergency_contact_name', 'emergency_contact_phone',
    'cover_letter', 'admin_notes',
  ];

  for (const field of stringFields) {
    if (orig[field] !== cur[field]) {
      const val = cur[field] as string;
      if (nullableFields.includes(field) && val === '') {
        (payload as Record<string, unknown>)[field] = null;
      } else {
        (payload as Record<string, unknown>)[field] = val;
      }
    }
  }

  if (original.has_experience_with_children !== current.has_experience_with_children) {
    payload.has_experience_with_children = current.has_experience_with_children;
  }

  if (original.listing_id !== current.listing_id && current.listing_id) {
    const parsed = parseInt(current.listing_id, 10);
    if (!Number.isNaN(parsed) && parsed > 0) payload.listing_id = parsed;
  }

  return payload;
}

export function AdminApplicantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<AdminJobApplication | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [listings, setListings] = useState<AdminJobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [original, setOriginal] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const result = await fetchAdminJobApplication(Number(id));
      setApp(result.application);
      setResumeUrl(result.resumeUrl);
      setVideoUrl(result.videoUrl);
      const initial = toForm(result.application);
      setOriginal(initial);
      setForm(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applicant');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchAdminJobListings().then(setListings).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!app || !form || !original) return;
    const payload = diffPayload(original, form);
    if (Object.keys(payload).length === 0) {
      setFeedback('No changes to save');
      return;
    }

    setSaving(true);
    setFeedback('');
    try {
      const result = await updateAdminJobApplication(app.application_id, payload);
      setApp(result.application);
      const next = toForm(result.application);
      setOriginal(next);
      setForm(next);
      setFeedback('Saved successfully');
    } catch (err) {
      setFeedback(`Error: ${err instanceof Error ? err.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.loading}>Loading applicant details...</div>
        </div>
      </div>
    );
  }

  if (error || !app || !form) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <Link to="/admin/applicants" className={styles.backLink}>&larr; Back to Applicants</Link>
          <div className={styles.error}>{error || 'Applicant not found'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/admin/applicants" className={styles.backLink}>&larr; Back to Applicants</Link>

        <header className={styles.header}>
          <h1>{app.first_name} {app.last_name}</h1>
          <span className={styles.statusBadge} data-status={app.status}>
            {STATUS_LABELS[app.status] ?? app.status}
          </span>
        </header>

        {/* Contact Information */}
        <section className={styles.card}>
          <h2>Contact Information</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.label}>First Name</span>
              <input
                className={styles.editInput}
                value={form.first_name}
                onChange={e => update('first_name', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Last Name</span>
              <input
                className={styles.editInput}
                value={form.last_name}
                onChange={e => update('last_name', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Email</span>
              <input
                className={styles.editInput}
                type="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Phone</span>
              <input
                className={styles.editInput}
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Date of Birth</span>
              <input
                className={styles.editInput}
                type="date"
                value={form.date_of_birth}
                onChange={e => update('date_of_birth', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Gender</span>
              <input
                className={styles.editInput}
                value={form.gender}
                onChange={e => update('gender', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Pronouns</span>
              <input
                className={styles.editInput}
                value={form.pronouns}
                onChange={e => update('pronouns', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Application Details */}
        <section className={styles.card}>
          <h2>Application Details</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.label}>Position</span>
              <select
                className={styles.editSelect}
                value={form.listing_id}
                onChange={e => update('listing_id', e.target.value)}
              >
                <option value="">{app.job_listings?.title ?? 'Unknown'}</option>
                {listings.map(l => (
                  <option key={l.listing_id} value={l.listing_id}>{l.title}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Date Applied</span>
              <span className={styles.value}>{formatDate(app.created_at)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Schedule Preference</span>
              <input
                className={styles.editInput}
                value={form.schedule_preference}
                onChange={e => update('schedule_preference', e.target.value)}
                placeholder="weekdays, weekends, evenings, flexible"
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Available Start Date</span>
              <input
                className={styles.editInput}
                type="date"
                value={form.available_start_date}
                onChange={e => update('available_start_date', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Experience with Children</span>
              <label className={styles.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={form.has_experience_with_children}
                  onChange={e => update('has_experience_with_children', e.target.checked)}
                />
                {form.has_experience_with_children ? 'Yes' : 'No'}
              </label>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>How They Heard About Us</span>
              <input
                className={styles.editInput}
                value={form.how_heard}
                onChange={e => update('how_heard', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Emergency Contact */}
        <section className={styles.card}>
          <h2>Emergency Contact</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                className={styles.editInput}
                value={form.emergency_contact_name}
                onChange={e => update('emergency_contact_name', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Phone</span>
              <input
                className={styles.editInput}
                value={form.emergency_contact_phone}
                onChange={e => update('emergency_contact_phone', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Cover Letter */}
        <section className={styles.card}>
          <h2>Cover Letter</h2>
          <textarea
            className={styles.editTextarea}
            value={form.cover_letter}
            onChange={e => update('cover_letter', e.target.value)}
            rows={6}
          />
        </section>

        {/* Attachments (read-only) */}
        <section className={styles.card}>
          <h2>Attachments</h2>
          <div className={styles.attachments}>
            {resumeUrl ? (
              <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                Resume {app.resume_original_name ? `(${app.resume_original_name})` : ''}
              </a>
            ) : (
              <span className={styles.noFile}>No resume uploaded</span>
            )}
            {videoUrl ? (
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                Video {app.video_original_name ? `(${app.video_original_name})` : ''}
              </a>
            ) : app.video_url ? (
              <a href={app.video_url} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                Video (external link)
              </a>
            ) : (
              <span className={styles.noFile}>No video uploaded</span>
            )}
          </div>
        </section>

        {/* Status & Admin Notes */}
        <section className={styles.card}>
          <h2>Status &amp; Notes</h2>
          <div className={styles.statusRow}>
            <div className={styles.field}>
              <span className={styles.label}>Status</span>
              <select
                className={styles.statusSelect}
                value={form.status}
                onChange={e => update('status', e.target.value)}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.notesField}>
            <span className={styles.label}>Admin Notes</span>
            <textarea
              value={form.admin_notes}
              onChange={e => update('admin_notes', e.target.value)}
              placeholder="Add internal notes about this applicant..."
              rows={4}
            />
          </div>

          {feedback && (
            <div className={feedback.startsWith('Error') ? styles.errorMsg : styles.successMsg}>
              {feedback}
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              className={styles.deleteBtn}
              onClick={async () => {
                if (!app) return;
                if (!window.confirm(`Are you sure you want to permanently delete the application from ${app.first_name} ${app.last_name}? This cannot be undone.`)) return;
                try {
                  await deleteAdminJobApplication(app.application_id);
                  navigate('/admin/applicants');
                } catch (err) {
                  setFeedback(`Error: ${err instanceof Error ? err.message : 'Delete failed'}`);
                }
              }}
            >
              Delete Application
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminApplicantDetailPage;
