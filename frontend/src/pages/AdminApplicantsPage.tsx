import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  fetchAdminJobApplications,
  updateAdminJobApplicationStatus,
  fetchAdminJobListings,
  fetchAdminJobListingsFull,
  createAdminJobListing,
  updateAdminJobListing,
  deleteAdminJobListing,
  type AdminJobApplication,
  type AdminJobApplicationFilters,
  type AdminJobListing,
  type AdminJobListingFull,
  type AdminJobListingCreateInput,
  type AdminJobListingUpdateInput,
} from '../api/admin';
import { formatDate } from '../lib/dateUtils';
import styles from './AdminApplicantsPage.module.css';

type LoadState = 'idle' | 'loading' | 'error';
type TabKey = 'applicants' | 'jobs';

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
const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'seasonal', 'internship'] as const;
const PAGE_SIZE = 50;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toListLines(arr: string[]): string {
  return arr.join('\n');
}

function fromListLines(value: string): string[] {
  return value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

type ListingFormState = {
  listing_id: number | null;
  title: string;
  slug: string;
  department: string;
  employment_type: 'full-time' | 'part-time' | 'seasonal' | 'internship';
  location: string;
  description: string;
  responsibilities: string;
  qualifications: string;
  nice_to_have: string;
  perks: string;
  pay_range: string;
  minimum_age: string;
  schedule_notes: string;
  display_order: string;
  is_active: boolean;
  closes_at: string;
};

function emptyListingForm(): ListingFormState {
  return {
    listing_id: null,
    title: '',
    slug: '',
    department: '',
    employment_type: 'part-time',
    location: 'Crossgates Mall, Albany, NY',
    description: '',
    responsibilities: '',
    qualifications: '',
    nice_to_have: '',
    perks: '',
    pay_range: '',
    minimum_age: '16',
    schedule_notes: '',
    display_order: '0',
    is_active: true,
    closes_at: '',
  };
}

function listingToForm(listing: AdminJobListingFull): ListingFormState {
  return {
    listing_id: listing.listing_id,
    title: listing.title,
    slug: listing.slug,
    department: listing.department,
    employment_type: listing.employment_type,
    location: listing.location,
    description: listing.description,
    responsibilities: toListLines(listing.responsibilities ?? []),
    qualifications: toListLines(listing.qualifications ?? []),
    nice_to_have: toListLines(listing.nice_to_have ?? []),
    perks: toListLines(listing.perks ?? []),
    pay_range: listing.pay_range ?? '',
    minimum_age: String(listing.minimum_age ?? 16),
    schedule_notes: listing.schedule_notes ?? '',
    display_order: String(listing.display_order ?? 0),
    is_active: listing.is_active,
    closes_at: listing.closes_at ? listing.closes_at.slice(0, 10) : '',
  };
}

export function AdminApplicantsPage() {
  const [tab, setTab] = useState<TabKey>('applicants');

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/admin" className={styles.backLink}>
          &larr; Back to Dashboard
        </Link>

        <header className={styles.header}>
          <h1>Jobs &amp; Applicants</h1>
        </header>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            className={`${styles.tab} ${tab === 'applicants' ? styles.tabActive : ''}`}
            onClick={() => setTab('applicants')}
          >
            Applicants
          </button>
          <button
            type="button"
            role="tab"
            className={`${styles.tab} ${tab === 'jobs' ? styles.tabActive : ''}`}
            onClick={() => setTab('jobs')}
          >
            Jobs
          </button>
        </div>

        {tab === 'applicants' ? <ApplicantsTab /> : <JobsTab />}
      </div>
    </div>
  );
}

// ============= Applicants Tab =============
function ApplicantsTab() {
  const [applications, setApplications] = useState<AdminJobApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);

  const [listings, setListings] = useState<AdminJobListing[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    fetchAdminJobListings().then(setListings).catch(() => {});
  }, []);

  const loadApplications = useCallback(async () => {
    setLoadState('loading');
    setError('');
    try {
      const filters: AdminJobApplicationFilters = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (search.trim()) filters.search = search.trim();
      if (statusFilter) filters.status = statusFilter;
      if (positionFilter) filters.listingId = parseInt(positionFilter);
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;

      const result = await fetchAdminJobApplications(filters);
      setApplications(result.applications);
      setTotal(result.total);
      setLoadState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
      setLoadState('error');
    }
  }, [search, statusFilter, positionFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(0);
    }, 400);
  };

  const handleInlineStatusChange = async (app: AdminJobApplication, newStatus: string) => {
    try {
      await updateAdminJobApplicationStatus(app.application_id, { status: newStatus });
      setApplications(prev =>
        prev.map(a => a.application_id === app.application_id ? { ...a, status: newStatus } : a)
      );
    } catch {
      loadApplications();
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <span>Search</span>
          <input
            type="text"
            placeholder="Name or email..."
            defaultValue={search}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>
        <div className={styles.filterItem}>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          >
            <option value="">All</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterItem}>
          <span>Position</span>
          <select
            value={positionFilter}
            onChange={e => { setPositionFilter(e.target.value); setPage(0); }}
          >
            <option value="">All</option>
            {listings.map(l => (
              <option key={l.listing_id} value={l.listing_id}>{l.title}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterItem}>
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(0); }}
          />
        </div>
        <div className={styles.filterItem}>
          <span>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(0); }}
          />
        </div>
        <span className={styles.filterCount}>{total} result{total !== 1 ? 's' : ''}</span>
      </div>

      <div className={styles.panel}>
        {loadState === 'loading' && applications.length === 0 && (
          <div className={styles.loading}>Loading applications...</div>
        )}
        {loadState === 'error' && (
          <div className={styles.error}>{error}</div>
        )}
        {loadState !== 'error' && applications.length === 0 && loadState !== 'loading' && (
          <div className={styles.emptyState}>No applications found.</div>
        )}
        {applications.length > 0 && (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Position</th>
                    <th>Status</th>
                    <th>Date Applied</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map(app => (
                    <tr key={app.application_id}>
                      <td>{app.first_name} {app.last_name}</td>
                      <td>{app.email}</td>
                      <td>{app.job_listings?.title ?? '-'}</td>
                      <td>
                        <select
                          className={`${styles.statusSelect} ${styles[`status${app.status.charAt(0).toUpperCase() + app.status.slice(1)}`] ?? ''}`}
                          value={app.status}
                          onChange={e => handleInlineStatusChange(app, e.target.value)}
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td>{formatDate(app.created_at)}</td>
                      <td>
                        <Link
                          to={`/admin/applicants/${app.application_id}`}
                          className={styles.viewBtn}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <span>Page {page + 1} of {totalPages}</span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ============= Jobs Tab =============
function JobsTab() {
  const [listings, setListings] = useState<AdminJobListingFull[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ListingFormState>(emptyListingForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    setLoadState('loading');
    setError('');
    try {
      const result = await fetchAdminJobListingsFull({
        search: search.trim() || undefined,
        limit: 200,
      });
      setListings(result.listings);
      setLoadState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings');
      setLoadState('error');
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 300);
  };

  const openNew = () => {
    setForm(emptyListingForm());
    setSlugTouched(false);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (listing: AdminJobListingFull) => {
    setForm(listingToForm(listing));
    setSlugTouched(true);
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setFormError('');
  };

  const handleTitleChange = (value: string) => {
    setForm(prev => ({
      ...prev,
      title: value,
      slug: slugTouched ? prev.slug : slugify(value),
    }));
  };

  const handleSave = async () => {
    setFormError('');

    if (!form.title.trim()) return setFormError('Title is required');
    if (!form.slug.trim()) return setFormError('Slug is required');
    if (!form.department.trim()) return setFormError('Department is required');
    if (!form.description.trim()) return setFormError('Description is required');

    const payload: AdminJobListingCreateInput = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      department: form.department.trim(),
      employment_type: form.employment_type,
      location: form.location.trim() || undefined,
      description: form.description.trim(),
      responsibilities: fromListLines(form.responsibilities),
      qualifications: fromListLines(form.qualifications),
      nice_to_have: fromListLines(form.nice_to_have),
      perks: fromListLines(form.perks),
      pay_range: form.pay_range.trim() || null,
      minimum_age: form.minimum_age ? parseInt(form.minimum_age, 10) : undefined,
      schedule_notes: form.schedule_notes.trim() || null,
      display_order: form.display_order ? parseInt(form.display_order, 10) : undefined,
      is_active: form.is_active,
      closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
    };

    setSaving(true);
    try {
      if (form.listing_id != null) {
        const update: AdminJobListingUpdateInput = payload;
        await updateAdminJobListing(form.listing_id, update);
      } else {
        await createAdminJobListing(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (listing: AdminJobListingFull) => {
    if (!window.confirm(`Delete the "${listing.title}" listing? This cannot be undone.`)) return;
    try {
      await deleteAdminJobListing(listing.listing_id);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <>
      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <span>Search</span>
          <input
            type="text"
            placeholder="Title, department, or slug..."
            defaultValue={search}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>
        <span className={styles.filterCount} style={{ marginLeft: 'auto' }}>
          {listings.length} listing{listings.length !== 1 ? 's' : ''}
        </span>
        <button type="button" className={styles.newBtn} onClick={openNew}>
          + New Job
        </button>
      </div>

      <div className={styles.panel}>
        {loadState === 'loading' && listings.length === 0 && (
          <div className={styles.loading}>Loading listings...</div>
        )}
        {loadState === 'error' && (
          <div className={styles.error}>{error}</div>
        )}
        {loadState !== 'error' && listings.length === 0 && loadState !== 'loading' && (
          <div className={styles.emptyState}>No job listings yet. Click &ldquo;New Job&rdquo; to create one.</div>
        )}
        {listings.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Type</th>
                  <th>Pay</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listings.map(listing => (
                  <tr key={listing.listing_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{listing.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{listing.slug}</div>
                    </td>
                    <td>{listing.department}</td>
                    <td>{listing.employment_type}</td>
                    <td>{listing.pay_range ?? '-'}</td>
                    <td>
                      <span className={listing.is_active ? styles.listingActive : styles.listingInactive}>
                        {listing.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{listing.display_order}</td>
                    <td>
                      <button type="button" className={styles.editBtn} onClick={() => openEdit(listing)}>
                        Edit
                      </button>
                      <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(listing)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{form.listing_id != null ? 'Edit Job' : 'New Job'}</h2>
              <button type="button" className={styles.modalCloseBtn} onClick={closeModal}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label>Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => handleTitleChange(e.target.value)}
                    placeholder="Party Host"
                  />
                </div>
                <div className={styles.formField}>
                  <label>Slug *</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={e => {
                      setSlugTouched(true);
                      setForm(prev => ({ ...prev, slug: e.target.value }));
                    }}
                    placeholder="party-host"
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label>Department *</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={e => setForm(prev => ({ ...prev, department: e.target.value }))}
                    placeholder="Operations"
                  />
                </div>
                <div className={styles.formField}>
                  <label>Employment Type *</label>
                  <select
                    value={form.employment_type}
                    onChange={e => setForm(prev => ({ ...prev, employment_type: e.target.value as ListingFormState['employment_type'] }))}
                  >
                    {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.formField}>
                <label>Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>

              <div className={styles.formField}>
                <label>Description *</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label>Pay Range</label>
                  <input
                    type="text"
                    value={form.pay_range}
                    onChange={e => setForm(prev => ({ ...prev, pay_range: e.target.value }))}
                    placeholder="$16–$18 / hr"
                  />
                </div>
                <div className={styles.formField}>
                  <label>Schedule Notes</label>
                  <input
                    type="text"
                    value={form.schedule_notes}
                    onChange={e => setForm(prev => ({ ...prev, schedule_notes: e.target.value }))}
                    placeholder="Weekends required"
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label>Minimum Age</label>
                  <input
                    type="number"
                    min="14"
                    max="99"
                    value={form.minimum_age}
                    onChange={e => setForm(prev => ({ ...prev, minimum_age: e.target.value }))}
                  />
                </div>
                <div className={styles.formField}>
                  <label>Display Order</label>
                  <input
                    type="number"
                    min="0"
                    value={form.display_order}
                    onChange={e => setForm(prev => ({ ...prev, display_order: e.target.value }))}
                  />
                </div>
                <div className={styles.formField}>
                  <label>Closes At</label>
                  <input
                    type="date"
                    value={form.closes_at}
                    onChange={e => setForm(prev => ({ ...prev, closes_at: e.target.value }))}
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label>Responsibilities (one per line)</label>
                <textarea
                  value={form.responsibilities}
                  onChange={e => setForm(prev => ({ ...prev, responsibilities: e.target.value }))}
                  rows={4}
                />
              </div>

              <div className={styles.formField}>
                <label>Qualifications (one per line)</label>
                <textarea
                  value={form.qualifications}
                  onChange={e => setForm(prev => ({ ...prev, qualifications: e.target.value }))}
                  rows={4}
                />
              </div>

              <div className={styles.formField}>
                <label>Nice to Have (one per line)</label>
                <textarea
                  value={form.nice_to_have}
                  onChange={e => setForm(prev => ({ ...prev, nice_to_have: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className={styles.formField}>
                <label>Perks (one per line)</label>
                <textarea
                  value={form.perks}
                  onChange={e => setForm(prev => ({ ...prev, perks: e.target.value }))}
                  rows={3}
                />
              </div>

              <label className={styles.formCheckbox}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                />
                Active (visible on careers page)
              </label>

              {formError && <div className={styles.errorMsg}>{formError}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryBtn} onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : form.listing_id != null ? 'Save Changes' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
