import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PrimaryButton } from '../components/common/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime } from '../lib/dateUtils';
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
  deleteAdminBooking,
  deleteAdminMembership,
  deleteAdminTicketPurchase,
  deleteAdminWaiverSubmission,
  fetchAdminBookings,
  fetchAdminMemberships,
  fetchAdminSummary,
  fetchAdminTicketLog,
  fetchAdminWaivers,
  recordAdminMembershipVisit,
  redeemTicketByCode,
  redeemTicketCode,
  updateAdminMembership,
  updateAdminWaiverSubmission,
  updateAdminBooking,
  validateMembershipEntry,
  validateTicketCode,
  type TicketValidationResult,
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
  guardianFirstName: string;
  guardianLastName: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianDateOfBirth: string;
  relationshipToMinor: string;
  expiresAt: string;
  marketingSmsOptIn: boolean;
  marketingEmailOptIn: boolean;
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
  const [waiverDisplayCount, setWaiverDisplayCount] = useState(5);
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
  const [ticketValidationResult, setTicketValidationResult] = useState<TicketValidationResult | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const selectedBookingRef = useRef<string | null>(null);
  const selectedWaiverRef = useRef<string | null>(null);

  // Filter states
  const [bookingStatusFilter, setBookingStatusFilter] = useState<string>('all');
  const [bookingPaymentFilter, setBookingPaymentFilter] = useState<string>('all');
  const [bookingNameFilter, setBookingNameFilter] = useState<string>('');
  const [bookingDateFilter, setBookingDateFilter] = useState<string>('');
  const [membershipTierFilter, setMembershipTierFilter] = useState<string>('all');
  const [membershipStatusFilter, setMembershipStatusFilter] = useState<string>('all');
  const [membershipNameFilter, setMembershipNameFilter] = useState<string>('');
  const [waiverMarketingFilter, setWaiverMarketingFilter] = useState<string>('all');
  const [waiverNameFilter, setWaiverNameFilter] = useState<string>('');
  const [waiverDateFilter, setWaiverDateFilter] = useState<string>('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('all');
  const [ticketNameFilter, setTicketNameFilter] = useState<string>('');
  const [ticketDateFilter, setTicketDateFilter] = useState<string>('');

  // Export modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState<'waivers' | 'contacts'>('waivers');
  const [exportDateOption, setExportDateOption] = useState<'today' | 'yesterday' | 'range' | 'all'>('today');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');

  // Calendar modal state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarBooking, setSelectedCalendarBooking] = useState<AdminBooking | null>(null);

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

  // Filtered data
  const filteredBookings = useMemo(() => {
    const nameLower = bookingNameFilter.toLowerCase().trim();
    return bookingState.data.filter((booking) => {
      if (bookingStatusFilter !== 'all' && booking.status !== bookingStatusFilter) return false;
      if (bookingPaymentFilter !== 'all' && booking.paymentStatus !== bookingPaymentFilter) return false;
      if (nameLower) {
        const guardianName = `${booking.guardian?.firstName || ''} ${booking.guardian?.lastName || ''}`.toLowerCase();
        const guestName = (booking.guestName || '').toLowerCase();
        if (!guardianName.includes(nameLower) && !guestName.includes(nameLower)) return false;
      }
      if (bookingDateFilter && booking.eventDate !== bookingDateFilter) return false;
      return true;
    });
  }, [bookingState.data, bookingStatusFilter, bookingPaymentFilter, bookingNameFilter, bookingDateFilter]);

  const filteredMemberships = useMemo(() => {
    const nameLower = membershipNameFilter.toLowerCase().trim();
    return membershipState.data.filter((member) => {
      if (membershipTierFilter !== 'all' && member.membership?.tierName !== membershipTierFilter) return false;
      if (membershipStatusFilter !== 'all' && member.membership?.status !== membershipStatusFilter) return false;
      if (nameLower) {
        const fullName = `${member.firstName || ''} ${member.lastName || ''}`.toLowerCase();
        const email = (member.email || '').toLowerCase();
        if (!fullName.includes(nameLower) && !email.includes(nameLower)) return false;
      }
      return true;
    });
  }, [membershipState.data, membershipTierFilter, membershipStatusFilter, membershipNameFilter]);

  const filteredWaivers = useMemo(() => {
    const nameLower = waiverNameFilter.toLowerCase().trim();
    return waiverState.data.filter((waiver) => {
      if (waiverMarketingFilter === 'yes' && !waiver.marketingOptIn) return false;
      if (waiverMarketingFilter === 'no' && waiver.marketingOptIn) return false;
      if (nameLower) {
        const guardianName = waiver.guardianName?.toLowerCase() || '';
        const email = waiver.guardianEmail?.toLowerCase() || '';
        if (!guardianName.includes(nameLower) && !email.includes(nameLower)) return false;
      }
      if (waiverDateFilter && waiver.signedAt) {
        const signedDate = waiver.signedAt.split('T')[0];
        if (signedDate !== waiverDateFilter) return false;
      }
      return true;
    });
  }, [waiverState.data, waiverMarketingFilter, waiverNameFilter, waiverDateFilter]);

  const filteredTickets = useMemo(() => {
    const nameLower = ticketNameFilter.toLowerCase().trim();
    return ticketState.data.filter((ticket) => {
      if (ticketStatusFilter !== 'all') {
        const hasUnused = ticket.codes.some((c) => c.status === 'unused');
        const hasRedeemed = ticket.codes.some((c) => c.status === 'redeemed');
        if (ticketStatusFilter === 'unused' && !hasUnused) return false;
        if (ticketStatusFilter === 'redeemed' && !hasRedeemed) return false;
      }
      if (nameLower) {
        const guardianName = `${ticket.guardian?.firstName || ''} ${ticket.guardian?.lastName || ''}`.toLowerCase();
        const email = (ticket.guardian?.email || '').toLowerCase();
        if (!guardianName.includes(nameLower) && !email.includes(nameLower)) return false;
      }
      if (ticketDateFilter && ticket.createdAt) {
        const createdDate = ticket.createdAt.split('T')[0];
        if (createdDate !== ticketDateFilter) return false;
      }
      return true;
    });
  }, [ticketState.data, ticketStatusFilter, ticketNameFilter, ticketDateFilter]);

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

  const handleCancelBooking = async (booking: AdminBooking) => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel booking "${booking.reference}"?`
    );
    if (!confirmed) return;

    try {
      await cancelAdminBooking(booking.id, 'Cancelled by admin');
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel booking.';
      alert(message);
    }
  };

  const handleDeleteBooking = async (booking: AdminBooking) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete booking "${booking.reference}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteAdminBooking(booking.id);
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

  const handleCancelSelectedBooking = async () => {
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

  const handleDeleteTicket = async (ticketId: string, ticketType: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete this ${ticketType} ticket purchase? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteAdminTicketPurchase(ticketId);
      setTicketMessage('Ticket purchase deleted.');
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete ticket.';
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

  const handleCancelMembership = async (membershipId: string, memberName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel the membership for "${memberName}"?`
    );
    if (!confirmed) return;

    try {
      await updateAdminMembership(membershipId, { status: 'cancelled' });
      setMembershipMessage('Membership cancelled successfully.');
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel membership.';
      setMembershipMessage(message);
    }
  };

  const handleDeleteMembership = async (membershipId: string, memberName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete the membership for "${memberName}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteAdminMembership(membershipId);
      if (selectedMembershipId === membershipId) {
        setSelectedMembershipId(null);
      }
      setMembershipMessage('Membership deleted successfully.');
      await refreshAll({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete membership.';
      setMembershipMessage(message);
    }
  };

  const handleValidationLookup = async () => {
    const input = validateInput.trim().toUpperCase();
    if (!input) return;
    setValidationMessage(null);
    setValidationResult(null);
    setTicketValidationResult(null);

    // Check if input looks like a ticket code (PF-XXXXXXXX format)
    const isTicketCode = input.startsWith('PF-') || /^[A-Z0-9]{8,}$/.test(input);

    try {
      if (isTicketCode) {
        // Handle ticket validation and redemption
        const ticketResult = await validateTicketCode(input);
        setTicketValidationResult(ticketResult);

        if (ticketResult.valid && ticketResult.ticket) {
          // Auto-redeem the ticket
          try {
            await redeemTicketByCode(input, user?.firstName || 'Admin');
            setValidationMessage('Ticket redeemed successfully!');
            // Update ticket status in result
            setTicketValidationResult({
              ...ticketResult,
              ticket: ticketResult.ticket ? {
                ...ticketResult.ticket,
                status: 'redeemed',
                redeemedAt: new Date().toISOString(),
              } : null,
            });
          } catch (redeemError) {
            const msg = redeemError instanceof Error ? redeemError.message : 'Failed to redeem ticket';
            setValidationMessage(msg);
          }
        } else {
          setValidationMessage(ticketResult.message);
        }
      } else {
        // Handle membership validation
        const result = await validateMembershipEntry(input);
        setValidationResult(result);
        setValidationMessage('Visit recorded.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to validate entry.';
      setValidationMessage(message);
    }
  };

  const openExportModal = (type: 'waivers' | 'contacts') => {
    setExportType(type);
    setExportDateOption('today');
    setExportDateFrom('');
    setExportDateTo('');
    setExportModalOpen(true);
  };

  const getExportDates = (): { dateFrom?: string; dateTo?: string } => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    switch (exportDateOption) {
      case 'today':
        return { dateFrom: formatDate(today), dateTo: formatDate(today) };
      case 'yesterday':
        return { dateFrom: formatDate(yesterday), dateTo: formatDate(yesterday) };
      case 'range':
        return { dateFrom: exportDateFrom || undefined, dateTo: exportDateTo || undefined };
      case 'all':
      default:
        return {};
    }
  };

  const handleExportDownload = () => {
    const { dateFrom, dateTo } = getExportDates();
    const path = exportType === 'waivers' ? 'waivers/export' : 'contacts/export';
    const url = exportUrl(token, path, dateFrom, dateTo);
    if (url) {
      window.open(url, '_blank');
      setExportModalOpen(false);
    }
  };
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
              <div className={styles.panelTitleRow}>
                <h2>Upcoming bookings</h2>
                <button
                  type="button"
                  className={styles.calendarBtn}
                  onClick={() => setCalendarOpen(true)}
                  title="View calendar"
                >
                  📅 Calendar
                </button>
              </div>
              <span>{filteredBookings.length} of {bookingState.data.length}</span>
            </header>
            <div className={styles.filterBar}>
              <label className={styles.filterItem}>
                <span>Name</span>
                <input
                  type="text"
                  placeholder="Search name..."
                  value={bookingNameFilter}
                  onChange={(e) => setBookingNameFilter(e.target.value)}
                />
              </label>
              <label className={styles.filterItem}>
                <span>Date</span>
                <input
                  type="date"
                  value={bookingDateFilter}
                  onChange={(e) => setBookingDateFilter(e.target.value)}
                />
              </label>
              <label className={styles.filterItem}>
                <span>Status</span>
                <select value={bookingStatusFilter} onChange={(e) => setBookingStatusFilter(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>
              <label className={styles.filterItem}>
                <span>Payment</span>
                <select value={bookingPaymentFilter} onChange={(e) => setBookingPaymentFilter(e.target.value)}>
                  <option value="all">All Payment</option>
                  <option value="awaiting_deposit">Awaiting Deposit</option>
                  <option value="deposit_paid">Deposit Paid</option>
                  <option value="awaiting_full_payment">Awaiting Full</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
            </div>
            {renderBookingTable({ ...bookingState, data: filteredBookings }, handleSelectBooking, handleCancelBooking, handleDeleteBooking, selectedBookingId)}
          </section>


          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Ticket redemption</h2>
              <span>{filteredTickets.length} of {ticketState.data.length}</span>
            </header>
            <div className={styles.filterBar}>
              <label className={styles.filterItem}>
                <span>Name</span>
                <input
                  type="text"
                  placeholder="Search name..."
                  value={ticketNameFilter}
                  onChange={(e) => setTicketNameFilter(e.target.value)}
                />
              </label>
              <label className={styles.filterItem}>
                <span>Date</span>
                <input
                  type="date"
                  value={ticketDateFilter}
                  onChange={(e) => setTicketDateFilter(e.target.value)}
                />
              </label>
              <label className={styles.filterItem}>
                <span>Status</span>
                <select value={ticketStatusFilter} onChange={(e) => setTicketStatusFilter(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="unused">Has Unused</option>
                  <option value="redeemed">Has Redeemed</option>
                </select>
              </label>
            </div>
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
            {renderTicketLog({ ...ticketState, data: filteredTickets }, handleDeleteTicket)}
          </section>
        </div>

        <aside className={styles.columnAside}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Membership roster</h2>
              <span>{filteredMemberships.length} of {membershipState.data.length}</span>
            </header>
            <div className={styles.filterBar}>
              <label className={styles.filterItem}>
                <span>Name</span>
                <input
                  type="text"
                  placeholder="Search name/email..."
                  value={membershipNameFilter}
                  onChange={(e) => setMembershipNameFilter(e.target.value)}
                />
              </label>
              <label className={styles.filterItem}>
                <span>Tier</span>
                <select value={membershipTierFilter} onChange={(e) => setMembershipTierFilter(e.target.value)}>
                  <option value="all">All Tiers</option>
                  <option value="explorer">Silver</option>
                  <option value="adventurer">Gold</option>
                  <option value="champion">Platinum</option>
                </select>
              </label>
              <label className={styles.filterItem}>
                <span>Status</span>
                <select value={membershipStatusFilter} onChange={(e) => setMembershipStatusFilter(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
            </div>
            {membershipMessage && <p className={styles.feedback}>{membershipMessage}</p>}
            {renderMembershipList({ ...membershipState, data: filteredMemberships }, visitLoading, handleRecordVisit, handleSelectMembership, handleCancelMembership, handleDeleteMembership, selectedMembershipId)}
          </section>


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
            {ticketValidationResult && (
              <div
                className={styles.validationResult}
                data-status={ticketValidationResult.valid || ticketValidationResult.ticket?.status === 'redeemed' ? 'allowed' : 'denied'}
              >
                <h3>Ticket: {ticketValidationResult.ticket?.code ?? 'Unknown'}</h3>
                <p>
                  Type: <strong>{ticketValidationResult.ticket?.ticketType ?? 'N/A'}</strong>
                </p>
                <p>
                  Status: <strong style={{ color: ticketValidationResult.ticket?.status === 'redeemed' ? '#22c55e' : ticketValidationResult.ticket?.status === 'unused' ? '#3b82f6' : '#ef4444' }}>
                    {ticketValidationResult.ticket?.status?.toUpperCase() ?? 'UNKNOWN'}
                  </strong>
                </p>
                <p>
                  Quantity: {ticketValidationResult.ticket?.quantity ?? 1} admission(s)
                </p>
                {ticketValidationResult.ticket?.redeemedAt && (
                  <p>
                    Redeemed: {formatDate(ticketValidationResult.ticket.redeemedAt)}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Waiver intake</h2>
              <div className={styles.panelActions}>
                <span className={styles.filterCount}>{filteredWaivers.length} of {waiverState.data.length}</span>
                <button
                  type="button"
                  className={styles.exportLink}
                  onClick={() => openExportModal('waivers')}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className={styles.exportLink}
                  onClick={() => openExportModal('contacts')}
                >
                  Download emails
                </button>
              </div>
            </header>
            <div className={styles.filterBar}>
              <label className={styles.filterItem}>
                <span>Name</span>
                <input
                  type="text"
                  placeholder="Search name/email..."
                  value={waiverNameFilter}
                  onChange={(e) => setWaiverNameFilter(e.target.value)}
                />
              </label>
              <label className={styles.filterItem}>
                <span>Date</span>
                <input
                  type="date"
                  value={waiverDateFilter}
                  onChange={(e) => setWaiverDateFilter(e.target.value)}
                />
              </label>
              <label className={styles.filterItem}>
                <span>Marketing</span>
                <select value={waiverMarketingFilter} onChange={(e) => setWaiverMarketingFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="yes">Opted In</option>
                  <option value="no">Not Opted In</option>
                </select>
              </label>
            </div>
            {renderWaiverList(
              { ...waiverState, data: filteredWaivers },
              handleSelectWaiver,
              handleDeleteWaiver,
              selectedWaiverId,
              waiverDisplayCount,
              () => setWaiverDisplayCount((prev) => prev + 5),
              () => setWaiverDisplayCount((prev) => Math.max(5, prev - 5))
            )}

          </section>
        </aside>
      </div>

      {/* Booking Edit Modal */}
      {selectedBooking && (() => {
        const isGuest = !selectedBooking.guardian && selectedBooking.guestName;
        const customerName = isGuest
          ? `${selectedBooking.guestName} (Guest)`
          : formatGuardian(selectedBooking.guardian);
        const customerEmail = isGuest ? selectedBooking.guestEmail : selectedBooking.guardian?.email;
        const customerPhone = isGuest ? selectedBooking.guestPhone : selectedBooking.guardian?.phone;
        return (
        <div className={styles.modalOverlay} onClick={() => setSelectedBookingId(null)}>
          <div className={`${styles.modalCard} ${styles.bookingModalLarge}`} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div>
                <h2>Edit Booking</h2>
                <span>{selectedBooking.reference}</span>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSelectedBookingId(null)}
              >
                ✕
              </button>
            </header>
            <div className={styles.modalBody}>
              {/* Booking Info (Read-only) */}
              <div className={styles.bookingInfoList}>
                <div className={styles.bookingInfoRow}>
                  <span className={styles.bookingInfoLabel}>Customer</span>
                  <span className={styles.bookingInfoValue}><b>Name:</b> {customerName || '—'} · <b>Email:</b> {customerEmail || '—'} · <b>Phone:</b> {customerPhone || '—'}</span>
                </div>
                <div className={styles.bookingInfoRow}>
                  <span className={styles.bookingInfoLabel}>Booking</span>
                  <span className={styles.bookingInfoValue}><b>Package:</b> {selectedBooking.partyPackage?.name || '—'} · <b>Guests:</b> {selectedBooking.guests || 0} · <b>Total:</b> {formatCurrency(selectedBooking.total)}</span>
                </div>
                <div className={styles.bookingInfoRow}>
                  <span className={styles.bookingInfoLabel}>Payment</span>
                  <span className={styles.bookingInfoValue}><b>Paid:</b> {formatCurrency(selectedBooking.depositAmount)} · <b>Due:</b> {formatCurrency(selectedBooking.balanceRemaining)}</span>
                </div>
              </div>

              {/* Editable Fields */}
              <h4 className={styles.editSectionHeader}>Edit Booking Details</h4>
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
                Customer Notes
                <span className={styles.notesHint}>(visible to customer)</span>
                <textarea
                  value={bookingForm.notes ?? ''}
                  onChange={(event) =>
                    setBookingForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  placeholder="Notes visible to the customer..."
                />
              </label>
              <label className={styles.notesField}>
                Private Notes
                <span className={styles.notesHint}>(staff only)</span>
                <textarea
                  value={bookingForm.privateNotes ?? ''}
                  onChange={(event) =>
                    setBookingForm((prev) => ({ ...prev, privateNotes: event.target.value }))
                  }
                  placeholder="Internal notes for staff only..."
                />
              </label>
              {bookingActionMessage && <p className={styles.modalFeedback}>{bookingActionMessage}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" onClick={handleBookingUpdate} disabled={bookingActionBusy}>
                {bookingActionBusy ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={handleCancelSelectedBooking}
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
          </div>
        </div>
        );
      })()}

      {/* Membership Edit Modal */}
      {selectedMembershipId && (
        <div className={styles.modalOverlay} onClick={() => setSelectedMembershipId(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>Edit Membership</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSelectedMembershipId(null)}
              >
                ✕
              </button>
            </header>
            <div className={styles.modalBody}>
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
              {membershipMessage && <p className={styles.modalFeedback}>{membershipMessage}</p>}
            </div>
            <div className={styles.modalFooter}>
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
          </div>
        </div>
      )}

      {/* Waiver Edit Modal */}
      {selectedWaiverId && (
        <div className={styles.modalOverlay} onClick={() => { setSelectedWaiverId(null); setWaiverActionMessage(null); setWaiverForm(emptyWaiverForm()); }}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <header className={styles.modalHeader}>
              <h2>Edit Waiver</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => {
                  setSelectedWaiverId(null);
                  setWaiverActionMessage(null);
                  setWaiverForm(emptyWaiverForm());
                }}
              >
                ✕
              </button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.waiverCard}>
                <h4 className={styles.waiverCardTitle}>Guardian Information</h4>
                <div className={styles.waiverFormGrid}>
                  <label className={styles.waiverField}>
                    <span>First name</span>
                    <input
                      type="text"
                      value={waiverForm.guardianFirstName}
                      onChange={(e) =>
                        setWaiverForm((prev) => ({ ...prev, guardianFirstName: e.target.value }))
                      }
                    />
                  </label>
                  <label className={styles.waiverField}>
                    <span>Last name</span>
                    <input
                      type="text"
                      value={waiverForm.guardianLastName}
                      onChange={(e) =>
                        setWaiverForm((prev) => ({ ...prev, guardianLastName: e.target.value }))
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
                    <span>Relationship to minor</span>
                    <input
                      type="text"
                      value={waiverForm.relationshipToMinor}
                      onChange={(e) =>
                        setWaiverForm((prev) => ({
                          ...prev,
                          relationshipToMinor: e.target.value,
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
                <h4 className={styles.waiverCardTitle}>Marketing Preferences</h4>
                <label className={styles.waiverToggle}>
                  <input
                    type="checkbox"
                    checked={waiverForm.marketingSmsOptIn}
                    onChange={(e) =>
                      setWaiverForm((prev) => ({
                        ...prev,
                        marketingSmsOptIn: e.target.checked,
                      }))
                    }
                  />
                  <span className={styles.toggleTrack}>
                    <span className={styles.toggleThumb} />
                  </span>
                  <span>Receive SMS marketing</span>
                </label>
                <label className={styles.waiverToggle}>
                  <input
                    type="checkbox"
                    checked={waiverForm.marketingEmailOptIn}
                    onChange={(e) =>
                      setWaiverForm((prev) => ({
                        ...prev,
                        marketingEmailOptIn: e.target.checked,
                      }))
                    }
                  />
                  <span className={styles.toggleTrack}>
                    <span className={styles.toggleThumb} />
                  </span>
                  <span>Receive email marketing</span>
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

              {waiverActionMessage && <p className={styles.modalFeedback}>{waiverActionMessage}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={handleWaiverUpdate}
                disabled={waiverActionBusy}
              >
                {waiverActionBusy ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedWaiverId(null);
                  setWaiverActionMessage(null);
                  setWaiverForm(emptyWaiverForm());
                }}
                className={styles.secondaryButton}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {exportModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setExportModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <header className={styles.modalHeader}>
              <h2>{exportType === 'waivers' ? 'Export Waivers' : 'Download Emails'}</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setExportModalOpen(false)}
              >
                ✕
              </button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.exportOptions}>
                <label className={styles.exportOption}>
                  <input
                    type="radio"
                    name="exportDate"
                    value="today"
                    checked={exportDateOption === 'today'}
                    onChange={() => setExportDateOption('today')}
                  />
                  <span>Today</span>
                </label>
                <label className={styles.exportOption}>
                  <input
                    type="radio"
                    name="exportDate"
                    value="yesterday"
                    checked={exportDateOption === 'yesterday'}
                    onChange={() => setExportDateOption('yesterday')}
                  />
                  <span>Yesterday</span>
                </label>
                <label className={styles.exportOption}>
                  <input
                    type="radio"
                    name="exportDate"
                    value="range"
                    checked={exportDateOption === 'range'}
                    onChange={() => setExportDateOption('range')}
                  />
                  <span>Date Range</span>
                </label>
                <label className={styles.exportOption}>
                  <input
                    type="radio"
                    name="exportDate"
                    value="all"
                    checked={exportDateOption === 'all'}
                    onChange={() => setExportDateOption('all')}
                  />
                  <span>All Time</span>
                </label>
              </div>
              {exportDateOption === 'range' && (
                <div className={styles.dateRangeInputs}>
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={exportDateFrom}
                      onChange={(e) => setExportDateFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={exportDateTo}
                      onChange={(e) => setExportDateTo(e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" onClick={handleExportDownload}>
                Download
              </button>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className={styles.secondaryButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Modal */}
      {calendarOpen && (
        <div className={styles.modalOverlay} onClick={() => { setCalendarOpen(false); setSelectedCalendarBooking(null); }}>
          <div className={`${styles.modalCard} ${styles.calendarModal}`} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>Booking Calendar</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => { setCalendarOpen(false); setSelectedCalendarBooking(null); }}
              >
                ✕
              </button>
            </header>
            <div className={styles.modalBody}>
              {/* Month navigation */}
              <div className={styles.calendarNav}>
                <button
                  type="button"
                  className={styles.calendarNavBtn}
                  onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                >
                  ‹
                </button>
                <span className={styles.calendarMonthTitle}>
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  className={styles.calendarNavBtn}
                  onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                >
                  ›
                </button>
              </div>

              {/* Calendar grid */}
              <div className={styles.calendarGrid}>
                {/* Day headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className={styles.calendarDayHeader}>{day}</div>
                ))}
                {/* Calendar days */}
                {(() => {
                  const year = calendarMonth.getFullYear();
                  const month = calendarMonth.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const today = new Date();
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                  // Get bookings for this month
                  const bookingsByDate: Record<string, AdminBooking[]> = {};
                  bookingState.data.forEach((booking) => {
                    const dateKey = booking.eventDate.split('T')[0];
                    if (!bookingsByDate[dateKey]) bookingsByDate[dateKey] = [];
                    bookingsByDate[dateKey].push(booking);
                  });

                  const days = [];
                  // Empty cells before first day
                  for (let i = 0; i < firstDay; i++) {
                    days.push(<div key={`empty-${i}`} className={`${styles.calendarDay} ${styles.calendarDayEmpty}`} />);
                  }
                  // Actual days
                  for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const dayBookings = bookingsByDate[dateStr] || [];
                    // Sort bookings by time
                    const sortedBookings = [...dayBookings].sort((a, b) => a.startTime.localeCompare(b.startTime));
                    const isToday = dateStr === todayStr;
                    const hasBookings = sortedBookings.length > 0;
                    const isSelected = selectedCalendarBooking && selectedCalendarBooking.eventDate.startsWith(dateStr);

                    let dayClasses = styles.calendarDay;
                    if (isToday) dayClasses += ` ${styles.calendarDayToday}`;
                    if (hasBookings) dayClasses += ` ${styles.calendarDayHasBookings}`;
                    if (isSelected) dayClasses += ` ${styles.calendarDaySelected}`;

                    // Show up to 3 bookings inline, then show "+X more"
                    const maxVisible = 3;
                    const visibleBookings = sortedBookings.slice(0, maxVisible);
                    const moreCount = sortedBookings.length - maxVisible;

                    days.push(
                      <div
                        key={d}
                        className={dayClasses}
                        onClick={() => {
                          if (hasBookings) {
                            setSelectedCalendarBooking(sortedBookings[0]);
                          }
                        }}
                        title={hasBookings ? `${sortedBookings.length} booking(s)` : undefined}
                      >
                        <span className={styles.calendarDayNumber}>{d}</span>
                        {hasBookings && (
                          <div className={styles.calendarDayBookings}>
                            {visibleBookings.map((booking) => {
                              const isGuest = !booking.guardian && booking.guestName;
                              const customerName = isGuest
                                ? booking.guestName
                                : booking.guardian?.firstName || 'Unknown';
                              let itemClass = styles.calendarDayBookingItem;
                              if (booking.status === 'Pending') itemClass += ` ${styles.calendarDayBookingPending}`;
                              if (booking.status === 'Cancelled') itemClass += ` ${styles.calendarDayBookingCancelled}`;
                              return (
                                <div
                                  key={booking.id}
                                  className={itemClass}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCalendarOpen(false);
                                    setSelectedCalendarBooking(null);
                                    handleSelectBooking(booking);
                                  }}
                                >
                                  <span className={styles.calendarDayBookingTime}>{booking.startTime}</span>
                                  <span className={styles.calendarDayBookingName}>{customerName}</span>
                                </div>
                              );
                            })}
                            {moreCount > 0 && (
                              <div className={styles.calendarDayMoreCount}>+{moreCount} more</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return days;
                })()}
              </div>

              {/* Booking preview */}
              {selectedCalendarBooking && (() => {
                const dateStr = selectedCalendarBooking.eventDate.split('T')[0];
                const dayBookings = bookingState.data.filter((b) => b.eventDate.startsWith(dateStr));
                return (
                  <div className={styles.calendarBookingPreview}>
                    <div className={styles.calendarPreviewHeader}>
                      <h4>Bookings on {formatDate(dateStr)}</h4>
                      <button
                        type="button"
                        className={styles.calendarPreviewClose}
                        onClick={() => setSelectedCalendarBooking(null)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className={styles.calendarBookingsList}>
                      {dayBookings.map((booking) => {
                        const isGuest = !booking.guardian && booking.guestName;
                        const customerName = isGuest
                          ? `${booking.guestName} (Guest)`
                          : formatGuardian(booking.guardian);
                        let statusClass = styles.calendarStatusPending;
                        if (booking.status === 'Confirmed') statusClass = styles.calendarStatusConfirmed;
                        if (booking.status === 'Cancelled') statusClass = styles.calendarStatusCancelled;
                        return (
                          <div
                            key={booking.id}
                            className={styles.calendarBookingItem}
                            onClick={() => {
                              setCalendarOpen(false);
                              setSelectedCalendarBooking(null);
                              handleSelectBooking(booking);
                            }}
                          >
                            <div className={styles.calendarBookingInfo}>
                              <strong>{booking.reference}</strong>
                              <span>{booking.startTime} - {customerName}</span>
                              <span>{booking.location}</span>
                            </div>
                            <span className={`${styles.calendarBookingStatus} ${statusClass}`}>
                              {booking.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

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
  onCancel: (booking: AdminBooking) => void,
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
            <th style={{width: '50%'}}>Booking Details</th>
            <th style={{width: '15%'}}>Status</th>
            <th style={{width: '20%'}}>Payment</th>
            <th style={{width: '15%'}}></th>
          </tr>
        </thead>
        <tbody>
          {state.data.map((booking) => {
            const isGuest = !booking.guardian && booking.guestName;
            const customerDisplay = isGuest
              ? `${booking.guestName} (Guest)`
              : formatGuardian(booking.guardian);
            const customerEmail = isGuest ? booking.guestEmail : booking.guardian?.email;
            const customerPhone = isGuest ? booking.guestPhone : booking.guardian?.phone;
            // Calculate paid and due amounts based on payment status
            const isPaid = booking.paymentStatus === 'deposit_paid' || booking.paymentStatus === 'paid';
            const paidAmount = isPaid ? (booking.depositAmount ?? 0) : 0;
            const dueAmount = booking.balanceRemaining ?? 0;
            const hasSplitPayment = dueAmount > 0 && paidAmount > 0;
            const isCancelled = booking.status === 'Cancelled';
            return (
              <tr
                key={booking.id}
                className={booking.id === selectedId ? styles.rowSelected : undefined}
              >
                <td>
                  <div className={styles.customerDetailsCell}>
                    <strong>{customerDisplay}</strong>
                    <small><b>Email:</b> {customerEmail || '—'} · <b>Phone:</b> {customerPhone || '—'}</small>
                    <small><b>Ref:</b> {booking.reference} · <b>Location:</b> {booking.location} · <b>Date:</b> {formatDate(booking.eventDate)} {booking.startTime}</small>
                    <small><b>Package:</b> {booking.partyPackage?.name || '—'} · <b>Guests:</b> {booking.guests || 0}</small>
                  </div>
                </td>
                <td>
                  <span className={isCancelled ? styles.statusCancelled : styles.statusActive}>
                    {booking.status}
                  </span>
                </td>
                <td>
                  <div className={styles.paymentCell}>
                    {isPaid ? (
                      <>
                        <span className={styles.paymentPaid}>
                          Paid: {formatCurrency(paidAmount)}
                        </span>
                        {dueAmount > 0 && (
                          <small className={styles.paymentDue}>
                            Due: {formatCurrency(dueAmount)}
                          </small>
                        )}
                      </>
                    ) : (
                      <>
                        <span className={styles.paymentPending}>
                          Awaiting: {formatCurrency(booking.depositAmount ?? 0)}
                        </span>
                        {hasSplitPayment && (
                          <small className={styles.paymentDue}>
                            + {formatCurrency(dueAmount)} at venue
                          </small>
                        )}
                      </>
                    )}
                  </div>
                </td>
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
                    {isCancelled ? (
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
                    ) : (
                      <button
                        type="button"
                        className={styles.cancelBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancel(booking);
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
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
  displayCount: number,
  onLoadMore: () => void,
  onShowLess: () => void,
) {
  if (state.status === 'loading') return <p>Loading waivers...</p>;
  if (state.status === 'error') return <p className={styles.error}>{state.error}</p>;
  if (state.data.length === 0) return <p>No waivers yet.</p>;

  const visibleWaivers = state.data.slice(0, displayCount);
  const hasMore = state.data.length > displayCount;
  const remaining = state.data.length - displayCount;

  return (
    <>
      <ul className={styles.waiverList}>
        {visibleWaivers.map((waiver) => (
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
              <span>{formatDateTime(waiver.signedAt)}</span>
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
      {(hasMore || displayCount > 5) && (
        <div className={styles.waiverPaginationButtons}>
          {displayCount > 5 && (
            <button
              type="button"
              className={styles.loadMoreBtn}
              onClick={onShowLess}
            >
              Show less
            </button>
          )}
          {hasMore && (
            <button
              type="button"
              className={styles.loadMoreBtn}
              onClick={onLoadMore}
            >
              Show more ({remaining} remaining)
            </button>
          )}
        </div>
      )}
    </>
  );
}

function renderTicketLog(
  state: {
    status: LoadState;
    data: AdminTicketLogEntry[];
    error?: string;
  },
  onDelete: (ticketId: string, ticketType: string) => void
) {
  if (state.status === 'loading') return <p>Loading ticket log...</p>;
  if (state.status === 'error') return <p className={styles.error}>{state.error}</p>;
  if (state.data.length === 0) return <p>No ticket redemptions yet.</p>;
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Type</th>
            <th>Codes</th>
            <th>Qty</th>
            <th>Guardian</th>
            <th>Payment</th>
            <th>Purchased</th>
            <th>Redeemed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.data.map((entry) => {
            const redeemed = entry.codes.filter((code) => code.status === 'redeemed').length;
            const allRedeemed = redeemed === entry.codes.length;
            return (
              <tr key={entry.id}>
                <td>{entry.type}</td>
                <td>
                  <div className={styles.ticketCodes}>
                    {entry.codes.map((c) => (
                      <span
                        key={c.code}
                        className={c.status === 'redeemed' ? styles.codeRedeemed : styles.codeUnused}
                        title={c.status === 'redeemed' ? `Redeemed: ${c.redeemedAt ? formatDate(c.redeemedAt) : 'Yes'}` : 'Unused'}
                      >
                        {c.code}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{entry.quantity}</td>
                <td>{formatGuardian(entry.guardian)}</td>
                <td>
                  <div className={styles.paymentCell}>
                    <span className={styles.paymentPaid}>
                      Paid: {formatCurrency(entry.total)}
                    </span>
                    <small className={styles.paymentComplete}>
                      Full payment
                    </small>
                  </div>
                </td>
                <td>{formatDate(entry.createdAt)}</td>
                <td>
                  <span className={allRedeemed ? styles.redemptionComplete : styles.redemptionPending}>
                    {redeemed}/{entry.codes.length}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => onDelete(entry.id, entry.type)}
                  >
                    Delete
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

function renderMembershipList(
  state: { status: LoadState; data: AdminMembership[]; error?: string },
  visitLoading: string | null,
  onRecordVisit: (membershipId: string) => void,
  onEdit: (member: AdminMembership) => void,
  onCancel: (membershipId: string, memberName: string) => void,
  onDelete: (membershipId: string, memberName: string) => void,
  selectedMembershipId: string | null
) {
  if (state.status === 'loading') return <p>Loading memberships...</p>;
  if (state.status === 'error') return <p className={styles.error}>{state.error}</p>;
  if (state.data.length === 0) return <p>No active memberships.</p>;
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.membershipTable}>
        <thead>
          <tr>
            <th>Family</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Visits</th>
            <th>Last visit</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.data.map((member) => {
            const membershipId = member.membership?.membershipId ?? member.userId;
            const isSelected = membershipId === selectedMembershipId;
            const status = member.membership?.status ?? 'active';
            const isCancelled = status === 'cancelled';
            const name = `${member.firstName} ${member.lastName ?? ''}`.trim();
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
                <td>
                  <span className={isCancelled ? styles.statusCancelled : styles.statusActive}>
                    {status}
                  </span>
                </td>
                <td>{formatVisitSummary(member.membership)}</td>
                <td>
                  {member.membership?.lastVisitAt ? formatDate(member.membership.lastVisitAt) : '--'}
                </td>
                <td>
                  <div className={styles.membershipActions}>
                    <button
                      type="button"
                      className={styles.checkInBtn}
                      onClick={() => member.membership?.membershipId && onRecordVisit(member.membership.membershipId)}
                      disabled={!member.membership?.membershipId || visitLoading === membershipId || isCancelled}
                    >
                      {visitLoading === membershipId ? 'Recording...' : 'Check in'}
                    </button>
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={() => onEdit(member)}
                      disabled={!member.membership?.membershipId}
                    >
                      Edit
                    </button>
                    {isCancelled ? (
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => member.membership?.membershipId && onDelete(member.membership.membershipId, name)}
                        disabled={!member.membership?.membershipId}
                      >
                        Delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.cancelBtn}
                        onClick={() => member.membership?.membershipId && onCancel(member.membership.membershipId, name)}
                        disabled={!member.membership?.membershipId}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
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
    privateNotes: booking.privateNotes ?? '',
  };
}

function cleanBookingForm(form: BookingFormState): AdminBookingUpdatePayload {
  const payload: AdminBookingUpdatePayload = {};
  if (form.status) payload.status = form.status;
  if (form.eventDate) payload.eventDate = form.eventDate;
  if (form.startTime) payload.startTime = form.startTime;
  if (form.location) payload.location = form.location;
  if (form.notes !== undefined) payload.notes = form.notes;
  if (form.privateNotes !== undefined) payload.privateNotes = form.privateNotes;
  return payload;
}

function emptyWaiverForm(): WaiverFormState {
  return {
    guardianFirstName: '',
    guardianLastName: '',
    guardianEmail: '',
    guardianPhone: '',
    guardianDateOfBirth: '',
    relationshipToMinor: '',
    expiresAt: '',
    marketingSmsOptIn: false,
    marketingEmailOptIn: false,
    children: [],
  };
}

function toWaiverForm(waiver: AdminWaiver): WaiverFormState {
  return {
    guardianFirstName: waiver.guardianFirstName ?? '',
    guardianLastName: waiver.guardianLastName ?? '',
    guardianEmail: waiver.guardianEmail ?? '',
    guardianPhone: waiver.guardianPhone ?? '',
    guardianDateOfBirth: waiver.guardianDateOfBirth ? waiver.guardianDateOfBirth.slice(0, 10) : '',
    relationshipToMinor: waiver.relationshipToMinor ?? waiver.relationshipToChildren ?? '',
    expiresAt: waiver.expiresAt ? waiver.expiresAt.slice(0, 10) : '',
    marketingSmsOptIn: Boolean(waiver.marketingSmsOptIn),
    marketingEmailOptIn: Boolean(waiver.marketingEmailOptIn),
    children: Array.isArray(waiver.children)
      ? waiver.children.map((child) => {
        const childName = child.name || `${child.first_name || ''} ${child.last_name || ''}`.trim();
        const childDob = child.birthDate || child.birth_date || '';
        return {
          name: childName ?? '',
          birthDate: childDob ? childDob.slice(0, 10) : '',
        };
      })
      : [],
  };
}

function cleanWaiverForm(form: WaiverFormState): AdminWaiverUpdatePayload {
  const normalizeText = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    guardianFirstName: normalizeText(form.guardianFirstName),
    guardianLastName: normalizeText(form.guardianLastName),
    guardianEmail: normalizeText(form.guardianEmail),
    guardianPhone: normalizeText(form.guardianPhone),
    guardianDateOfBirth: normalizeText(form.guardianDateOfBirth),
    relationshipToMinor: normalizeText(form.relationshipToMinor),
    expiresAt: normalizeText(form.expiresAt),
    marketingSmsOptIn: Boolean(form.marketingSmsOptIn),
    marketingEmailOptIn: Boolean(form.marketingEmailOptIn),
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

function exportUrl(token: string | null | undefined, path: string, dateFrom?: string, dateTo?: string) {
  if (!token) return null;
  const url = new URL(`${API_BASE_URL}/admin/${path}`);
  url.searchParams.set('token', token);
  if (dateFrom) url.searchParams.set('dateFrom', dateFrom);
  if (dateTo) url.searchParams.set('dateTo', dateTo);
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
