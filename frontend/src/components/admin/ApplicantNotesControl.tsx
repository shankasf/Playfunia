import { useState } from 'react';

import { MAX_ADMIN_NOTES_LENGTH, updateAdminJobApplicationNotes } from '../../api/admin';
import { formatDateTime } from '../../lib/dateUtils';
import styles from './ApplicantNotesControl.module.css';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type ApplicantNotesSnapshot = {
  admin_notes: string | null;
  admin_notes_updated_at: string | null;
  admin_notes_updated_by: string | null;
};

/**
 * Internal hiring notes for one job application.
 *
 * Admin-only — /admin/job-applications/* sits outside the staff allow-list on
 * the backend, so these never reach employees and are never rendered on the
 * public careers pages. Saving is scoped to the note alone, which is what lets
 * this be dropped into the applicants list without risking a stale full-form
 * payload overwriting applicant details.
 *
 * `initial` seeds local state once. Callers render this with
 * key={applicationId} so switching applicants remounts with fresh state
 * instead of carrying a previous applicant's draft across.
 */
export function ApplicantNotesControl({
  applicationId,
  initial,
  onSaved,
  autoFocus = false,
}: {
  applicationId: number;
  initial: ApplicantNotesSnapshot;
  /** Lets the parent list keep its row in sync without a full refetch. */
  onSaved?: (snapshot: ApplicantNotesSnapshot) => void;
  autoFocus?: boolean;
}) {
  const [notes, setNotes] = useState(initial.admin_notes ?? '');
  const [saved, setSaved] = useState(initial.admin_notes ?? '');
  const [updatedAt, setUpdatedAt] = useState(initial.admin_notes_updated_at);
  const [updatedBy, setUpdatedBy] = useState(initial.admin_notes_updated_by);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');

  const dirty = notes.trim() !== saved.trim();

  const handleSave = async () => {
    const next = notes.trim();
    setSaveState('saving');
    setError('');
    try {
      const { notes: result } = await updateAdminJobApplicationNotes(applicationId, next);
      setSaved(result.admin_notes ?? '');
      setNotes(result.admin_notes ?? '');
      setUpdatedAt(result.admin_notes_updated_at);
      setUpdatedBy(result.admin_notes_updated_by);
      setSaveState('saved');
      onSaved?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes');
      setSaveState('error');
    }
  };

  // Ctrl/Cmd+Enter saves, so a note can be jotted without leaving the keyboard.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && dirty && saveState !== 'saving') {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h4 className={styles.title}>
          Internal notes
          <span className={styles.subtitle}>visible to admins only — never shown to the applicant</span>
        </h4>
        {updatedAt && (
          <span className={styles.stamp}>
            Updated {formatDateTime(updatedAt)}
            {updatedBy ? ` by ${updatedBy}` : ''}
          </span>
        )}
      </div>

      <textarea
        className={styles.textarea}
        aria-label="Internal notes"
        value={notes}
        rows={4}
        maxLength={MAX_ADMIN_NOTES_LENGTH}
        autoFocus={autoFocus}
        disabled={saveState === 'saving'}
        onChange={e => setNotes(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Interview feedback, availability, follow-ups..."
      />

      <div className={styles.footer}>
        <span className={styles.status}>
          {saveState === 'saving' && <span className={styles.muted}>Saving...</span>}
          {saveState === 'error' && <span className={styles.error}>{error}</span>}
          {saveState === 'saved' && !dirty && <span className={styles.success}>Saved</span>}
          {saveState !== 'saving' && dirty && <span className={styles.dirty}>Unsaved changes</span>}
        </span>
        <span className={styles.actions}>
          <span className={styles.counter}>
            {notes.length}/{MAX_ADMIN_NOTES_LENGTH}
          </span>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!dirty || saveState === 'saving'}
          >
            {saveState === 'saving' ? 'Saving...' : 'Save notes'}
          </button>
        </span>
      </div>
    </div>
  );
}
