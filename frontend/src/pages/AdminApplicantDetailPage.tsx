import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  fetchAdminJobApplication,
  updateAdminJobApplicationStatus,
  deleteAdminJobApplication,
  type AdminJobApplication,
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

export function AdminApplicantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<AdminJobApplication | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [adminNotes, setAdminNotes] = useState('');
  const [status, setStatus] = useState('');
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
      setAdminNotes(result.application.admin_notes ?? '');
      setStatus(result.application.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applicant');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!app) return;
    setSaving(true);
    setFeedback('');
    try {
      const result = await updateAdminJobApplicationStatus(
        app.application_id,
        { status, admin_notes: adminNotes || undefined }
      );
      setApp(result.application);
      setFeedback('Saved successfully');
    } catch (err) {
      setFeedback(`Error: ${err instanceof Error ? err.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
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

  if (error || !app) {
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
              <span className={styles.label}>Email</span>
              <span className={styles.value}>
                <a href={`mailto:${app.email}`}>{app.email}</a>
              </span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Phone</span>
              <span className={styles.value}>
                <a href={`tel:${app.phone}`}>{app.phone}</a>
              </span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Date of Birth</span>
              <span className={styles.value}>{app.date_of_birth ? formatDate(app.date_of_birth) : NA}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Gender</span>
              <span className={styles.value}>{app.gender || NA}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Pronouns</span>
              <span className={styles.value}>{app.pronouns || NA}</span>
            </div>
          </div>
        </section>

        {/* Application Details */}
        <section className={styles.card}>
          <h2>Application Details</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.label}>Position</span>
              <span className={styles.value}>{app.job_listings?.title ?? NA}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Date Applied</span>
              <span className={styles.value}>{formatDate(app.created_at)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Schedule Preference</span>
              <span className={styles.value}>{app.schedule_preference || NA}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Available Start Date</span>
              <span className={styles.value}>{app.available_start_date ? formatDate(app.available_start_date) : NA}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Experience with Children</span>
              <span className={styles.value}>{app.has_experience_with_children ? 'Yes' : 'No'}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>How They Heard About Us</span>
              <span className={styles.value}>{app.how_heard || NA}</span>
            </div>
          </div>
        </section>

        {/* Emergency Contact */}
        <section className={styles.card}>
          <h2>Emergency Contact</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.label}>Name</span>
              <span className={styles.value}>{app.emergency_contact_name || NA}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Phone</span>
              <span className={styles.value}>
                {app.emergency_contact_phone
                  ? <a href={`tel:${app.emergency_contact_phone}`}>{app.emergency_contact_phone}</a>
                  : NA}
              </span>
            </div>
          </div>
        </section>

        {/* Cover Letter */}
        <section className={styles.card}>
          <h2>Cover Letter</h2>
          <p className={styles.coverLetter}>
            {app.cover_letter || NA}
          </p>
        </section>

        {/* Attachments */}
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
          <h2>Status & Notes</h2>
          <div className={styles.statusRow}>
            <div className={styles.field}>
              <span className={styles.label}>Status</span>
              <select
                className={styles.statusSelect}
                value={status}
                onChange={e => setStatus(e.target.value)}
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
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
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
