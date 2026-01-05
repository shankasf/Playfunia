import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PrimaryButton } from '../components/common/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/dateUtils';
import {
  AdminBooking,
  AdminBookingUpdatePayload,
  AdminMembership,
  AdminMembershipUpdatePayload,
  AdminSummary,
  AdminTicketLogEntry,
  AdminWaiver,
  AdminWaiverUpdatePayload,
  MembershipValidationResult,
  cancelAdminBooking,
  createAdminEventSource,
  deleteAdminWaiverSubmission,
  fetchAdminBookings,
  fetchAdminMemberships,
  fetchAdminSummary,
  fetchAdminTicketLog,
  fetchAdminWaivers,
  recordAdminMembershipVisit,
  redeemTicketCode,
  updateAdminMembership,
  updateAdminWaiverSubmission,
  updateAdminBooking,
  validateMembershipEntry,
} from '../api/admin';
import { API_BASE_URL } from '../api/client';
import styles from './AdminDashboardPage.module.css';

type LoadState = 'idle' | 'loading' | 'error';

type BookingFormState = AdminBookingUpdatePayload;

type MembershipFormState = {
  tier: string;
  autoRenew: boolean;
  visitsUsed: number;
  status: 'active' | 'cancelled' | 'expired';
};

type WaiverFormState = {
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianDateOfBirth: string;
  relationshipToChildren: string;
  allergies: string;
  medicalNotes: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  expiresAt: string;
  marketingOptIn: boolean;
  children: Array<{ name: string; birthDate: string }>;
};

export function AdminDashboardPage() {
  const { user, token, isTeamMember, isLoading: authLoading, logout } = useAuth();
  const [summaryState, setSummaryState] = useState<{
    status: LoadState;
    data: AdminSummary | null;
    error?: string;
  }>({ status: 'idle', data: null });
  const [bookingState, setBookingState] = useState<{
    status: LoadState;
    data: AdminBooking[];
    error?: string;
  }>({
    status: 'idle',
    data: [],
  });
  const [waiverState, setWaiverState] = useState<{
    status: LoadState;
    data: AdminWaiver[];
    error?: string;
  }>({
    status: 'idle',
    data: [],
  });
  const [ticketState, setTicketState] = useState<{
    status: LoadState;
    data: AdminTicketLogEntry[];
    error?: string;
  }>({
    status: 'idle',
    data: [],
  });
  const [membershipState, setMembershipState] = useState<{
    status: LoadState;
    data: AdminMembership[];
    error?: string;
  }>({
    status: 'idle',
    data: [],
  });
  const [bookingForm, setBookingForm] = useState<BookingFormState>({});
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [bookingActionMessage, setBookingActionMessage] = useState<string | null>(null);
  const [bookingActionBusy, setBookingActionBusy] = useState(false);
  const [selectedWaiverId, setSelectedWaiverId] = useState<string | null>(null);
  const [waiverForm, setWaiverForm] = useState<WaiverFormState>(emptyWaiverForm());
  const [waiverActionMessage, setWaiverActionMessage] = useState<string | null>(null);
  const [waiverActionBusy, setWaiverActionBusy] = useState(false);
  const [ticketCode, setTicketCode] = useState('');
  const [ticketMessage, setTicketMessage] = useState<string | null>(null);
  const [visitLoading, setVisitLoading] = useState<string | null>(null);
  const [membershipMessage, setMembershipMessage] = useState<string | null>(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [membershipForm, setMembershipForm] = useState<MembershipFormState>({
    tier: 'explorer',
    autoRenew: false,
    visitsUsed: 0,
    status: 'active',
  });
  const [membershipActionBusy, setMembershipActionBusy] = useState(false);
  const [validateInput, setValidateInput] = useState('');
  const [validationResult, setValidationResult] = useState<MembershipValidationResult | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const selectedBookingRef = useRef<string | null>(null);
  const selectedWaiverRef = useRef<string | null>(null);

  const isAuthorized = isTeamMember;

  const refreshAll = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!isAuthorized) return;
      if (!options?.silent) {
        setSummaryState((prev) => ({ ...prev, status: 'loading', error: undefined }));
        setBookingState((prev) => ({ ...prev, status: 'loading', error: undefined }));
        setWaiverState((prev) => ({ ...prev, status: 'loading', error: undefined }));
        setTicketState((prev) => ({ ...prev, status: 'loading', error: undefined }));
        setMembershipState((prev) => ({ ...prev, status: 'loading', error: undefined }));
      }
      try {
        const [summary, bookings, waivers, tickets, memberships] = await Promise.all([
          fetchAdminSummary(),
          fetchAdminBookings(),
          fetchAdminWaivers(),
          fetchAdminTicketLog(),
          fetchAdminMemberships(),
        ]);
        setSummaryState({ status: 'idle', data: summary });
        setBookingState({ status: 'idle', data: bookings });
        setWaiverState({ status: 'idle', data: waivers });
        setTicketState({ status: 'idle', data: tickets });
        setMembershipState({ status: 'idle', data: memberships });
        const activeSelection = selectedBookingRef.current;
        if (activeSelection) {
          const selected = bookings.find((entry) => entry.id === activeSelection);
          if (selected) {
            setBookingForm(toBookingForm(selected));
          }
        }

        const activeWaiverSelection = selectedWaiverRef.current;
        if (activeWaiverSelection) {
          const selected = waivers.find((entry) => entry.id === activeWaiverSelection);
          if (selected) {
            setWaiverForm(toWaiverForm(selected));
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load admin data.';
        if (!options?.silent) {
          setSummaryState({ status: 'error', data: null, error: message });
          setBookingState({ status: 'error', data: [], error: message });
          setWaiverState({ status: 'error', data: [], error: message });
          setTicketState({ status: 'error', data: [], error: message });
          setMembershipState({ status: 'error', data: [], error: message });
        }
      }
    },
    [isAuthorized]
  );

  const scheduleSilentRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshAll({ silent: true });
    }, 750);
  }, [refreshAll]);

  useEffect(() => {
    if (!isAuthorized) return;
    void refreshAll();
  }, [isAuthorized, refreshAll]);

  useEffect(() => {
    selectedBookingRef.current = selectedBookingId;
  }, [selectedBookingId]);

  useEffect(() => {
    selectedWaiverRef.current = selectedWaiverId;
  }, [selectedWaiverId]);

  useEffect(() => {
    if (!isAuthorized || !token) return;
    const source = createAdminEventSource(token);
    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type: string };
        if (shouldRefreshForEvent(payload.type)) {
          scheduleSilentRefresh();
        }
      } catch {
        // ignore malformed payload
      }
    };
    return () => {
      source.close();
      setStreamConnected(false);
    };
  }, [isAuthorized, token, scheduleSilentRefresh]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    },
    []
  );

  const handleSelectBooking = (booking: AdminBooking) => {
    setSelectedBookingId(booking.id);
    setBookingForm(toBookingForm(booking));
    setBookingActionMessage(null);
  };

  const handleSelectWaiver = (waiver: AdminWaiver) => {
    setSelectedWaiverId(waiver.id);
    setWaiverForm(toWaiverForm(waiver));
    setWaiverActionMessage(null);
  };

  const handleWaiverUpdate = async () => {
    if (!selectedWaiverId) return;
    setWaiverActionBusy(true);
    setWaiverActionMessage(null);
    try {
      const payload = cleanWaiverForm(waiverForm);
      await updateAdminWaiverSubmission(selectedWaiverId, payload);
      setWaiverActionMessage('Waiver updated successfully.');
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update waiver.';
      setWaiverActionMessage(message);
    } finally {
      setWaiverActionBusy(false);
    }
  };

  const handleDeleteWaiver = async (waiverId: string, guardianName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the waiver for "${guardianName}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteAdminWaiverSubmission(waiverId);
      if (selectedWaiverId === waiverId) {
        setSelectedWaiverId(null);
        setWaiverForm(emptyWaiverForm());
        setWaiverActionMessage(null);
      }
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete waiver.';
      alert(message);
    }
  };

  const handleDeleteBooking = async (booking: AdminBooking) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete booking "${booking.reference}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await cancelAdminBooking(booking.id, 'Deleted by admin');
      if (selectedBookingId === booking.id) {
        setSelectedBookingId(null);
        setBookingForm({});
        setBookingActionMessage(null);
      }
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete booking.';
      alert(message);
    }
  };

  const handleBookingUpdate = async () => {
    if (!selectedBookingId) return;
    setBookingActionBusy(true);
    setBookingActionMessage(null);
    try {
      const payload = cleanBookingForm(bookingForm);
      if (Object.keys(payload).length === 0) {
        setBookingActionMessage('Update at least one field.');
        return;
      }
      await updateAdminBooking(selectedBookingId, payload);
      setBookingActionMessage('Booking updated successfully.');
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update booking.';
      setBookingActionMessage(message);
    } finally {
      setBookingActionBusy(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedBookingId) return;
    const reason = window.prompt('Add an optional note for cancellation', bookingForm.notes ?? '');
    setBookingActionBusy(true);
    setBookingActionMessage(null);
    try {
      await cancelAdminBooking(selectedBookingId, reason ?? undefined);
      setBookingActionMessage('Booking cancelled.');
      setSelectedBookingId(null);
      setBookingForm({});
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel booking.';
      setBookingActionMessage(message);
    } finally {
      setBookingActionBusy(false);
    }
  };

  const handleRedeemTicket = async () => {
    if (!ticketCode.trim()) return;
    setTicketMessage(null);
    try {
      const normalized = ticketCode.trim().toUpperCase();
      const response = await redeemTicketCode(ticketCode.trim());
      const redeemedEntry = response.codes.find((code) => code.code === normalized);
      if (redeemedEntry?.status === 'redeemed') {
        setTicketMessage(`Redeemed ${normalized}.`);
      } else {
        setTicketMessage(`Updated ticket ${response.id}.`);
      }
      setTicketCode('');
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to redeem code.';
      setTicketMessage(message);
    }
  };

  const handleRecordVisit = async (membershipId: string) => {
    setVisitLoading(membershipId);
    setMembershipMessage(null);
    try {
      const updated = await recordAdminMembershipVisit(membershipId);
      setMembershipState((prev) => ({
        ...prev,
        data: prev.data.map((entry) =>
          entry.membership?.membershipId === membershipId
            ? {
              ...entry,
              membership: updated ?? entry.membership,
            }
            : entry
        ),
      }));
      // Update the summary to reflect the new check-in
      setSummaryState((prev) => {
        if (!prev.data) return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            memberships: {
              ...prev.data.memberships,
              visitsToday: (prev.data.memberships.visitsToday ?? 0) + 1,
            },
          },
        };
      });
      setMembershipMessage('Check-in recorded.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to record visit.';
      setMembershipMessage(message);
    } finally {
      setVisitLoading(null);
    }
  };

  const handleSelectMembership = (member: AdminMembership) => {
    if (!member.membership?.membershipId) return;
    setSelectedMembershipId(member.membership.membershipId);
    setMembershipForm({
      tier: member.membership.tierName.toLowerCase() === 'silver' ? 'explorer' 
        : member.membership.tierName.toLowerCase() === 'gold' ? 'adventurer'
        : member.membership.tierName.toLowerCase() === 'platinum' ? 'champion'
        : 'explorer',
      autoRenew: member.membership.autoRenew,
      visitsUsed: member.membership.visitsUsed,
      status: 'active',
    });
    setMembershipMessage(null);
  };

  const handleMembershipUpdate = async () => {
    if (!selectedMembershipId) return;
    setMembershipActionBusy(true);
    setMembershipMessage(null);
    try {
      const payload: AdminMembershipUpdatePayload = {
        tier: membershipForm.tier,
        auto_renew: membershipForm.autoRenew,
        visits_used_this_period: membershipForm.visitsUsed,
        status: membershipForm.status,
      };
      await updateAdminMembership(selectedMembershipId, payload);
      setMembershipMessage('Membership updated successfully.');
      // Refresh membership list
      const memberships = await fetchAdminMemberships();
      setMembershipState((prev) => ({ ...prev, data: memberships }));
      setSelectedMembershipId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update membership.';
      setMembershipMessage(message);
    } finally {
      setMembershipActionBusy(false);
    }
  };

  const handleValidationLookup = async () => {
    if (!validateInput.trim()) return;
    setValidationMessage(null);
    setValidationResult(null);
    try {
      const result = await validateMembershipEntry(validateInput.trim());
      setValidationResult(result);
      setValidationMessage('Visit recorded.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to validate entry.';
      setValidationMessage(message);
    }
  };

  const waiverExportUrl = exportUrl(token, 'waivers/export');
  const contactExportUrl = exportUrl(token, 'contacts/export');
  const selectedBooking = useMemo(
    () => bookingState.data.find((entry) => entry.id === selectedBookingId) ?? null,
    [bookingState.data, selectedBookingId]
  );
  const summary = summaryState.data;
  const validationProfile = validationResult
    ? membershipState.data.find((entry) => entry.userId === validationResult.userId)
    : null;

  if (authLoading) {
    return (
      <section className={styles.page}>
        <div className={styles.loadingCard}>
          <span className={styles.loadingLogo}>Playfunia</span>
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading dashboard...</span>
        </div>
      </section>
    );
  }

  if (!isAuthorized) {
    return (
      <section className={styles.page}>
        <div className={styles.emptyState}>
          <h1>Staff access required</h1>
          <p>Sign in with an admin or staff account to view the Playfunia operations dashboard.</p>
          <PrimaryButton to="/account">Switch account</PrimaryButton>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.tag}>Operations dashboard</span>
          <h1>Welcome, {user?.firstName ?? 'team member'}</h1>
          <p>Monitor bookings, waivers, tickets, and memberships in real time.</p>
        </div>
        <div className={styles.actions}>
          <PrimaryButton to="/book-party">Create booking</PrimaryButton>
          <PrimaryButton to="/buy-ticket" className={styles.secondary}>
            Issue tickets
          </PrimaryButton>
          <button type="button" className={styles.signOutButton} onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        {renderSummaryCard(
          'Bookings',
          summary?.bookings.upcoming.length ?? 0,
          `${summary?.bookings.pendingDepositCount ?? 0} deposits pending`
        )}
        {renderSummaryCard(
          'Waivers',
          summary?.waivers.total ?? 0,
          `${summary?.waivers.recent.length ?? 0} recent`
        )}
        {renderSummaryCard(
          'Ticket revenue',
          formatCurrency(summary?.tickets.salesWeek ?? 0),
          `${summary?.tickets.salesToday ?? 0} today`
        )}
        {renderSummaryCard(
          'Memberships',
          summary?.memberships.activeMembers ?? 0,
          `${summary?.memberships.visitsToday ?? 0} check-ins today`
        )}
      </section>

      <div className={styles.layout}>
        <div className={styles.columnPrimary}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Upcoming bookings</h2>
              <span>{bookingState.data.length} active</span>
            </header>
            {renderBookingTable(bookingState, handleSelectBooking, handleDeleteBooking, selectedBookingId)}
          </section>

          {selectedBooking && (
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <h2>Edit booking</h2>
                <span>{selectedBooking.reference}</span>
              </header>
              <div className={styles.formGrid}>
                <label>
                  Status
                  <select
                    value={bookingForm.status ?? ''}
                    onChange={(event) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        status: event.target.value as AdminBooking['status'],
                      }))
                    }
                  >
                    <option value="Confirmed">Confirmed</option>
                    <option value="Pending">Pending</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  Event date
                  <input
                    type="date"
                    value={bookingForm.eventDate ?? ''}
                    onChange={(event) =>
                      setBookingForm((prev) => ({ ...prev, eventDate: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Start time
                  <input
                    type="time"
                    value={bookingForm.startTime ?? ''}
                    onChange={(event) =>
                      setBookingForm((prev) => ({ ...prev, startTime: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Location
                  <input
                    type="text"
                    value={bookingForm.location ?? ''}
                    onChange={(event) =>
                      setBookingForm((prev) => ({ ...prev, location: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label className={styles.notesField}>
                Notes
                <textarea
                  value={bookingForm.notes ?? ''}
                  onChange={(event) =>
                    setBookingForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              </label>
              {bookingActionMessage && <p className={styles.feedback}>{bookingActionMessage}</p>}
              <div className={styles.formActions}>
                <button type="button" onClick={handleBookingUpdate} disabled={bookingActionBusy}>
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={handleCancelBooking}
                  className={styles.danger}
                  disabled={bookingActionBusy}
                >
                  Cancel booking
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBookingId(null)}
                  className={styles.secondaryButton}
                >
                  Close
                </button>
              </div>
            </section>
          )}

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Ticket redemption</h2>
              <span>{ticketState.data.length} recent redeems</span>
            </header>
            <div className={styles.ticketActions}>
              <input
                type="text"
                placeholder="Enter ticket code"
                value={ticketCode}
                onChange={(event) => setTicketCode(event.target.value)}
              />
              <button type="button" onClick={handleRedeemTicket} disabled={!ticketCode.trim()}>
                Redeem code
              </button>
            </div>
            {ticketMessage && <p className={styles.feedback}>{ticketMessage}</p>}
            {renderTicketLog(ticketState)}
          </section>
        </div>

        <aside className={styles.columnAside}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Waiver intake</h2>
              <div className={styles.panelActions}>
                {waiverExportUrl && (
                  <a href={waiverExportUrl} target="_blank" rel="noreferrer">
                    Export CSV
                  </a>
                )}
                {contactExportUrl && (
                  <a href={contactExportUrl} target="_blank" rel="noreferrer">
                    Download emails
                  </a>
                )}
              </div>
            </header>
            {renderWaiverList(waiverState, handleSelectWaiver, handleDeleteWaiver, selectedWaiverId)}

            {selectedWaiverId && (
              <section className={styles.waiverEdit} aria-label="Edit waiver">
                <header className={styles.waiverEditHeader}>
                  <h3>Edit waiver</h3>
                  <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={() => {
                      setSelectedWaiverId(null);
                      setWaiverActionMessage(null);
                      setWaiverForm(emptyWaiverForm());
                    }}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </header>

                <div className={styles.waiverCard}>
                  <h4 className={styles.waiverCardTitle}>Guardian Information</h4>
                  <div className={styles.waiverFormGrid}>
                    <label className={styles.waiverField}>
                      <span>Full name</span>
                      <input
                        type="text"
                        value={waiverForm.guardianName}
                        onChange={(e) =>
                          setWaiverForm((prev) => ({ ...prev, guardianName: e.target.value }))
                        }
                      />
                    </label>
                    <label className={styles.waiverField}>
                      <span>Email</span>
                      <input
                        type="email"
                        value={waiverForm.guardianEmail}
                        onChange={(e) =>
                          setWaiverForm((prev) => ({ ...prev, guardianEmail: e.target.value }))
                        }
                      />
                    </label>
                    <label className={styles.waiverField}>
                      <span>Phone</span>
                      <input
                        type="text"
                        value={waiverForm.guardianPhone}
                        onChange={(e) =>
                          setWaiverForm((prev) => ({ ...prev, guardianPhone: e.target.value }))
                        }
                      />
                    </label>
                    <label className={styles.waiverField}>
                      <span>Date of birth</span>
                      <input
                        type="date"
                        value={waiverForm.guardianDateOfBirth}
                        onChange={(e) =>
                          setWaiverForm((prev) => ({
                            ...prev,
                            guardianDateOfBirth: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className={styles.waiverField}>
                      <span>Relationship</span>
                      <input
                        type="text"
                        value={waiverForm.relationshipToChildren}
                        onChange={(e) =>
                          setWaiverForm((prev) => ({
                            ...prev,
                            relationshipToChildren: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className={styles.waiverField}>
                      <span>Waiver expires</span>
                      <input
                        type="date"
                        value={waiverForm.expiresAt}
                        onChange={(e) =>
                          setWaiverForm((prev) => ({ ...prev, expiresAt: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className={styles.waiverCard}>
                  <h4 className={styles.waiverCardTitle}>Insurance &amp; Preferences</h4>
                  <div className={styles.waiverFormGrid}>
                    <label className={styles.waiverField}>
                      <span>Insurance provider</span>
                      <input
                        type="text"
                        value={waiverForm.insuranceProvider}
                        onChange={(e) =>
                          setWaiverForm((prev) => ({
                            ...prev,
                            insuranceProvider: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className={styles.waiverField}>
                      <span>Policy number</span>
                      <input
                        type="text"
                        value={waiverForm.insurancePolicyNumber}
                        onChange={(e) =>
                          setWaiverForm((prev) => ({
                            ...prev,
                            insurancePolicyNumber: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className={styles.waiverToggle}>
                    <input
                      type="checkbox"
                      checked={waiverForm.marketingOptIn}
                      onChange={(e) =>
                        setWaiverForm((prev) => ({
                          ...prev,
                          marketingOptIn: e.target.checked,
                        }))
                      }
                    />
                    <span className={styles.toggleTrack}>
                      <span className={styles.toggleThumb} />
                    </span>
                    <span>Receive marketing emails</span>
                  </label>
                </div>

                <div className={styles.waiverCard}>
                  <h4 className={styles.waiverCardTitle}>Health Information</h4>
                  <label className={styles.waiverField}>
                    <span>Allergies</span>
                    <textarea
                      rows={2}
                      value={waiverForm.allergies}
                      onChange={(e) =>
                        setWaiverForm((prev) => ({ ...prev, allergies: e.target.value }))
                      }
                    />
                  </label>
                  <label className={styles.waiverField}>
                    <span>Medical notes</span>
                    <textarea
                      rows={2}
                      value={waiverForm.medicalNotes}
                      onChange={(e) =>
                        setWaiverForm((prev) => ({ ...prev, medicalNotes: e.target.value }))
                      }
                    />
                  </label>
                </div>

                <div className={styles.waiverCard}>
                  <h4 className={styles.waiverCardTitle}>Children</h4>
                  {waiverForm.children.length === 0 && (
                    <p className={styles.emptyHint}>No children added yet.</p>
                  )}
                  <div className={styles.waiverChildren}>
                    {waiverForm.children.map((child, index) => (
                      <div className={styles.childCard} key={`${child.name}-${index}`}>
                        <label className={styles.waiverField}>
                          <span>Name</span>
                          <input
                            type="text"
                            value={child.name}
                            onChange={(e) =>
                              setWaiverForm((prev) => {
                                const next = [...prev.children];
                                next[index] = { ...next[index], name: e.target.value };
                                return { ...prev, children: next };
                              })
                            }
                          />
                        </label>
                        <label className={styles.waiverField}>
                          <span>Birth date</span>
                          <input
                            type="date"
                            value={child.birthDate ? child.birthDate.slice(0, 10) : ''}
                            onChange={(e) =>
                              setWaiverForm((prev) => {
                                const next = [...prev.children];
                                next[index] = { ...next[index], birthDate: e.target.value };
                                return { ...prev, children: next };
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() =>
                            setWaiverForm((prev) => ({
                              ...prev,
                              children: prev.children.filter((_, idx) => idx !== index),
                            }))
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.addChildBtn}
                    onClick={() =>
                      setWaiverForm((prev) => ({
                        ...prev,
                        children: [...prev.children, { name: '', birthDate: '' }],
                      }))
                    }
                  >
                    + Add child
                  </button>
                </div>

                {waiverActionMessage && (
                  <p className={styles.waiverFeedback}>{waiverActionMessage}</p>
                )}
                <div className={styles.waiverActions}>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={handleWaiverUpdate}
                    disabled={waiverActionBusy}
                  >
                    {waiverActionBusy ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </section>
            )}
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Membership roster</h2>
            </header>
            {membershipMessage && <p className={styles.feedback}>{membershipMessage}</p>}
            {renderMembershipList(membershipState, visitLoading, handleRecordVisit, handleSelectMembership, selectedMembershipId)}
          </section>

          {selectedMembershipId && (
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <h2>Edit membership</h2>
              </header>
              <div className={styles.formGrid}>
                <label>
                  Tier
                  <select
                    value={membershipForm.tier}
                    onChange={(event) =>
                      setMembershipForm((prev) => ({ ...prev, tier: event.target.value }))
                    }
                  >
                    <option value="explorer">Silver (Explorer)</option>
                    <option value="adventurer">Gold (Adventurer)</option>
                    <option value="champion">Platinum (Champion)</option>
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={membershipForm.status}
                    onChange={(event) =>
                      setMembershipForm((prev) => ({
                        ...prev,
                        status: event.target.value as 'active' | 'cancelled' | 'expired',
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="expired">Expired</option>
                  </select>
                </label>
                <label>
                  Visits used this period
                  <input
                    type="number"
                    min={0}
                    value={membershipForm.visitsUsed}
                    onChange={(event) =>
                      setMembershipForm((prev) => ({
                        ...prev,
                        visitsUsed: parseInt(event.target.value, 10) || 0,
                      }))
                    }
                  />
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={membershipForm.autoRenew}
                    onChange={(event) =>
                      setMembershipForm((prev) => ({ ...prev, autoRenew: event.target.checked }))
                    }
                  />
                  Auto-renew
                </label>
              </div>
              <div className={styles.formActions}>
                <button type="button" onClick={handleMembershipUpdate} disabled={membershipActionBusy}>
                  {membershipActionBusy ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMembershipId(null)}
                  className={styles.secondaryButton}
                >
                  Close
                </button>
              </div>
            </section>
          )}

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Entry validation</h2>
            </header>
            <div className={styles.ticketActions}>
              <input
                type="text"
                placeholder="Scan code or search email"
                value={validateInput}
                onChange={(event) => setValidateInput(event.target.value)}
              />
              <button type="button" onClick={handleValidationLookup}>
                Validate
              </button>
            </div>
            {validationMessage && <p className={styles.feedback}>{validationMessage}</p>}
            {validationResult && (
              <div
                className={styles.validationResult}
                data-status={validationResult.membership ? 'allowed' : 'denied'}
              >
                <h3>
                  {validationProfile
                    ? formatGuardian({
                      firstName: validationProfile.firstName,
                      lastName: validationProfile.lastName,
                      email: validationProfile.email,
                    })
                    : validationResult.userId}
                </h3>
                <p>
                  Tier: <strong>{validationResult.membership?.tierName ?? 'None'}</strong>
                </p>
                <p>
                  Visits used this period: {validationResult.membership?.visitsUsed ?? 0}
                  {typeof validationResult.membership?.visitsPerMonth === 'number'
                    ? ` / ${validationResult.membership.visitsPerMonth}`
                    : ''}
                </p>
                <p>
                  Last visit:{' '}
                  {validationResult.membership?.lastVisitAt
                    ? formatDate(validationResult.membership.lastVisitAt)
                    : '--'}
                </p>
              </div>
            )}
          </section>
        </aside>
      </div>

      <div className={styles.statusBarBottom}>
        <span className={streamConnected ? styles.statusConnected : styles.statusDisconnected}>
          {streamConnected ? 'Live updates connected' : 'Disconnected'}
        </span>
        {summaryState.status === 'error' && (
          <span className={styles.error}>{summaryState.error}</span>
        )}
      </div>
    </section>
  );
}

function renderSummaryCard(title: string, value: string | number, subtitle: string) {
  return (
    <div className={styles.summaryCard} key={title}>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{subtitle}</p>
    </div>
  );
}

function renderBookingTable(
  state: { status: LoadState; data: AdminBooking[]; error?: string },
  onSelect: (booking: AdminBooking) => void,
  onDelete: (booking: AdminBooking) => void,
  selectedId: string | null
) {
  if (state.status === 'loading') return <p>Loading bookings...</p>;
  if (state.status === 'error') return <p className={styles.error}>{state.error}</p>;
  if (state.data.length === 0) return <p>No bookings yet.</p>;
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.bookingTable}>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Location</th>
            <th>Date</th>
            <th>Guardian</th>
            <th>Status</th>
            <th>Balance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.data.map((booking) => (
            <tr
              key={booking.id}
              className={booking.id === selectedId ? styles.rowSelected : undefined}
            >
              <td>{booking.reference}</td>
              <td>{booking.location}</td>
              <td>
                {formatDate(booking.eventDate)} &middot; {booking.startTime}
              </td>
              <td>{formatGuardian(booking.guardian)}</td>
              <td>{booking.status}</td>
              <td>{formatCurrency(booking.balanceRemaining)}</td>
              <td>
                <div className={styles.bookingActions}>
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(booking);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(booking);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderWaiverList(
  state: { status: LoadState; data: AdminWaiver[]; error?: string },
  onSelect: (waiver: AdminWaiver) => void,
  onDelete: (waiverId: string, guardianName: string) => void,
  selectedId: string | null,
) {
  if (state.status === 'loading') return <p>Loading waivers...</p>;
  if (state.status === 'error') return <p className={styles.error}>{state.error}</p>;
  if (state.data.length === 0) return <p>No waivers yet.</p>;
  return (
    <ul className={styles.waiverList}>
      {state.data.map((waiver) => (
        <li
          key={waiver.id}
          onClick={() => onSelect(waiver)}
          className={waiver.id === selectedId ? styles.waiverSelected : undefined}
        >
          <div>
            <strong>{waiver.guardianName}</strong>
            <span>{waiver.guardianEmail}</span>
            {waiver.visitCount && waiver.visitCount > 1 && (
              <small className={styles.repeatVisitor}>
                🔁 {waiver.visitCount} visits
              </small>
            )}
            {waiver.marketingOptIn && <small>Marketing opt-in</small>}
          </div>
          <div className={styles.waiverMeta}>
            <span>{formatDate(waiver.signedAt)}</span>
            <div className={styles.waiverActions}>
              <button
                type="button"
                className={styles.editBtn}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(waiver);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(waiver.id, waiver.guardianName);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function renderTicketLog(state: {
  status: LoadState;
  data: AdminTicketLogEntry[];
  error?: string;
}) {
  if (state.status === 'loading') return <p>Loading ticket log...</p>;
  if (state.status === 'error') return <p className={styles.error}>{state.error}</p>;
  if (state.data.length === 0) return <p>No ticket redemptions yet.</p>;
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Type</th>
            <th>Quantity</th>
            <th>Total</th>
            <th>Guardian</th>
            <th>Purchased</th>
            <th>Redeemed</th>
          </tr>
        </thead>
        <tbody>
          {state.data.map((entry) => {
            const redeemed = entry.codes.filter((code) => code.status === 'redeemed').length;
            return (
              <tr key={entry.id}>
                <td>{entry.type}</td>
                <td>{entry.quantity}</td>
                <td>{formatCurrency(entry.total)}</td>
                <td>{formatGuardian(entry.guardian)}</td>
                <td>{formatDate(entry.createdAt)}</td>
                <td>
                  {redeemed}/{entry.codes.length}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderMembershipList(
  state: { status: LoadState; data: AdminMembership[]; error?: string },
  visitLoading: string | null,
  onRecordVisit: (membershipId: string) => void,
  onEdit: (member: AdminMembership) => void,
  selectedMembershipId: string | null
) {
  if (state.status === 'loading') return <p>Loading memberships...</p>;
  if (state.status === 'error') return <p className={styles.error}>{state.error}</p>;
  if (state.data.length === 0) return <p>No active memberships.</p>;
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Family</th>
            <th>Tier</th>
            <th>Visits</th>
            <th>Last visit</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.data.map((member) => {
            const membershipId = member.membership?.membershipId ?? member.userId;
            const isSelected = membershipId === selectedMembershipId;
            return (
              <tr key={membershipId} className={isSelected ? styles.selectedRow : undefined}>
                <td>
                  {formatGuardian({
                    firstName: member.firstName,
                    lastName: member.lastName,
                    email: member.email,
                  })}
                </td>
                <td>{member.membership?.tierName ?? '--'}</td>
                <td>{formatVisitSummary(member.membership)}</td>
                <td>
                  {member.membership?.lastVisitAt ? formatDate(member.membership.lastVisitAt) : '--'}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => member.membership?.membershipId && onRecordVisit(member.membership.membershipId)}
                    disabled={!member.membership?.membershipId || visitLoading === membershipId}
                  >
                    {visitLoading === membershipId ? 'Recording...' : 'Check in'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(member)}
                    disabled={!member.membership?.membershipId}
                    className={styles.secondaryButton}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function toBookingForm(booking: AdminBooking): BookingFormState {
  return {
    status: booking.status,
    eventDate: booking.eventDate ? booking.eventDate.slice(0, 10) : '',
    startTime: booking.startTime ?? '',
    location: booking.location ?? '',
    notes: booking.notes ?? '',
  };
}

function cleanBookingForm(form: BookingFormState): AdminBookingUpdatePayload {
  const payload: AdminBookingUpdatePayload = {};
  if (form.status) payload.status = form.status;
  if (form.eventDate) payload.eventDate = form.eventDate;
  if (form.startTime) payload.startTime = form.startTime;
  if (form.location) payload.location = form.location;
  if (form.notes !== undefined) payload.notes = form.notes;
  return payload;
}

function emptyWaiverForm(): WaiverFormState {
  return {
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
    guardianDateOfBirth: '',
    relationshipToChildren: '',
    allergies: '',
    medicalNotes: '',
    insuranceProvider: '',
    insurancePolicyNumber: '',
    expiresAt: '',
    marketingOptIn: false,
    children: [],
  };
}

function toWaiverForm(waiver: AdminWaiver): WaiverFormState {
  return {
    guardianName: waiver.guardianName ?? '',
    guardianEmail: waiver.guardianEmail ?? '',
    guardianPhone: waiver.guardianPhone ?? '',
    guardianDateOfBirth: waiver.guardianDateOfBirth ? waiver.guardianDateOfBirth.slice(0, 10) : '',
    relationshipToChildren: waiver.relationshipToChildren ?? '',
    allergies: waiver.allergies ?? '',
    medicalNotes: waiver.medicalNotes ?? '',
    insuranceProvider: waiver.insuranceProvider ?? '',
    insurancePolicyNumber: waiver.insurancePolicyNumber ?? '',
    expiresAt: waiver.expiresAt ? waiver.expiresAt.slice(0, 10) : '',
    marketingOptIn: Boolean(waiver.marketingOptIn),
    children: Array.isArray(waiver.children)
      ? waiver.children.map((child) => ({
        name: child.name ?? '',
        birthDate: child.birthDate ? child.birthDate.slice(0, 10) : '',
      }))
      : [],
  };
}

function cleanWaiverForm(form: WaiverFormState): AdminWaiverUpdatePayload {
  const normalizeText = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    guardianName: normalizeText(form.guardianName),
    guardianEmail: normalizeText(form.guardianEmail),
    guardianPhone: normalizeText(form.guardianPhone),
    guardianDateOfBirth: normalizeText(form.guardianDateOfBirth),
    relationshipToChildren: normalizeText(form.relationshipToChildren),
    allergies: normalizeText(form.allergies),
    medicalNotes: normalizeText(form.medicalNotes),
    insuranceProvider: normalizeText(form.insuranceProvider),
    insurancePolicyNumber: normalizeText(form.insurancePolicyNumber),
    expiresAt: normalizeText(form.expiresAt),
    marketingOptIn: Boolean(form.marketingOptIn),
    children: form.children
      .map((child) => ({
        name: (child.name ?? '').trim(),
        birthDate: (child.birthDate ?? '').trim(),
      }))
      .filter((child) => child.name.length > 0 && child.birthDate.length > 0),
  };
}

function shouldRefreshForEvent(type?: string) {
  if (!type) return false;
  return [
    'booking.created',
    'booking.updated',
    'booking.cancelled',
    'booking.statusUpdated',
    'ticket.reserved',
    'ticket.redeemed',
    'waiver.updated',
    'membership.visitRecorded',
  ].includes(type);
}

function exportUrl(token: string | null | undefined, path: string) {
  if (!token) return null;
  const url = new URL(`${API_BASE_URL}/admin/${path}`);
  url.searchParams.set('token', token);
  return url.toString();
}

function formatGuardian(
  guardian?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null
) {
  if (!guardian) return '-';
  const name = [guardian.firstName, guardian.lastName].filter(Boolean).join(' ');
  return guardian.email ? `${name} (${guardian.email})` : name || guardian.email || '-';
}

function formatVisitSummary(membership?: AdminMembership['membership']) {
  if (!membership) return '--';
  if (typeof membership.visitsPerMonth === 'number' && membership.visitsPerMonth > 0) {
    const used = membership.visitsUsed ?? 0;
    const remaining =
      typeof membership.visitsRemaining === 'number' ? ` (${membership.visitsRemaining} left)` : '';
    return `${used}/${membership.visitsPerMonth}${remaining}`;
  }
  return 'Unlimited';
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}
