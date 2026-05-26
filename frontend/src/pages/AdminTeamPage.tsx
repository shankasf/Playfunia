import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import {
  fetchAdminUsers,
  createAdminTeamUser,
  updateAdminUser,
  resetAdminUserPassword,
  deleteAdminUser,
  type AdminUser,
} from '../api/admin';
import { formatDate } from '../lib/dateUtils';
import styles from './AdminTeamPage.module.css';

type LoadState = 'idle' | 'loading' | 'error';
type AccessLevel = 'admin' | 'employee';

const TEAM_ROLES = ['admin', 'employee', 'staff'];

const ACCESS_META: Record<AccessLevel, { label: string; blurb: string }> = {
  admin: { label: 'Admin', blurb: 'Full access to everything' },
  employee: { label: 'Staff', blurb: 'View & front-desk operations only' },
};

function accessOf(u: AdminUser): AccessLevel | 'customer' {
  if (u.roles?.includes('admin')) return 'admin';
  if (u.roles?.includes('employee') || u.roles?.includes('staff')) return 'employee';
  return 'customer';
}

function fullName(u: AdminUser): string {
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
}

function initialsOf(u: AdminUser): string {
  const f = (u.first_name ?? '').trim();
  const l = (u.last_name ?? '').trim();
  const combo = `${f[0] ?? ''}${l[0] ?? ''}`;
  return (combo || u.email[0] || '?').toUpperCase();
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < arr.length; i += 1) out += chars[arr[i] % chars.length];
  return out;
}

type CreateForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  role: AccessLevel;
};

const emptyCreateForm = (): CreateForm => ({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  password: generatePassword(),
  role: 'employee',
});

export function AdminTeamPage() {
  const { user } = useAuth();
  const [state, setState] = useState<{ status: LoadState; data: AdminUser[]; error?: string }>({
    status: 'idle',
    data: [],
  });
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit modal
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<{ first_name: string; last_name: string; phone: string; role: AccessLevel }>({
    first_name: '',
    last_name: '',
    phone: '',
    role: 'employee',
  });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reset password modal
  const [pwTarget, setPwTarget] = useState<AdminUser | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading', error: undefined }));
    try {
      const users = await fetchAdminUsers({ teamOnly: true });
      setState({ status: 'idle', data: users });
    } catch (error) {
      setState({ status: 'error', data: [], error: error instanceof Error ? error.message : 'Failed to load team.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...state.data].sort((a, b) => {
      // Admins first, then by name
      const ra = accessOf(a) === 'admin' ? 0 : 1;
      const rb = accessOf(b) === 'admin' ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return fullName(a).localeCompare(fullName(b));
    });
    if (!q) return sorted;
    return sorted.filter((u) => `${fullName(u)} ${u.email}`.toLowerCase().includes(q));
  }, [state.data, search]);

  const adminCount = state.data.filter((u) => accessOf(u) === 'admin').length;
  const staffCount = state.data.filter((u) => accessOf(u) === 'employee').length;

  const isSelf = (u: AdminUser) => !!user?.email && u.email.toLowerCase() === user.email.toLowerCase();

  // ---- Create ----
  const openCreate = () => {
    setCreateForm(emptyCreateForm());
    setCreateError(null);
    setCreateOpen(true);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!createForm.first_name.trim() || !createForm.email.trim() || createForm.password.length < 8) {
      setCreateError('First name, a valid email, and a password of at least 8 characters are required.');
      return;
    }
    setCreateBusy(true);
    try {
      await createAdminTeamUser({
        first_name: createForm.first_name.trim(),
        last_name: createForm.last_name.trim() || undefined,
        email: createForm.email.trim(),
        phone: createForm.phone.trim() || undefined,
        password: createForm.password,
        role: createForm.role,
      });
      setMessage({ type: 'ok', text: `${ACCESS_META[createForm.role].label} profile created for ${createForm.email}. A welcome email was sent.` });
      setCreateOpen(false);
      await load();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create profile.');
    } finally {
      setCreateBusy(false);
    }
  };

  // ---- Edit ----
  const openEdit = (u: AdminUser) => {
    const access = accessOf(u);
    setEditTarget(u);
    setEditError(null);
    setEditForm({
      first_name: u.first_name ?? '',
      last_name: u.last_name ?? '',
      phone: u.phone ?? '',
      role: access === 'admin' ? 'admin' : 'employee',
    });
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);
    setEditBusy(true);
    try {
      // Preserve any non-team baseline role (e.g. legacy "user") and set the access level.
      const base = (editTarget.roles ?? []).filter((r) => !TEAM_ROLES.includes(r));
      const roles = [...base, editForm.role];
      await updateAdminUser(editTarget.user_id, {
        first_name: editForm.first_name.trim() || undefined,
        last_name: editForm.last_name.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        roles,
      });
      setMessage({ type: 'ok', text: `Updated ${editTarget.email}.` });
      setEditTarget(null);
      await load();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to update profile.');
    } finally {
      setEditBusy(false);
    }
  };

  // ---- Reset password ----
  const openReset = (u: AdminUser) => {
    setPwTarget(u);
    setPwValue(generatePassword());
    setPwError(null);
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwTarget) return;
    if (pwValue.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    setPwBusy(true);
    setPwError(null);
    try {
      await resetAdminUserPassword(pwTarget.user_id, pwValue);
      setMessage({ type: 'ok', text: `Password reset for ${pwTarget.email}. Share the new password with them securely.` });
      setPwTarget(null);
    } catch (error) {
      setPwError(error instanceof Error ? error.message : 'Failed to reset password.');
    } finally {
      setPwBusy(false);
    }
  };

  // ---- Delete ----
  const handleDelete = async (u: AdminUser) => {
    if (!window.confirm(`Delete ${fullName(u) || u.email}? This removes their login and access entirely.`)) return;
    setMessage(null);
    try {
      await deleteAdminUser(u.user_id);
      setMessage({ type: 'ok', text: `Deleted ${u.email}.` });
      await load();
    } catch (error) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Failed to delete profile.' });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/admin" className={styles.backLink}>&larr; Back to Dashboard</Link>

        <header className={styles.hero}>
          <div className={styles.heroText}>
            <span className={styles.kicker}>Team management</span>
            <h1>Team &amp; Access</h1>
            <p>Create, edit and remove staff and admin profiles. Admins have full access; staff are limited to viewing and front-desk operations.</p>
          </div>
          <button type="button" className={styles.primaryBtn} onClick={openCreate}>+ Create profile</button>
        </header>

        <div className={styles.statRow}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{state.data.length}</span>
            <span className={styles.statLabel}>Total team</span>
          </div>
          <div className={`${styles.statCard} ${styles.statAdmin}`}>
            <span className={styles.statValue}>{adminCount}</span>
            <span className={styles.statLabel}>Admins</span>
          </div>
          <div className={`${styles.statCard} ${styles.statStaff}`}>
            <span className={styles.statValue}>{staffCount}</span>
            <span className={styles.statLabel}>Staff</span>
          </div>
        </div>

        {message && (
          <div className={message.type === 'ok' ? styles.bannerOk : styles.bannerErr}>{message.text}</div>
        )}

        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search team by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {state.status === 'loading' && <p className={styles.muted}>Loading team...</p>}
        {state.status === 'error' && <p className={styles.errorText}>{state.error}</p>}

        {state.status !== 'loading' && (
          <div className={styles.grid}>
            {filtered.length === 0 && (
              <p className={styles.muted}>{search.trim() ? 'No team members match your search.' : 'No team members yet. Create the first profile.'}</p>
            )}
            {filtered.map((u) => {
              const access = accessOf(u);
              const self = isSelf(u);
              return (
                <article key={u.user_id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={`${styles.avatar} ${access === 'admin' ? styles.avatarAdmin : styles.avatarStaff}`}>
                      {initialsOf(u)}
                    </div>
                    <span className={access === 'admin' ? styles.badgeAdmin : styles.badgeStaff}>
                      {access === 'admin' ? 'Admin' : access === 'employee' ? 'Staff' : 'Customer'}
                    </span>
                  </div>
                  <h3 className={styles.cardName}>
                    {fullName(u) || '—'} {self && <span className={styles.youTag}>you</span>}
                  </h3>
                  <p className={styles.cardEmail}>{u.email}</p>
                  {u.phone && <p className={styles.cardMeta}>{u.phone}</p>}
                  {u.created_at && <p className={styles.cardMeta}>Added {formatDate(u.created_at)}</p>}

                  <div className={styles.cardActions}>
                    <button type="button" className={styles.ghostBtn} onClick={() => openEdit(u)}>Edit</button>
                    <button type="button" className={styles.ghostBtn} onClick={() => openReset(u)}>Reset password</button>
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => handleDelete(u)}
                      disabled={self}
                      title={self ? "You can't delete your own account" : undefined}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className={styles.overlay} onClick={() => !createBusy && setCreateOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHead}>
              <h2>Create a team profile</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setCreateOpen(false)}>&times;</button>
            </header>
            <form className={styles.form} onSubmit={submitCreate}>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>First name *</span>
                  <input value={createForm.first_name} onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })} required />
                </label>
                <label className={styles.field}>
                  <span>Last name</span>
                  <input value={createForm.last_name} onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })} />
                </label>
              </div>
              <label className={styles.field}>
                <span>Email *</span>
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
              </label>
              <label className={styles.field}>
                <span>Phone</span>
                <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span>Temporary password *</span>
                <div className={styles.pwRow}>
                  <input value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
                  <button type="button" className={styles.ghostBtn} onClick={() => setCreateForm({ ...createForm, password: generatePassword() })}>Generate</button>
                </div>
                <small className={styles.hint}>Share this with the new member. They can change it later via "Forgot password".</small>
              </label>
              <fieldset className={styles.roleChoice}>
                <legend>Access level</legend>
                {(['employee', 'admin'] as AccessLevel[]).map((lvl) => (
                  <label key={lvl} className={`${styles.roleOption} ${createForm.role === lvl ? styles.roleOptionActive : ''}`}>
                    <input type="radio" name="create-role" checked={createForm.role === lvl} onChange={() => setCreateForm({ ...createForm, role: lvl })} />
                    <span className={styles.roleOptionLabel}>{ACCESS_META[lvl].label}</span>
                    <span className={styles.roleOptionBlurb}>{ACCESS_META[lvl].blurb}</span>
                  </label>
                ))}
              </fieldset>
              {createError && <p className={styles.errorText}>{createError}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.ghostBtn} onClick={() => setCreateOpen(false)} disabled={createBusy}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={createBusy}>{createBusy ? 'Creating...' : 'Create profile'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className={styles.overlay} onClick={() => !editBusy && setEditTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHead}>
              <h2>Edit {editTarget.email}</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setEditTarget(null)}>&times;</button>
            </header>
            <form className={styles.form} onSubmit={submitEdit}>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>First name</span>
                  <input value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} />
                </label>
                <label className={styles.field}>
                  <span>Last name</span>
                  <input value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} />
                </label>
              </div>
              <label className={styles.field}>
                <span>Phone</span>
                <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </label>
              <fieldset className={styles.roleChoice} disabled={isSelf(editTarget)}>
                <legend>Access level{isSelf(editTarget) ? ' (cannot change your own)' : ''}</legend>
                {(['employee', 'admin'] as AccessLevel[]).map((lvl) => (
                  <label key={lvl} className={`${styles.roleOption} ${editForm.role === lvl ? styles.roleOptionActive : ''}`}>
                    <input type="radio" name="edit-role" checked={editForm.role === lvl} onChange={() => setEditForm({ ...editForm, role: lvl })} disabled={isSelf(editTarget)} />
                    <span className={styles.roleOptionLabel}>{ACCESS_META[lvl].label}</span>
                    <span className={styles.roleOptionBlurb}>{ACCESS_META[lvl].blurb}</span>
                  </label>
                ))}
              </fieldset>
              {editError && <p className={styles.errorText}>{editError}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.ghostBtn} onClick={() => setEditTarget(null)} disabled={editBusy}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={editBusy}>{editBusy ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {pwTarget && (
        <div className={styles.overlay} onClick={() => !pwBusy && setPwTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHead}>
              <h2>Reset password</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setPwTarget(null)}>&times;</button>
            </header>
            <form className={styles.form} onSubmit={submitReset}>
              <p className={styles.muted}>Set a new password for <strong>{pwTarget.email}</strong>.</p>
              <label className={styles.field}>
                <span>New password</span>
                <div className={styles.pwRow}>
                  <input value={pwValue} onChange={(e) => setPwValue(e.target.value)} required />
                  <button type="button" className={styles.ghostBtn} onClick={() => setPwValue(generatePassword())}>Generate</button>
                </div>
              </label>
              {pwError && <p className={styles.errorText}>{pwError}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.ghostBtn} onClick={() => setPwTarget(null)} disabled={pwBusy}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={pwBusy}>{pwBusy ? 'Resetting...' : 'Reset password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
