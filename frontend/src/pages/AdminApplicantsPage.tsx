import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  fetchAdminJobApplications,
  updateAdminJobApplicationStatus,
  fetchAdminJobListings,
  type AdminJobApplication,
  type AdminJobApplicationFilters,
  type AdminJobListing,
} from '../api/admin';
import { formatDate } from '../lib/dateUtils';
import styles from './AdminApplicantsPage.module.css';

type LoadState = 'idle' | 'loading' | 'error';

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
const PAGE_SIZE = 50;

export function AdminApplicantsPage() {
  const [applications, setApplications] = useState<AdminJobApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);

  // Listings for filter dropdown
  const [listings, setListings] = useState<AdminJobListing[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Load listings on mount
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

  // Reload on filter changes (debounced for search)
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

  // Inline status change
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
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/admin" className={styles.backLink}>
          &larr; Back to Dashboard
        </Link>

        <header className={styles.header}>
          <h1>Applicants</h1>
        </header>

        {/* Filter Bar */}
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

        {/* Table */}
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
      </div>
    </div>
  );
}
