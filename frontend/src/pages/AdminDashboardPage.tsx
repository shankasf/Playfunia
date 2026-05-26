import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { PrimaryButton } from '../components/common/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime, formatTime } from '../lib/dateUtils';
import { fetchPartyPackages, type PartyPackageDto } from '../api/bookings';
import {
  AdminBooking,
  AdminBookingUpdatePayload,
  AdminMembership,
  AdminMembershipUpdatePayload,
  AdminProductPromotion,
  AdminPromoOffer,
  AdminPromoOfferPlan,
  AdminSummary,
  AdminTicketLogEntry,
  AdminWaiver,
  AdminWaiverUpdatePayload,
  MembershipValidationResult,
  cancelAdminBooking,
  createAdminBooking,
  AdminCreateBookingPayload,
  issueAdminTickets,
  AdminIssueTicketPayload,
  createAdminMembership,
  AdminCreateMembershipPayload,
  createAdminEventSource,
  createAdminPromotion,
  createAdminPromoOffer,
  deleteAdminBooking,
  deleteAdminMembership,
  deleteAdminPromotion,
  deleteAdminPromoOffer,
  deleteAdminTicketPurchase,
  deleteAdminWaiverSubmission,
  fetchAdminBookings,
  fetchAdminMemberships,
  fetchAdminPromotions,
  fetchAdminPromoOffers,
  fetchAdminSummary,
  fetchAdminTicketLog,
  fetchAdminWaivers,
  recordAdminMembershipVisit,
  redeemTicketByCode,
  redeemTicketCode,
  updateAdminMembership,
  updateAdminPromotion,
  updateAdminPromoOffer,
  updateAdminWaiverSubmission,
  updateAdminBooking,
  validateMembershipEntry,
  validateTicketCode,
  fetchAdminUsers,
  updateAdminUserRoles,
  type AdminUser,
  type TicketValidationResult,
} from '../api/admin';
import { API_BASE_URL } from '../api/client';
import {
  fetchAdminCoupons,
  createAdminCoupon,
  updateAdminCoupon,
  deleteAdminCoupon,
  type AdminCoupon,
  type CouponCategory,
} from '../api/coupons';
import styles from './AdminDashboardPage.module.css';

type LoadState = 'idle' | 'loading' | 'error';

/** Get today's date as YYYY-MM-DD in local timezone (not UTC) */
function getLocalDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const COUPON_CATEGORY_LABELS: Record<CouponCategory, { singular: string; plural: string }> = {
  all: { singular: 'All', plural: 'All purchases' },
  membership: { singular: 'Membership', plural: 'Memberships' },
  ticket: { singular: 'Ticket', plural: 'Tickets' },
  party_booking: { singular: 'Party booking', plural: 'Party bookings' },
};

function formatCouponCategory(cat: CouponCategory): string {
  return COUPON_CATEGORY_LABELS[cat]?.singular ?? cat;
}

function formatCouponCategoryPlural(cat: CouponCategory): string {
  return COUPON_CATEGORY_LABELS[cat]?.plural ?? cat;
}

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
  const { user, token, isTeamMember, isAdmin, isLoading: authLoading, logout } = useAuth();
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
  const [partyPackages, setPartyPackages] = useState<PartyPackageDto[]>([]);
  const [showCreateBooking, setShowCreateBooking] = useState(false);
  const [createBookingBusy, setCreateBookingBusy] = useState(false);
  const [createBookingForm, setCreateBookingForm] = useState<AdminCreateBookingPayload>({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    childName: '',
    partyPackageId: '',
    location: 'Albany',
    eventDate: getLocalDateStr(),
    startTime: '10:00',
    endTime: '',
    guests: 12,
    total: 0,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    notes: '',
    privateNotes: '',
  });
  // Issue tickets modal state
  const [showIssueTickets, setShowIssueTickets] = useState(false);
  const [issueTicketsBusy, setIssueTicketsBusy] = useState(false);
  const [issueTicketForm, setIssueTicketForm] = useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    quantity: 1,
    unitPrice: 20,
    paymentMethod: 'cash',
  });

  // Create membership modal state
  const [showCreateMembership, setShowCreateMembership] = useState(false);
  const [createMembershipBusy, setCreateMembershipBusy] = useState(false);
  const [membershipCreateForm, setMembershipCreateForm] = useState<AdminCreateMembershipPayload>({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    childName: '',
    password: '',
    planId: 0,
    tier: '',
    durationMonths: 1,
    monthlyPrice: 0,
    total: 0,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
  });

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
    tier: 'mini',
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

  // Promotions state
  const [promoState, setPromoState] = useState<{ status: LoadState; data: AdminProductPromotion[] }>({ status: 'idle', data: [] });
  const [promoFormOpen, setPromoFormOpen] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<number | null>(null);
  const [promoForm, setPromoForm] = useState({
    product_type: 'membership',
    discount_type: 'percent' as 'percent' | 'fixed_price',
    discount_value: 50,
    promo_label: '',
    promo_note: '',
    starts_at: '',
    ends_at: '',
    max_redemptions: '',
  });
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);

  // Promo Offers state
  const [promoOfferState, setPromoOfferState] = useState<{ status: LoadState; data: AdminPromoOffer[] }>({ status: 'idle', data: [] });
  const [promoOfferFormOpen, setPromoOfferFormOpen] = useState(false);
  const [editingPromoOfferId, setEditingPromoOfferId] = useState<number | null>(null);
  const emptyPlan: AdminPromoOfferPlan = { name: '', normalValue: 0, regularPrice: 0, promoPrice: 0, savingsPercent: 0 };
  const [promoOfferForm, setPromoOfferForm] = useState({
    title: '',
    subtitle: '',
    promo_label: '',
    promo_note: '',
    notes: [''] as string[],
    plans: [{ ...emptyPlan }] as AdminPromoOfferPlan[],
    starts_at: '',
    ends_at: '',
    max_redemptions: '',
  });
  const [promoOfferMessage, setPromoOfferMessage] = useState<string | null>(null);
  const [promoOfferBusy, setPromoOfferBusy] = useState(false);

  // Coupon code state (cart-redeemable promo codes for memberships, tickets, bookings or all)
  const [couponState, setCouponState] = useState<{ status: LoadState; data: AdminCoupon[] }>({ status: 'idle', data: [] });
  const [couponFormOpen, setCouponFormOpen] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<number | null>(null);
  const [couponForm, setCouponForm] = useState({
    code: '',
    description: '',
    discount_type: 'percent' as 'percent' | 'fixed',
    discount_value: '10',
    applies_to: ['all'] as CouponCategory[],
    min_purchase_usd: '',
    max_redemptions: '',
    valid_from: '',
    valid_to: '',
    is_active: true,
  });
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const refreshCoupons = useCallback(async () => {
    try {
      const { coupons } = await fetchAdminCoupons();
      setCouponState({ status: 'idle', data: coupons });
    } catch {
      setCouponState({ status: 'error', data: [] });
    }
  }, []);

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

  // Team / Users management (admin only)
  const [teamState, setTeamState] = useState<{ status: LoadState; data: AdminUser[]; error?: string }>({
    status: 'idle',
    data: [],
  });
  const [teamSearch, setTeamSearch] = useState('');
  const [roleUpdateBusy, setRoleUpdateBusy] = useState<number | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);

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
        const [summary, bookings, waivers, tickets, memberships, promotions, promoOffers, packages] = await Promise.all([
          fetchAdminSummary(),
          fetchAdminBookings(),
          fetchAdminWaivers(),
          fetchAdminTicketLog(),
          fetchAdminMemberships(),
          isAdmin ? fetchAdminPromotions().catch(() => [] as AdminProductPromotion[]) : Promise.resolve([] as AdminProductPromotion[]),
          isAdmin ? fetchAdminPromoOffers().catch(() => [] as AdminPromoOffer[]) : Promise.resolve([] as AdminPromoOffer[]),
          fetchPartyPackages().catch(() => [] as PartyPackageDto[]),
        ]);
        setSummaryState({ status: 'idle', data: summary });
        setBookingState({ status: 'idle', data: bookings });
        setWaiverState({ status: 'idle', data: waivers });
        setTicketState({ status: 'idle', data: tickets });
        setMembershipState({ status: 'idle', data: memberships });
        setPromoState({ status: 'idle', data: promotions });
        setPromoOfferState({ status: 'idle', data: promoOffers });
        // Coupons are independent and admin-only — fetch silently for admins only.
        if (isAdmin) void refreshCoupons();
        if (packages.length > 0) setPartyPackages(packages);
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
    [isAuthorized, isAdmin]
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

  // With a search term, look up any user (to promote one to staff/admin);
  // otherwise show only existing team members — never the full customer base.
  const loadTeam = useCallback(async (search: string) => {
    if (!isAdmin) return;
    setTeamState((prev) => ({ ...prev, status: 'loading', error: undefined }));
    try {
      const q = search.trim();
      const users = q
        ? await fetchAdminUsers({ search: q })
        : await fetchAdminUsers({ teamOnly: true });
      setTeamState({ status: 'idle', data: users });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load team members.';
      setTeamState({ status: 'error', data: [], error: message });
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAuthorized || !isAdmin) return;
    // Immediate on first load (empty search); debounce while typing a search.
    const delay = teamSearch.trim() ? 400 : 0;
    const timer = window.setTimeout(() => { void loadTeam(teamSearch); }, delay);
    return () => window.clearTimeout(timer);
  }, [isAuthorized, isAdmin, teamSearch, loadTeam]);

  // Toggle a user's team role. Preserves any baseline (customer/user) role and
  // swaps the elevated role (admin / employee) so the account stays valid.
  const handleSetUserRole = useCallback(
    async (target: AdminUser, role: 'admin' | 'employee' | 'customer') => {
      const TEAM_ROLES = ['admin', 'employee', 'staff'];
      const label = role === 'admin' ? 'Admin' : role === 'employee' ? 'Staff' : 'Customer (no admin access)';
      if (!window.confirm(`Set ${target.email} to ${label}?`)) return;
      const base = (target.roles ?? []).filter((r) => !TEAM_ROLES.includes(r));
      const baseline = base.length > 0 ? base : ['customer'];
      const nextRoles = role === 'customer' ? baseline : [...baseline, role];
      setRoleUpdateBusy(target.user_id);
      setTeamMessage(null);
      try {
        await updateAdminUserRoles(target.user_id, nextRoles);
        setTeamMessage(`${target.email} is now ${label}.`);
        await loadTeam(teamSearch);
      } catch (error) {
        setTeamMessage(error instanceof Error ? error.message : 'Unable to update role.');
      } finally {
        setRoleUpdateBusy(null);
      }
    },
    [loadTeam, teamSearch]
  );

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

  const calcEndTime = (startTime: string, durationMinutes: number): string => {
    const [h, m] = startTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const totalMin = h * 60 + m + durationMinutes;
    const eh = Math.floor(totalMin / 60) % 24;
    const em = totalMin % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  };

  const handleCreateBooking = async () => {
    if (!createBookingForm.guestName.trim()) {
      alert('Customer name is required.');
      return;
    }
    if (!createBookingForm.partyPackageId) {
      alert('Please select a party package.');
      return;
    }
    setCreateBookingBusy(true);
    try {
      await createAdminBooking({
        ...createBookingForm,
        guestName: createBookingForm.guestName.trim(),
        guestEmail: createBookingForm.guestEmail?.trim() || undefined,
        guestPhone: createBookingForm.guestPhone?.trim() || undefined,
        childName: createBookingForm.childName?.trim() || undefined,
        notes: createBookingForm.notes?.trim() || undefined,
        privateNotes: createBookingForm.privateNotes?.trim() || undefined,
      });
      setShowCreateBooking(false);
      setCreateBookingForm({
        guestName: '',
        guestEmail: '',
        guestPhone: '',
        childName: '',
        partyPackageId: '',
        location: 'Albany',
        eventDate: getLocalDateStr(),
        startTime: '10:00',
        endTime: '',
        guests: 12,
        total: 0,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        notes: '',
        privateNotes: '',
      });
      await refreshAll({ silent: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create booking.');
    } finally {
      setCreateBookingBusy(false);
    }
  };

  const handleIssueTickets = async () => {
    if (!issueTicketForm.guestName.trim()) {
      alert('Customer name is required.');
      return;
    }
    setIssueTicketsBusy(true);
    try {
      const result = await issueAdminTickets({
        guestName: issueTicketForm.guestName.trim(),
        guestEmail: issueTicketForm.guestEmail.trim() || undefined,
        guestPhone: issueTicketForm.guestPhone.trim() || undefined,
        quantity: issueTicketForm.quantity,
        unitPrice: issueTicketForm.unitPrice,
        total: issueTicketForm.quantity * issueTicketForm.unitPrice,
        paymentMethod: issueTicketForm.paymentMethod,
      });
      alert(`Tickets issued! Codes: ${result.codes.join(', ')}`);
      setShowIssueTickets(false);
      setIssueTicketForm({ guestName: '', guestEmail: '', guestPhone: '', quantity: 1, unitPrice: 20, paymentMethod: 'cash' });
      await refreshAll({ silent: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to issue tickets.');
    } finally {
      setIssueTicketsBusy(false);
    }
  };

  const handleCreateMembership = async () => {
    if (!membershipCreateForm.guestName.trim()) {
      alert('Customer name is required.');
      return;
    }
    if (!membershipCreateForm.guestEmail?.trim()) {
      alert('Email is required to create a login account.');
      return;
    }
    if (!membershipCreateForm.password?.trim() || membershipCreateForm.password.trim().length < 6) {
      alert('Password is required (min 6 characters).');
      return;
    }
    if (!membershipCreateForm.planId) {
      alert('Please select a membership plan.');
      return;
    }
    setCreateMembershipBusy(true);
    try {
      const result = await createAdminMembership({
        ...membershipCreateForm,
        guestName: membershipCreateForm.guestName.trim(),
        guestEmail: membershipCreateForm.guestEmail.trim(),
        guestPhone: membershipCreateForm.guestPhone?.trim() || undefined,
        childName: membershipCreateForm.childName?.trim() || undefined,
        password: membershipCreateForm.password.trim(),
      });
      alert(`Membership created! ID: ${result.displayId}${result.receiptNumber ? ` | Receipt: ${result.receiptNumber}` : ''}`);
      setShowCreateMembership(false);
      setMembershipCreateForm({
        guestName: '', guestEmail: '', guestPhone: '', childName: '', password: '',
        planId: 0, tier: '', durationMonths: 1, monthlyPrice: 0, total: 0,
        paymentMethod: 'cash', paymentStatus: 'paid',
      });
      await refreshAll({ silent: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create membership.');
    } finally {
      setCreateMembershipBusy(false);
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
    const tierName = member.membership.tierName.toLowerCase();
    const tierCode = tierName === 'mini plan' ? 'mini'
      : tierName === 'super plan' ? 'super'
      : tierName === 'mega plan' ? 'mega'
      // Legacy tiers
      : tierName === 'silver' ? 'explorer'
      : tierName === 'gold' ? 'adventurer'
      : tierName === 'platinum' ? 'champion'
      : 'mini';
    setMembershipForm({
      tier: tierCode,
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
          <button type="button" className={styles.checkInBtn} onClick={() => setShowCreateMembership(true)}>
            + Create Membership
          </button>
          <button type="button" className={styles.checkInBtn} onClick={() => setShowIssueTickets(true)}>
            Issue Tickets
          </button>
          <button type="button" className={styles.signOutButton} onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        {renderSummaryCard(
          'Bookings',
          summary?.bookings.total ?? 0,
          'Total',
          `${summary?.bookings.today ?? 0} today`,
          'section-bookings'
        )}
        {renderSummaryCard(
          'Waivers',
          summary?.waivers.total ?? 0,
          'Total',
          `${summary?.waivers.today ?? 0} today`,
          'section-waivers'
        )}
        {isAdmin
          ? renderSummaryCard(
              'Ticket Revenue',
              formatCurrency(summary?.tickets.totalRevenue ?? 0),
              'Total',
              `${formatCurrency(summary?.tickets.todayRevenue ?? 0)} today`,
              'section-tickets'
            )
          : renderSummaryCard(
              'Tickets',
              summary?.tickets.totalPurchases ?? 0,
              'Purchases',
              `${summary?.tickets.salesToday ?? 0} sold today`,
              'section-tickets'
            )}
        {renderSummaryCard(
          'Memberships',
          summary?.memberships.total ?? 0,
          'Total',
          `${summary?.memberships.activeMembers ?? 0} active`,
          'section-memberships'
        )}
        {isAdmin && (
          <Link to="/admin/applicants" style={{ textDecoration: 'none', display: 'contents' }}>
            {renderSummaryCard(
              'Jobs & Applicants',
              summary?.applicants?.total ?? 0,
              'Applicants',
              `${summary?.applicants?.pendingCount ?? 0} pending review`
            )}
          </Link>
        )}
        {isAdmin && (
          <Link to="/admin/events" style={{ textDecoration: 'none', display: 'contents' }}>
            {renderSummaryCard(
              'Events',
              summary?.events?.total ?? 0,
              'Total',
              `${summary?.events?.today ?? 0} today`
            )}
          </Link>
        )}
      </section>

      <div className={styles.layout}>
        <div className={styles.columnPrimary}>
          <section id="section-bookings" className={styles.panel}>
            <header className={styles.panelHeader}>
              <div className={styles.panelTitleRow}>
                <h2>Upcoming Party Bookings</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={styles.checkInBtn}
                    onClick={() => setShowCreateBooking(true)}
                  >
                    + Create Party Booking
                  </button>
                  <button
                    type="button"
                    className={styles.calendarBtn}
                    onClick={() => setCalendarOpen(true)}
                    title="View calendar"
                  >
                    📅 Calendar
                  </button>
                </div>
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
            {renderBookingTable({ ...bookingState, data: filteredBookings }, handleSelectBooking, handleCancelBooking, handleDeleteBooking, selectedBookingId, isAdmin)}
          </section>


          <section id="section-tickets" className={styles.panel}>
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
            {renderTicketLog({ ...ticketState, data: filteredTickets }, handleDeleteTicket, isAdmin)}
          </section>
        </div>

        <aside className={styles.columnAside}>
          <section id="section-memberships" className={styles.panel}>
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
                  <option value="mini">Mini Plan</option>
                  <option value="super">Super Plan</option>
                  <option value="mega">Mega Plan</option>
                  <option value="explorer">Silver (Legacy)</option>
                  <option value="adventurer">Gold (Legacy)</option>
                  <option value="champion">Platinum (Legacy)</option>
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
            {renderMembershipList({ ...membershipState, data: filteredMemberships }, visitLoading, handleRecordVisit, handleSelectMembership, handleCancelMembership, handleDeleteMembership, selectedMembershipId, isAdmin)}
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

          <section id="section-waivers" className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Waiver intake</h2>
              <div className={styles.panelActions}>
                <span className={styles.filterCount}>{filteredWaivers.length} of {waiverState.data.length}</span>
                {isAdmin && (
                  <>
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
                  </>
                )}
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
              () => setWaiverDisplayCount((prev) => Math.max(5, prev - 5)),
              isAdmin
            )}

          </section>
        </aside>
      </div>

      {/* Promotions Panel */}
      {isAdmin && (
      <section id="section-promotions" className={styles.panel} style={{ marginTop: '1.5rem' }}>
        <header className={styles.panelHeader}>
          <h2>Promotions</h2>
          <div className={styles.panelActions}>
            <button
              type="button"
              className={styles.exportLink}
              onClick={() => {
                setEditingPromoId(null);
                setPromoForm({
                  product_type: 'membership',
                  discount_type: 'percent',
                  discount_value: 50,
                  promo_label: '',
                  promo_note: '',
                  starts_at: new Date().toISOString().slice(0, 16),
                  ends_at: '',
                  max_redemptions: '',
                });
                setPromoMessage(null);
                setPromoFormOpen(true);
              }}
            >
              + New Promotion
            </button>
          </div>
        </header>

        {promoState.data.length === 0 ? (
          <p style={{ padding: '1rem', color: '#64748b', fontSize: '0.9rem' }}>No promotions configured yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Label</th>
                <th>Type</th>
                <th>Discount</th>
                <th>Starts</th>
                <th>Ends</th>
                <th>Redeemed</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promoState.data.map(promo => {
                const now = new Date();
                const isExpired = new Date(promo.ends_at) < now;
                const isNotStarted = new Date(promo.starts_at) > now;
                const isCapped = promo.max_redemptions != null && promo.redemptions >= promo.max_redemptions;
                const isLive = promo.is_active && !isExpired && !isNotStarted && !isCapped;
                let statusLabel = 'Active';
                let statusColor = '#16a34a';
                if (!promo.is_active) { statusLabel = 'Disabled'; statusColor = '#94a3b8'; }
                else if (isExpired) { statusLabel = 'Expired'; statusColor = '#94a3b8'; }
                else if (isCapped) { statusLabel = 'Limit reached'; statusColor = '#f59e0b'; }
                else if (isNotStarted) { statusLabel = 'Scheduled'; statusColor = '#6366f1'; }

                return (
                  <tr key={promo.promotion_id}>
                    <td><strong>{promo.promo_label || '—'}</strong>{promo.promo_note ? <><br /><small style={{ color: '#64748b' }}>{promo.promo_note}</small></> : null}</td>
                    <td style={{ textTransform: 'capitalize' }}>{promo.product_type}{promo.product_id ? ` #${promo.product_id}` : ' (all)'}</td>
                    <td>{promo.discount_type === 'percent' ? `${promo.discount_value}%` : `$${promo.discount_value}`}</td>
                    <td>{formatDate(promo.starts_at)}</td>
                    <td>{formatDate(promo.ends_at)}</td>
                    <td>{promo.redemptions}{promo.max_redemptions != null ? ` / ${promo.max_redemptions}` : ''}</td>
                    <td><span style={{ color: statusColor, fontWeight: 600, fontSize: '0.82rem' }}>{statusLabel}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => {
                            setEditingPromoId(promo.promotion_id);
                            setPromoForm({
                              product_type: promo.product_type,
                              discount_type: promo.discount_type,
                              discount_value: promo.discount_value,
                              promo_label: promo.promo_label || '',
                              promo_note: promo.promo_note || '',
                              starts_at: promo.starts_at.slice(0, 16),
                              ends_at: promo.ends_at.slice(0, 16),
                              max_redemptions: promo.max_redemptions != null ? String(promo.max_redemptions) : '',
                            });
                            setPromoMessage(null);
                            setPromoFormOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        {promo.is_active ? (
                          <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={async () => {
                              if (!window.confirm('Deactivate this promotion?')) return;
                              await deleteAdminPromotion(promo.promotion_id);
                              refreshAll({ silent: true });
                            }}
                          >
                            Disable
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      )}

      {/* Promotion Create/Edit Modal */}
      {promoFormOpen && (
        <div className={styles.modalOverlay} onClick={() => setPromoFormOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>{editingPromoId ? 'Edit Promotion' : 'New Promotion'}</h2>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setPromoFormOpen(false)}>
                &times;
              </button>
            </header>
            <form
              className={styles.modalBody}
              onSubmit={async (e) => {
                e.preventDefault();
                setPromoBusy(true);
                setPromoMessage(null);
                try {
                  const payload = {
                    product_type: promoForm.product_type,
                    discount_type: promoForm.discount_type as 'percent' | 'fixed_price',
                    discount_value: Number(promoForm.discount_value),
                    promo_label: promoForm.promo_label || undefined,
                    promo_note: promoForm.promo_note || undefined,
                    starts_at: new Date(promoForm.starts_at).toISOString(),
                    ends_at: new Date(promoForm.ends_at).toISOString(),
                    max_redemptions: promoForm.max_redemptions ? Number(promoForm.max_redemptions) : null,
                  };
                  if (editingPromoId) {
                    await updateAdminPromotion(editingPromoId, payload);
                    setPromoMessage('Promotion updated.');
                  } else {
                    await createAdminPromotion(payload);
                    setPromoMessage('Promotion created.');
                  }
                  await refreshAll({ silent: true });
                  setTimeout(() => setPromoFormOpen(false), 800);
                } catch (err) {
                  setPromoMessage(err instanceof Error ? err.message : 'Failed to save promotion.');
                } finally {
                  setPromoBusy(false);
                }
              }}
            >
              <div className={styles.formRow}>
                <label>Product Type</label>
                <select
                  value={promoForm.product_type}
                  onChange={(e) => setPromoForm(f => ({ ...f, product_type: e.target.value }))}
                >
                  <option value="membership">Membership</option>
                  <option value="ticket">Ticket</option>
                  <option value="party">Party</option>
                  <option value="add_on">Add-on</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Discount Type</label>
                <select
                  value={promoForm.discount_type}
                  onChange={(e) => setPromoForm(f => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed_price' }))}
                >
                  <option value="percent">Percentage Off</option>
                  <option value="fixed_price">Fixed Price</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label>{promoForm.discount_type === 'percent' ? 'Discount %' : 'Fixed Price ($)'}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={promoForm.discount_value}
                  onChange={(e) => setPromoForm(f => ({ ...f, discount_value: Number(e.target.value) }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Promo Label</label>
                <input
                  type="text"
                  placeholder="e.g. Launch Promotion – 50% OFF"
                  value={promoForm.promo_label}
                  onChange={(e) => setPromoForm(f => ({ ...f, promo_label: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Promo Note</label>
                <input
                  type="text"
                  placeholder="e.g. For first members only"
                  value={promoForm.promo_note}
                  onChange={(e) => setPromoForm(f => ({ ...f, promo_note: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Starts At</label>
                <input
                  type="datetime-local"
                  required
                  value={promoForm.starts_at}
                  onChange={(e) => setPromoForm(f => ({ ...f, starts_at: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Ends At</label>
                <input
                  type="datetime-local"
                  required
                  value={promoForm.ends_at}
                  onChange={(e) => setPromoForm(f => ({ ...f, ends_at: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Max Redemptions (leave empty for unlimited)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 100"
                  value={promoForm.max_redemptions}
                  onChange={(e) => setPromoForm(f => ({ ...f, max_redemptions: e.target.value }))}
                />
              </div>
              {promoMessage && (
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: promoMessage.includes('Failed') ? '#dc2626' : '#16a34a', margin: '0.5rem 0 0' }}>
                  {promoMessage}
                </p>
              )}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setPromoFormOpen(false)}>Cancel</button>
                <button type="submit" className={styles.saveBtn} disabled={promoBusy}>
                  {promoBusy ? 'Saving...' : editingPromoId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Promo Offers Panel */}
      {isAdmin && (
      <section id="section-promo-offers" className={styles.panel} style={{ marginTop: '1.5rem' }}>
        <header className={styles.panelHeader}>
          <h2>Promo Offers</h2>
          <div className={styles.panelActions}>
            <button
              type="button"
              className={styles.exportLink}
              onClick={() => {
                setEditingPromoOfferId(null);
                setPromoOfferForm({
                  title: '',
                  subtitle: '',
                  promo_label: '',
                  promo_note: '',
                  notes: [''],
                  plans: [{ ...emptyPlan }],
                  starts_at: new Date().toISOString().slice(0, 16),
                  ends_at: '',
                  max_redemptions: '',
                });
                setPromoOfferMessage(null);
                setPromoOfferFormOpen(true);
              }}
            >
              + New Promo Offer
            </button>
          </div>
        </header>

        {promoOfferState.data.length === 0 ? (
          <p style={{ padding: '1rem', color: '#64748b', fontSize: '0.9rem' }}>No promo offers configured yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Label</th>
                <th>Plans</th>
                <th>Starts</th>
                <th>Ends</th>
                <th>Redeemed</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promoOfferState.data.map(offer => {
                const now = new Date();
                const isExpired = new Date(offer.ends_at) < now;
                const isNotStarted = new Date(offer.starts_at) > now;
                const isCapped = offer.max_redemptions != null && offer.redemptions >= offer.max_redemptions;
                let statusLabel = 'Active';
                let statusColor = '#16a34a';
                if (!offer.is_active) { statusLabel = 'Disabled'; statusColor = '#94a3b8'; }
                else if (isExpired) { statusLabel = 'Expired'; statusColor = '#94a3b8'; }
                else if (isCapped) { statusLabel = 'Limit reached'; statusColor = '#f59e0b'; }
                else if (isNotStarted) { statusLabel = 'Scheduled'; statusColor = '#6366f1'; }

                return (
                  <tr key={offer.offer_id}>
                    <td><strong>{offer.title}</strong>{offer.subtitle ? <><br /><small style={{ color: '#64748b' }}>{offer.subtitle}</small></> : null}</td>
                    <td>{offer.promo_label || '—'}</td>
                    <td>{offer.plans.length} plan{offer.plans.length !== 1 ? 's' : ''}</td>
                    <td>{formatDate(offer.starts_at)}</td>
                    <td>{formatDate(offer.ends_at)}</td>
                    <td>{offer.redemptions}{offer.max_redemptions != null ? ` / ${offer.max_redemptions}` : ''}</td>
                    <td><span style={{ color: statusColor, fontWeight: 600, fontSize: '0.82rem' }}>{statusLabel}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => {
                            setEditingPromoOfferId(offer.offer_id);
                            setPromoOfferForm({
                              title: offer.title,
                              subtitle: offer.subtitle || '',
                              promo_label: offer.promo_label || '',
                              promo_note: offer.promo_note || '',
                              notes: offer.notes.length > 0 ? [...offer.notes] : [''],
                              plans: offer.plans.length > 0 ? offer.plans.map(p => ({ ...p })) : [{ ...emptyPlan }],
                              starts_at: offer.starts_at.slice(0, 16),
                              ends_at: offer.ends_at.slice(0, 16),
                              max_redemptions: offer.max_redemptions != null ? String(offer.max_redemptions) : '',
                            });
                            setPromoOfferMessage(null);
                            setPromoOfferFormOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        {offer.is_active ? (
                          <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={async () => {
                              if (!window.confirm('Deactivate this promo offer?')) return;
                              await deleteAdminPromoOffer(offer.offer_id);
                              refreshAll({ silent: true });
                            }}
                          >
                            Disable
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      )}

      {/* Promo Offer Create/Edit Modal */}
      {promoOfferFormOpen && (
        <div className={styles.modalOverlay} onClick={() => setPromoOfferFormOpen(false)}>
          <div className={styles.modalCard} style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>{editingPromoOfferId ? 'Edit Promo Offer' : 'New Promo Offer'}</h2>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setPromoOfferFormOpen(false)}>
                &times;
              </button>
            </header>
            <form
              className={styles.modalBody}
              style={{ maxHeight: '70vh', overflowY: 'auto' }}
              onSubmit={async (e) => {
                e.preventDefault();
                setPromoOfferBusy(true);
                setPromoOfferMessage(null);
                try {
                  const payload = {
                    title: promoOfferForm.title,
                    subtitle: promoOfferForm.subtitle || undefined,
                    promo_label: promoOfferForm.promo_label || undefined,
                    promo_note: promoOfferForm.promo_note || undefined,
                    notes: promoOfferForm.notes.filter(n => n.trim()),
                    plans: promoOfferForm.plans.filter(p => p.name.trim()),
                    starts_at: new Date(promoOfferForm.starts_at).toISOString(),
                    ends_at: new Date(promoOfferForm.ends_at).toISOString(),
                    max_redemptions: promoOfferForm.max_redemptions ? Number(promoOfferForm.max_redemptions) : null,
                  };
                  if (editingPromoOfferId) {
                    await updateAdminPromoOffer(editingPromoOfferId, payload);
                    setPromoOfferMessage('Promo offer updated.');
                  } else {
                    await createAdminPromoOffer(payload);
                    setPromoOfferMessage('Promo offer created.');
                  }
                  await refreshAll({ silent: true });
                  setTimeout(() => setPromoOfferFormOpen(false), 800);
                } catch (err) {
                  setPromoOfferMessage(err instanceof Error ? err.message : 'Failed to save promo offer.');
                } finally {
                  setPromoOfferBusy(false);
                }
              }}
            >
              <div className={styles.formRow}>
                <label>Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly Unlimited Playground Membership"
                  value={promoOfferForm.title}
                  onChange={(e) => setPromoOfferForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Subtitle</label>
                <input
                  type="text"
                  placeholder="e.g. Unlimited access for 30 days"
                  value={promoOfferForm.subtitle}
                  onChange={(e) => setPromoOfferForm(f => ({ ...f, subtitle: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Promo Label</label>
                <input
                  type="text"
                  placeholder="e.g. Launch Promotion – 50% OFF"
                  value={promoOfferForm.promo_label}
                  onChange={(e) => setPromoOfferForm(f => ({ ...f, promo_label: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Promo Note</label>
                <input
                  type="text"
                  placeholder="e.g. For first members only"
                  value={promoOfferForm.promo_note}
                  onChange={(e) => setPromoOfferForm(f => ({ ...f, promo_note: e.target.value }))}
                />
              </div>

              {/* Notes editor */}
              <div className={styles.formRow}>
                <label>Notes</label>
                {promoOfferForm.notes.map((note, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <input
                      type="text"
                      placeholder={`Note ${i + 1}`}
                      value={note}
                      onChange={(e) => {
                        const updated = [...promoOfferForm.notes];
                        updated[i] = e.target.value;
                        setPromoOfferForm(f => ({ ...f, notes: updated }));
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className={styles.cancelBtn}
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                      onClick={() => {
                        const updated = promoOfferForm.notes.filter((_, idx) => idx !== i);
                        setPromoOfferForm(f => ({ ...f, notes: updated.length ? updated : [''] }));
                      }}
                    >
                      X
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.editBtn}
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', alignSelf: 'flex-start' }}
                  onClick={() => setPromoOfferForm(f => ({ ...f, notes: [...f.notes, ''] }))}
                >
                  + Add Note
                </button>
              </div>

              {/* Plans editor */}
              <div className={styles.formRow}>
                <label>Plans</label>
                {promoOfferForm.plans.map((plan, i) => (
                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.82rem', color: '#334155' }}>Plan {i + 1}</strong>
                      <div style={{ flex: 1 }} />
                      <button
                        type="button"
                        className={styles.cancelBtn}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          const updated = promoOfferForm.plans.filter((_, idx) => idx !== i);
                          setPromoOfferForm(f => ({ ...f, plans: updated.length ? updated : [{ ...emptyPlan }] }));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 1 Kid + 1 Adult"
                          value={plan.name}
                          onChange={(e) => {
                            const updated = [...promoOfferForm.plans];
                            updated[i] = { ...updated[i], name: e.target.value };
                            setPromoOfferForm(f => ({ ...f, plans: updated }));
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Normal Value ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={plan.normalValue}
                          onChange={(e) => {
                            const updated = [...promoOfferForm.plans];
                            updated[i] = { ...updated[i], normalValue: Number(e.target.value) };
                            setPromoOfferForm(f => ({ ...f, plans: updated }));
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Regular Price ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={plan.regularPrice}
                          onChange={(e) => {
                            const updated = [...promoOfferForm.plans];
                            updated[i] = { ...updated[i], regularPrice: Number(e.target.value) };
                            setPromoOfferForm(f => ({ ...f, plans: updated }));
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Promo Price ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={plan.promoPrice}
                          onChange={(e) => {
                            const updated = [...promoOfferForm.plans];
                            updated[i] = { ...updated[i], promoPrice: Number(e.target.value) };
                            setPromoOfferForm(f => ({ ...f, plans: updated }));
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Savings %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          required
                          value={plan.savingsPercent}
                          onChange={(e) => {
                            const updated = [...promoOfferForm.plans];
                            updated[i] = { ...updated[i], savingsPercent: Number(e.target.value) };
                            setPromoOfferForm(f => ({ ...f, plans: updated }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.editBtn}
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', alignSelf: 'flex-start' }}
                  onClick={() => setPromoOfferForm(f => ({ ...f, plans: [...f.plans, { ...emptyPlan }] }))}
                >
                  + Add Plan
                </button>
              </div>

              <div className={styles.formRow}>
                <label>Starts At</label>
                <input
                  type="datetime-local"
                  required
                  value={promoOfferForm.starts_at}
                  onChange={(e) => setPromoOfferForm(f => ({ ...f, starts_at: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Ends At</label>
                <input
                  type="datetime-local"
                  required
                  value={promoOfferForm.ends_at}
                  onChange={(e) => setPromoOfferForm(f => ({ ...f, ends_at: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Max Redemptions (leave empty for unlimited)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 50"
                  value={promoOfferForm.max_redemptions}
                  onChange={(e) => setPromoOfferForm(f => ({ ...f, max_redemptions: e.target.value }))}
                />
              </div>
              {promoOfferMessage && (
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: promoOfferMessage.includes('Failed') ? '#dc2626' : '#16a34a', margin: '0.5rem 0 0' }}>
                  {promoOfferMessage}
                </p>
              )}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setPromoOfferFormOpen(false)}>Cancel</button>
                <button type="submit" className={styles.saveBtn} disabled={promoOfferBusy}>
                  {promoOfferBusy ? 'Saving...' : editingPromoOfferId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coupon Codes Panel — cart-redeemable codes for memberships, tickets, bookings or all */}
      {isAdmin && (
      <section id="section-coupons" className={styles.panel} style={{ marginTop: '1.5rem' }}>
        <header className={styles.panelHeader}>
          <h2>Coupon Codes</h2>
          <div className={styles.panelActions}>
            <button
              type="button"
              className={styles.exportLink}
              onClick={() => {
                setEditingCouponId(null);
                setCouponForm({
                  code: '',
                  description: '',
                  discount_type: 'percent',
                  discount_value: '10',
                  applies_to: ['all'],
                  min_purchase_usd: '',
                  max_redemptions: '',
                  valid_from: '',
                  valid_to: '',
                  is_active: true,
                });
                setCouponMessage(null);
                setCouponFormOpen(true);
              }}
            >
              + New Coupon
            </button>
          </div>
        </header>

        <p style={{ padding: '0 1rem', color: '#64748b', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
          Customers enter these codes in the cart to get a discount. Choose which purchase types each code applies to.
        </p>

        {couponState.data.length === 0 ? (
          <p style={{ padding: '1rem', color: '#64748b', fontSize: '0.9rem' }}>No coupon codes configured yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Applies to</th>
                <th>Min purchase</th>
                <th>Valid until</th>
                <th>Redeemed</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {couponState.data.map(coupon => {
                const now = new Date();
                const isExpired = coupon.valid_to ? new Date(coupon.valid_to) < now : false;
                const isNotStarted = coupon.valid_from ? new Date(coupon.valid_from) > now : false;
                const isCapped = coupon.max_redemptions != null && coupon.redemptions >= coupon.max_redemptions;
                let statusLabel = 'Active';
                let statusColor = '#16a34a';
                if (!coupon.is_active) { statusLabel = 'Disabled'; statusColor = '#94a3b8'; }
                else if (isExpired) { statusLabel = 'Expired'; statusColor = '#94a3b8'; }
                else if (isCapped) { statusLabel = 'Limit reached'; statusColor = '#f59e0b'; }
                else if (isNotStarted) { statusLabel = 'Scheduled'; statusColor = '#6366f1'; }

                const discountText = coupon.percent_off
                  ? `${Number(coupon.percent_off)}% off`
                  : coupon.amount_off_usd
                    ? `$${Number(coupon.amount_off_usd).toFixed(2)} off`
                    : '—';

                return (
                  <tr key={coupon.promotion_id}>
                    <td>
                      <code style={{ background: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: 4, fontWeight: 700 }}>{coupon.code}</code>
                      {coupon.description ? <><br /><small style={{ color: '#64748b' }}>{coupon.description}</small></> : null}
                    </td>
                    <td>{discountText}</td>
                    <td>{coupon.applies_to.map(formatCouponCategory).join(', ')}</td>
                    <td>{coupon.min_purchase_usd != null ? `$${Number(coupon.min_purchase_usd).toFixed(2)}` : '—'}</td>
                    <td>{coupon.valid_to ? formatDate(coupon.valid_to) : '—'}</td>
                    <td>{coupon.redemptions}{coupon.max_redemptions != null ? ` / ${coupon.max_redemptions}` : ''}</td>
                    <td><span style={{ color: statusColor, fontWeight: 600, fontSize: '0.82rem' }}>{statusLabel}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => {
                            setEditingCouponId(coupon.promotion_id);
                            setCouponForm({
                              code: coupon.code,
                              description: coupon.description ?? '',
                              discount_type: coupon.percent_off != null ? 'percent' : 'fixed',
                              discount_value: String(coupon.percent_off ?? coupon.amount_off_usd ?? ''),
                              applies_to: coupon.applies_to.length > 0 ? coupon.applies_to : ['all'],
                              min_purchase_usd: coupon.min_purchase_usd != null ? String(coupon.min_purchase_usd) : '',
                              max_redemptions: coupon.max_redemptions != null ? String(coupon.max_redemptions) : '',
                              valid_from: coupon.valid_from ? coupon.valid_from.slice(0, 16) : '',
                              valid_to: coupon.valid_to ? coupon.valid_to.slice(0, 16) : '',
                              is_active: coupon.is_active,
                            });
                            setCouponMessage(null);
                            setCouponFormOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.cancelBtn}
                          onClick={async () => {
                            if (!window.confirm(`Delete coupon ${coupon.code}? This cannot be undone.`)) return;
                            try {
                              await deleteAdminCoupon(coupon.promotion_id);
                              await refreshCoupons();
                            } catch (err) {
                              window.alert(err instanceof Error ? err.message : 'Failed to delete coupon.');
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      )}

      {/* Team & Access (admin only) */}
      {isAdmin && (
        <section id="section-team" className={styles.panel} style={{ marginTop: '1.5rem' }}>
          <header className={styles.panelHeader}>
            <h2>Team &amp; Access</h2>
            <span>{teamState.data.length} {teamSearch.trim() ? 'matching' : 'team members'}</span>
          </header>
          <p className={styles.mutedText} style={{ margin: '0 0 0.75rem' }}>
            This list shows admins and staff only. To add someone, search their name or email below and set them to
            Staff or Admin. Staff can view bookings, tickets, customers and waivers, redeem &amp; verify tickets, check
            members in, and create walk-in bookings/tickets/memberships — but cannot delete records, change pricing or
            packages, view financial reports, manage content, or manage the team.
          </p>
          <div className={styles.filterBar}>
            <label className={styles.filterItem}>
              <span>Add a member</span>
              <input
                type="text"
                placeholder="Search any user by name or email..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
              />
            </label>
          </div>
          {teamMessage && <p className={styles.feedback}>{teamMessage}</p>}
          {teamState.status === 'loading' && <p>Loading team...</p>}
          {teamState.status === 'error' && <p className={styles.error}>{teamState.error}</p>}
          {teamState.status !== 'loading' && (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Current role</th>
                    <th>Set role</th>
                  </tr>
                </thead>
                <tbody>
                  {teamState.data.length === 0 && (
                    <tr>
                      <td colSpan={4} className={styles.mutedText}>
                        {teamSearch.trim() ? 'No users match your search.' : 'No team members yet.'}
                      </td>
                    </tr>
                  )}
                  {teamState.data
                    .map((u) => {
                      const currentRole = u.roles?.includes('admin')
                        ? 'admin'
                        : u.roles?.includes('employee') || u.roles?.includes('staff')
                          ? 'employee'
                          : 'customer';
                      const roleLabel =
                        currentRole === 'admin' ? 'Admin' : currentRole === 'employee' ? 'Staff' : 'Customer';
                      const isSelf = !!user?.email && u.email.toLowerCase() === user.email.toLowerCase();
                      const busy = roleUpdateBusy === u.user_id;
                      return (
                        <tr key={u.user_id}>
                          <td>{`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—'}</td>
                          <td>{u.email}</td>
                          <td><strong>{roleLabel}</strong>{isSelf ? ' (you)' : ''}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className={styles.editBtn}
                                disabled={busy || currentRole === 'admin' || isSelf}
                                onClick={() => handleSetUserRole(u, 'admin')}
                              >
                                Admin
                              </button>
                              <button
                                type="button"
                                className={styles.editBtn}
                                disabled={busy || currentRole === 'employee' || isSelf}
                                onClick={() => handleSetUserRole(u, 'employee')}
                              >
                                Staff
                              </button>
                              <button
                                type="button"
                                className={styles.cancelBtn}
                                disabled={busy || currentRole === 'customer' || isSelf}
                                onClick={() => handleSetUserRole(u, 'customer')}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Coupon Create/Edit Modal */}
      {couponFormOpen && (
        <div className={styles.modalOverlay} onClick={() => setCouponFormOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>{editingCouponId ? 'Edit Coupon' : 'New Coupon'}</h2>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setCouponFormOpen(false)}>
                &times;
              </button>
            </header>
            <form
              className={styles.modalBody}
              onSubmit={async (e) => {
                e.preventDefault();
                setCouponBusy(true);
                setCouponMessage(null);
                try {
                  const value = Number(couponForm.discount_value);
                  if (!Number.isFinite(value) || value <= 0) {
                    throw new Error('Enter a positive discount value');
                  }
                  if (!couponForm.code.trim()) {
                    throw new Error('Coupon code is required');
                  }
                  if (couponForm.applies_to.length === 0) {
                    throw new Error('Select at least one category');
                  }
                  const payload = {
                    code: couponForm.code.trim().toUpperCase(),
                    description: couponForm.description.trim() || null,
                    percent_off: couponForm.discount_type === 'percent' ? value : null,
                    amount_off_usd: couponForm.discount_type === 'fixed' ? value : null,
                    applies_to: couponForm.applies_to,
                    min_purchase_usd: couponForm.min_purchase_usd ? Number(couponForm.min_purchase_usd) : null,
                    max_redemptions: couponForm.max_redemptions ? Number(couponForm.max_redemptions) : null,
                    valid_from: couponForm.valid_from ? new Date(couponForm.valid_from).toISOString() : null,
                    valid_to: couponForm.valid_to ? new Date(couponForm.valid_to).toISOString() : null,
                    is_active: couponForm.is_active,
                  };
                  if (editingCouponId) {
                    await updateAdminCoupon(editingCouponId, payload);
                    setCouponMessage('Coupon updated.');
                  } else {
                    await createAdminCoupon(payload);
                    setCouponMessage('Coupon created.');
                  }
                  await refreshCoupons();
                  setTimeout(() => setCouponFormOpen(false), 600);
                } catch (err) {
                  setCouponMessage(err instanceof Error ? err.message : 'Failed to save coupon.');
                } finally {
                  setCouponBusy(false);
                }
              }}
            >
              <div className={styles.formRow}>
                <label>Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SUMMER20"
                  maxLength={40}
                  value={couponForm.code}
                  onChange={(e) => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
                />
              </div>
              <div className={styles.formRow}>
                <label>Description (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 20% off summer memberships"
                  maxLength={500}
                  value={couponForm.description}
                  onChange={(e) => setCouponForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Discount Type</label>
                <select
                  value={couponForm.discount_type}
                  onChange={(e) => setCouponForm(f => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed' }))}
                >
                  <option value="percent">Percentage Off</option>
                  <option value="fixed">Fixed Amount Off ($)</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label>{couponForm.discount_type === 'percent' ? 'Discount %' : 'Discount Amount ($)'}</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  max={couponForm.discount_type === 'percent' ? '100' : '10000'}
                  value={couponForm.discount_value}
                  onChange={(e) => setCouponForm(f => ({ ...f, discount_value: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Applies To</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {(['all', 'membership', 'ticket', 'party_booking'] as CouponCategory[]).map(cat => (
                    <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={couponForm.applies_to.includes(cat)}
                        onChange={(e) => {
                          setCouponForm(f => {
                            let next = new Set(f.applies_to);
                            if (e.target.checked) {
                              if (cat === 'all') next = new Set<CouponCategory>(['all']);
                              else { next.delete('all'); next.add(cat); }
                            } else {
                              next.delete(cat);
                              if (next.size === 0) next.add('all');
                            }
                            return { ...f, applies_to: Array.from(next) as CouponCategory[] };
                          });
                        }}
                      />
                      {formatCouponCategoryPlural(cat)}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.formRow}>
                <label>Minimum Purchase ($, optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="leave empty for no minimum"
                  value={couponForm.min_purchase_usd}
                  onChange={(e) => setCouponForm(f => ({ ...f, min_purchase_usd: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Max Redemptions (leave empty for unlimited)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 100"
                  value={couponForm.max_redemptions}
                  onChange={(e) => setCouponForm(f => ({ ...f, max_redemptions: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Valid From (optional)</label>
                <input
                  type="datetime-local"
                  value={couponForm.valid_from}
                  onChange={(e) => setCouponForm(f => ({ ...f, valid_from: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Valid To (optional)</label>
                <input
                  type="datetime-local"
                  value={couponForm.valid_to}
                  onChange={(e) => setCouponForm(f => ({ ...f, valid_to: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={couponForm.is_active}
                    onChange={(e) => setCouponForm(f => ({ ...f, is_active: e.target.checked }))}
                  />
                  Active (uncheck to disable without deleting)
                </label>
              </div>
              {couponMessage && (
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: couponMessage.toLowerCase().includes('fail') || couponMessage.toLowerCase().includes('error') || couponMessage.toLowerCase().includes('required') || couponMessage.toLowerCase().includes('positive') || couponMessage.toLowerCase().includes('select') ? '#dc2626' : '#16a34a', margin: '0.5rem 0 0' }}>
                  {couponMessage}
                </p>
              )}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setCouponFormOpen(false)}>Cancel</button>
                <button type="submit" className={styles.saveBtn} disabled={couponBusy}>
                  {couponBusy ? 'Saving...' : editingCouponId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              {/* Package info (read-only) */}
              <div className={styles.bookingInfoList}>
                <div className={styles.bookingInfoRow}>
                  <span className={styles.bookingInfoLabel}>Package</span>
                  <span className={styles.bookingInfoValue}>{selectedBooking.partyPackage?.name || '—'}</span>
                </div>
              </div>

              {/* All Editable Fields */}
              <div className={styles.formGrid}>
                <label>
                  Customer Name
                  <input
                    type="text"
                    value={bookingForm.guestName ?? ''}
                    onChange={(e) => setBookingForm((prev) => ({ ...prev, guestName: e.target.value }))}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={bookingForm.guestEmail ?? ''}
                    onChange={(e) => setBookingForm((prev) => ({ ...prev, guestEmail: e.target.value }))}
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="text"
                    value={bookingForm.guestPhone ?? ''}
                    onChange={(e) => setBookingForm((prev) => ({ ...prev, guestPhone: e.target.value }))}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={bookingForm.status ?? ''}
                    onChange={(e) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        status: e.target.value as AdminBooking['status'],
                      }))
                    }
                  >
                    <option value="Confirmed">Confirmed</option>
                    <option value="Pending">Pending</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  Event Date
                  <input
                    type="date"
                    value={bookingForm.eventDate ?? ''}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, eventDate: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Start Time
                  <input
                    type="time"
                    value={bookingForm.startTime ?? ''}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, startTime: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Location
                  <input
                    type="text"
                    value={bookingForm.location ?? ''}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, location: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Guests
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={bookingForm.guests ?? 0}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, guests: parseInt(e.target.value) || 1 }))
                    }
                  />
                </label>
                <label>
                  Total ($)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={bookingForm.total ?? 0}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, total: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </label>
                <label>
                  Payment Status
                  <select
                    value={bookingForm.paymentStatus ?? ''}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, paymentStatus: e.target.value }))
                    }
                  >
                    <option value="paid">Paid</option>
                    <option value="deposit_paid">Deposit Paid</option>
                    <option value="awaiting_deposit">Awaiting Deposit</option>
                    <option value="awaiting_full_payment">Awaiting Full Payment</option>
                  </select>
                </label>
              </div>
              <label className={styles.notesField}>
                Customer Notes
                <span className={styles.notesHint}>(visible to customer)</span>
                <textarea
                  value={bookingForm.notes ?? ''}
                  onChange={(e) =>
                    setBookingForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Notes visible to the customer..."
                />
              </label>
              <label className={styles.notesField}>
                Private Notes
                <span className={styles.notesHint}>(staff only)</span>
                <textarea
                  value={bookingForm.privateNotes ?? ''}
                  onChange={(e) =>
                    setBookingForm((prev) => ({ ...prev, privateNotes: e.target.value }))
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
                    <option value="mini">Mini Plan</option>
                    <option value="super">Super Plan</option>
                    <option value="mega">Mega Plan</option>
                    <option value="explorer">Silver (Legacy)</option>
                    <option value="adventurer">Gold (Legacy)</option>
                    <option value="champion">Platinum (Legacy)</option>
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
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleWaiverUpdate}
                  disabled={waiverActionBusy}
                >
                  {waiverActionBusy ? 'Saving...' : 'Save changes'}
                </button>
              )}
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

      {/* Create Membership Modal */}
      {showCreateMembership && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateMembership(false)}>
          <div className={styles.modalCard} style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>Create Membership</h2>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setShowCreateMembership(false)}>&#10005;</button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <div className={styles.formRow}>
                  <label>Customer Name *</label>
                  <input type="text" value={membershipCreateForm.guestName} onChange={(e) => setMembershipCreateForm(f => ({ ...f, guestName: e.target.value }))} placeholder="Full name" />
                </div>
                <div className={styles.formRow}>
                  <label>Email *</label>
                  <input type="email" value={membershipCreateForm.guestEmail ?? ''} onChange={(e) => setMembershipCreateForm(f => ({ ...f, guestEmail: e.target.value }))} placeholder="customer@email.com" />
                </div>
                <div className={styles.formRow}>
                  <label>Phone</label>
                  <input type="text" value={membershipCreateForm.guestPhone ?? ''} onChange={(e) => setMembershipCreateForm(f => ({ ...f, guestPhone: e.target.value }))} placeholder="Phone number" />
                </div>
                <div className={styles.formRow}>
                  <label>Login Password *</label>
                  <input type="text" value={membershipCreateForm.password ?? ''} onChange={(e) => setMembershipCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" />
                </div>
                <div className={styles.formRow}>
                  <label>Child Name</label>
                  <input type="text" value={membershipCreateForm.childName ?? ''} onChange={(e) => setMembershipCreateForm(f => ({ ...f, childName: e.target.value }))} placeholder="Child's name" />
                </div>
                <div className={styles.formRow}>
                  <label>Membership Plan *</label>
                  <select
                    value={membershipCreateForm.planId || ''}
                    onChange={(e) => {
                      const plans: Record<string, { id: number; tier: string; price: number }> = {
                        '12': { id: 12, tier: 'mini', price: 250 },
                        '13': { id: 13, tier: 'super', price: 440 },
                        '14': { id: 14, tier: 'mega', price: 630 },
                      };
                      const sel = plans[e.target.value];
                      if (sel) {
                        setMembershipCreateForm(f => ({ ...f, planId: sel.id, tier: sel.tier, monthlyPrice: sel.price, total: sel.price * f.durationMonths }));
                      } else {
                        setMembershipCreateForm(f => ({ ...f, planId: 0, tier: '', monthlyPrice: 0, total: 0 }));
                      }
                    }}
                  >
                    <option value="">Select plan...</option>
                    <option value="12">Mini Plan — $250/mo (1 child)</option>
                    <option value="13">Super Plan — $440/mo (2 children)</option>
                    <option value="14">Mega Plan — $630/mo (3 children)</option>
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>Duration (months)</label>
                  <input type="number" min={1} max={24} value={membershipCreateForm.durationMonths} onChange={(e) => { const m = parseInt(e.target.value) || 1; setMembershipCreateForm(f => ({ ...f, durationMonths: m, total: f.monthlyPrice * m })); }} />
                </div>
                <div className={styles.formRow}>
                  <label>Total: <strong>${membershipCreateForm.total.toFixed(2)}</strong></label>
                </div>
                <div className={styles.formRow}>
                  <label>Payment Method *</label>
                  <select value={membershipCreateForm.paymentMethod} onChange={(e) => setMembershipCreateForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                    <option value="cash">Cash</option>
                    <option value="card">Card (in-person)</option>
                    <option value="square">Square</option>
                    <option value="other">Other</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>Payment Status</label>
                  <select value={membershipCreateForm.paymentStatus} onChange={(e) => setMembershipCreateForm(f => ({ ...f, paymentStatus: e.target.value }))}>
                    <option value="paid">Paid</option>
                    <option value="awaiting_full_payment">Awaiting Payment</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowCreateMembership(false)} disabled={createMembershipBusy}>Cancel</button>
                <button type="button" className={styles.checkInBtn} onClick={handleCreateMembership} disabled={createMembershipBusy}>
                  {createMembershipBusy ? 'Creating...' : 'Create Membership'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issue Tickets Modal */}
      {showIssueTickets && (
        <div className={styles.modalOverlay} onClick={() => setShowIssueTickets(false)}>
          <div className={styles.modalCard} style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>Issue Tickets</h2>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setShowIssueTickets(false)}>✕</button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <div className={styles.formRow}>
                  <label>Customer Name *</label>
                  <input
                    type="text"
                    value={issueTicketForm.guestName}
                    onChange={(e) => setIssueTicketForm(f => ({ ...f, guestName: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={issueTicketForm.guestEmail}
                    onChange={(e) => setIssueTicketForm(f => ({ ...f, guestEmail: e.target.value }))}
                    placeholder="customer@email.com"
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Phone</label>
                  <input
                    type="text"
                    value={issueTicketForm.guestPhone}
                    onChange={(e) => setIssueTicketForm(f => ({ ...f, guestPhone: e.target.value }))}
                    placeholder="Phone number"
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Quantity *</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={issueTicketForm.quantity}
                    onChange={(e) => setIssueTicketForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Unit Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={issueTicketForm.unitPrice}
                    onChange={(e) => setIssueTicketForm(f => ({ ...f, unitPrice: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Total: ${(issueTicketForm.quantity * issueTicketForm.unitPrice).toFixed(2)}</label>
                </div>
                <div className={styles.formRow}>
                  <label>Payment Method *</label>
                  <select
                    value={issueTicketForm.paymentMethod}
                    onChange={(e) => setIssueTicketForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card (in-person)</option>
                    <option value="square">Square</option>
                    <option value="other">Other</option>
                    <option value="comp">Complimentary</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowIssueTickets(false)} disabled={issueTicketsBusy}>
                  Cancel
                </button>
                <button type="button" className={styles.checkInBtn} onClick={handleIssueTickets} disabled={issueTicketsBusy}>
                  {issueTicketsBusy ? 'Issuing...' : 'Issue Tickets'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateBooking && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateBooking(false)}>
          <div className={styles.modalCard} style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>Create Party Booking</h2>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setShowCreateBooking(false)}>✕</button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <div className={styles.formRow}>
                  <label>Customer Name *</label>
                  <input
                    type="text"
                    value={createBookingForm.guestName}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, guestName: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={createBookingForm.guestEmail ?? ''}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, guestEmail: e.target.value }))}
                    placeholder="customer@email.com"
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Phone</label>
                  <input
                    type="text"
                    value={createBookingForm.guestPhone ?? ''}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, guestPhone: e.target.value }))}
                    placeholder="Phone number"
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Birthday Child</label>
                  <input
                    type="text"
                    value={createBookingForm.childName ?? ''}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, childName: e.target.value }))}
                    placeholder="Child's name"
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Party Package *</label>
                  <select
                    value={createBookingForm.partyPackageId}
                    onChange={(e) => {
                      const pkgId = e.target.value;
                      const pkg = partyPackages.find(p => p.id === pkgId);
                      setCreateBookingForm(f => ({
                        ...f,
                        partyPackageId: pkgId,
                        total: pkg?.basePrice ?? f.total,
                        guests: pkg?.maxGuests ?? f.guests,
                        endTime: pkg ? calcEndTime(f.startTime, pkg.durationMinutes) : f.endTime,
                      }));
                    }}
                  >
                    <option value="">Select package...</option>
                    {partyPackages.map(pkg => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} — ${pkg.basePrice}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>Location</label>
                  <select
                    value={createBookingForm.location}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, location: e.target.value }))}
                  >
                    <option value="Albany">Albany</option>
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>Event Date *</label>
                  <input
                    type="date"
                    value={createBookingForm.eventDate}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, eventDate: e.target.value }))}
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Start Time *</label>
                  <input
                    type="time"
                    value={createBookingForm.startTime}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      const pkg = partyPackages.find(p => p.id === createBookingForm.partyPackageId);
                      setCreateBookingForm(f => ({
                        ...f,
                        startTime: newStart,
                        endTime: pkg ? calcEndTime(newStart, pkg.durationMinutes) : f.endTime,
                      }));
                    }}
                  />
                </div>
                <div className={styles.formRow}>
                  <label>End Time</label>
                  <input
                    type="time"
                    value={createBookingForm.endTime ?? ''}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Guests</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={createBookingForm.guests}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, guests: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Total Amount ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={createBookingForm.total}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, total: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Payment Method *</label>
                  <select
                    value={createBookingForm.paymentMethod}
                    onChange={(e) => {
                      const method = e.target.value as AdminCreateBookingPayload['paymentMethod'];
                      setCreateBookingForm(f => ({
                        ...f,
                        paymentMethod: method,
                        // Auto-set payment status based on method
                        paymentStatus: method === 'unpaid' ? 'awaiting_full_payment' : (f.paymentMethod === 'unpaid' ? 'paid' : f.paymentStatus),
                      }));
                    }}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card (in-person)</option>
                    <option value="square">Square</option>
                    <option value="other">Other</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>Payment Status</label>
                  <select
                    value={createBookingForm.paymentStatus}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, paymentStatus: e.target.value as AdminCreateBookingPayload['paymentStatus'] }))}
                  >
                    <option value="paid">Paid</option>
                    <option value="deposit_paid">Deposit Paid</option>
                    <option value="awaiting_deposit">Awaiting Deposit</option>
                    <option value="awaiting_full_payment">Awaiting Full Payment</option>
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>Notes</label>
                  <textarea
                    rows={2}
                    value={createBookingForm.notes ?? ''}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any booking notes..."
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Private Notes (admin only)</label>
                  <textarea
                    rows={2}
                    value={createBookingForm.privateNotes ?? ''}
                    onChange={(e) => setCreateBookingForm(f => ({ ...f, privateNotes: e.target.value }))}
                    placeholder="Internal notes..."
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowCreateBooking(false)}
                  disabled={createBookingBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.checkInBtn}
                  onClick={handleCreateBooking}
                  disabled={createBookingBusy}
                >
                  {createBookingBusy ? 'Creating...' : 'Create Party Booking'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' })}
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

function renderSummaryCard(title: string, value: string | number, valueLabel: string, subtitle: string, scrollTo?: string) {
  const handleClick = scrollTo
    ? () => {
        const el = document.getElementById(scrollTo);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    : undefined;

  return (
    <div
      className={`${styles.summaryCard}${scrollTo ? ` ${styles.summaryCardClickable}` : ''}`}
      key={title}
      onClick={handleClick}
      role={scrollTo ? 'button' : undefined}
      tabIndex={scrollTo ? 0 : undefined}
      onKeyDown={scrollTo ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick?.(); } } : undefined}
    >
      <span>{title}</span>
      <strong>{value}</strong>
      <small className={styles.valueLabel}>{valueLabel}</small>
      <p>{subtitle}</p>
      {scrollTo && <span className={styles.cardClickHint}>Click to view &rarr;</span>}
    </div>
  );
}

function formatPaymentStatus(status: string): string {
  switch (status) {
    case 'awaiting_deposit': return 'Awaiting Deposit';
    case 'deposit_paid': return 'Deposit Paid';
    case 'awaiting_full_payment': return 'Awaiting Full';
    case 'paid': return 'Paid in Full';
    default: return status;
  }
}

function renderBookingTable(
  state: { status: LoadState; data: AdminBooking[]; error?: string },
  onSelect: (booking: AdminBooking) => void,
  onCancel: (booking: AdminBooking) => void,
  onDelete: (booking: AdminBooking) => void,
  selectedId: string | null,
  canManage: boolean
) {
  if (state.status === 'loading') return <p>Loading bookings...</p>;
  if (state.status === 'error') return <p className={styles.error}>{state.error}</p>;
  if (state.data.length === 0) return <p>No bookings yet.</p>;
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.bookingTable}>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Event Details</th>
            <th>Party Time</th>
            <th>Children</th>
            <th>Extras</th>
            <th>Payment</th>
            <th>Receipt</th>
            <th>Status</th>
            <th>Booked On</th>
            <th>Notes</th>
            <th></th>
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
            const isPaid = booking.paymentStatus === 'deposit_paid' || booking.paymentStatus === 'paid';
            const paidAmount = isPaid ? (booking.depositAmount ?? 0) : 0;
            const dueAmount = booking.balanceRemaining ?? 0;
            const isCancelled = booking.status === 'Cancelled';
            const addOns = booking.addOns ?? [];
            const children = booking.children ?? [];
            return (
              <tr
                key={booking.id}
                className={booking.id === selectedId ? styles.rowSelected : undefined}
              >
                {/* Customer */}
                <td>
                  <div className={styles.customerDetailsCell}>
                    <strong>{customerDisplay}</strong>
                    <small>{customerEmail || '—'}</small>
                    <small>{customerPhone || '—'}</small>
                    <small className={styles.refCode}>Ref: {booking.reference}</small>
                  </div>
                </td>
                {/* Event Details */}
                <td>
                  <div className={styles.customerDetailsCell}>
                    <strong>{booking.partyPackage?.name || '—'}</strong>
                    <small>{booking.location || '—'}</small>
                    <small><b>{booking.guests || 0}</b> guests</small>
                  </div>
                </td>
                {/* Party Time */}
                <td>
                  <div className={styles.customerDetailsCell}>
                    <strong>{formatDate(booking.eventDate)}</strong>
                    <small>
                      {booking.startTime ? formatTime(booking.startTime) : '—'}
                      {booking.endTime ? ` – ${formatTime(booking.endTime)}` : ''}
                    </small>
                  </div>
                </td>
                {/* Children */}
                <td>
                  <div className={styles.customerDetailsCell}>
                    {children.length > 0 ? children.map((child, i) => (
                      <small key={i}>
                        <b>{child.name}</b>
                        {child.birthDate && <span> (DOB: {formatDate(child.birthDate)})</span>}
                      </small>
                    )) : <small className={styles.mutedText}>—</small>}
                  </div>
                </td>
                {/* Extras */}
                <td>
                  <div className={styles.customerDetailsCell}>
                    {addOns.length > 0 ? addOns.map((addon, i) => {
                      const addonLabel = addon.label || addon.name || addon.code
                        || (typeof (addon as Record<string, unknown>).id === 'string'
                          ? ((addon as Record<string, unknown>).id as string).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                          : 'Add-on');
                      return (
                        <small key={i}>
                          {addonLabel}
                          {addon.quantity && addon.quantity > 1 ? ` x${addon.quantity}` : ''}
                          {addon.price ? ` (${formatCurrency(addon.price)})` : ''}
                        </small>
                      );
                    }) : <small className={styles.mutedText}>None</small>}
                  </div>
                </td>
                {/* Payment */}
                <td>
                  <div className={styles.paymentCell}>
                    <small><b>Total:</b> {formatCurrency(booking.total)}</small>
                    {booking.cleaningFee > 0 && (
                      <small className={styles.mutedText}>Cleaning: {formatCurrency(booking.cleaningFee)}</small>
                    )}
                    {isPaid ? (
                      <>
                        <span className={styles.paymentPaid}>
                          Paid: {formatCurrency(paidAmount)}
                        </span>
                        {dueAmount > 0 && (
                          <small className={styles.paymentDue}>
                            Balance: {formatCurrency(dueAmount)}
                          </small>
                        )}
                      </>
                    ) : (
                      <span className={styles.paymentPending}>
                        Awaiting: {formatCurrency(booking.depositAmount ?? 0)}
                      </span>
                    )}
                    {booking.paymentOption === 'split' && (
                      <small className={styles.mutedText}>
                        Split: {formatCurrency(booking.onlinePaymentAmount ?? 0)} online / {formatCurrency(booking.venuePaymentAmount ?? 0)} venue
                      </small>
                    )}
                    <small className={styles.mutedText}>{formatPaymentStatus(booking.paymentStatus)}</small>
                  </div>
                </td>
                {/* Receipt */}
                <td>
                  {booking.receipt ? (
                    <div className={styles.receiptCell}>
                      <a
                        href={`${API_BASE_URL}/receipts/${booking.receipt.receiptNumber}/pdf?inline=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.receiptLink}
                        title="View receipt PDF"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </a>
                      <a
                        href={`${API_BASE_URL}/receipts/${booking.receipt.receiptNumber}/pdf`}
                        download={`receipt-${booking.reference}.pdf`}
                        className={styles.receiptDownload}
                        title="Download receipt PDF"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Download
                      </a>
                      <small className={styles.mutedText}>{booking.receipt.receiptNumber}</small>
                    </div>
                  ) : (
                    <small className={styles.mutedText}>No receipt</small>
                  )}
                </td>
                {/* Status */}
                <td>
                  <span className={isCancelled ? styles.statusCancelled : styles.statusActive}>
                    {booking.status}
                  </span>
                </td>
                {/* Booked On */}
                <td>
                  <div className={styles.customerDetailsCell}>
                    {booking.createdAt ? (
                      <>
                        <small>{formatDate(booking.createdAt)}</small>
                        <small className={styles.mutedText}>
                          {new Date(booking.createdAt).toLocaleTimeString('en-US', {
                            timeZone: 'America/New_York',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </small>
                      </>
                    ) : (
                      <small className={styles.mutedText}>—</small>
                    )}
                  </div>
                </td>
                {/* Notes */}
                <td>
                  <div className={styles.customerDetailsCell}>
                    {booking.notes && <small>{booking.notes}</small>}
                    {booking.privateNotes && <small className={styles.privateNote}>{booking.privateNotes}</small>}
                    {!booking.notes && !booking.privateNotes && <small className={styles.mutedText}>—</small>}
                  </div>
                </td>
                {/* Actions */}
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
                      canManage && (
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
                      )
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
  canManage: boolean,
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
              {canManage && (
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
              )}
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
  onDelete: (ticketId: string, ticketType: string) => void,
  canManage: boolean
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
                  {canManage && (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => onDelete(entry.id, entry.type)}
                    >
                      Delete
                    </button>
                  )}
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
  selectedMembershipId: string | null,
  canManage: boolean
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
            <th>ID</th>
            <th>Child</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Expires</th>
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
            const firstChild = member.children?.[0];
            const extraChildCount = (member.children?.length ?? 0) - 1;
            const remaining = member.membership?.remainingDays;
            return (
              <tr key={membershipId} className={isSelected ? styles.selectedRow : undefined}>
                <td>
                  {formatGuardian({
                    firstName: member.firstName,
                    lastName: member.lastName,
                    email: member.email,
                  })}
                </td>
                <td className={styles.memberIdCell}>{member.displayId ?? '--'}</td>
                <td>
                  {firstChild ? (
                    <span className={styles.childCell}>
                      {firstChild.photoUrl && (
                        <img src={firstChild.photoUrl} alt="" className={styles.childThumb} />
                      )}
                      {firstChild.firstName} {firstChild.lastName ?? ''}
                      {extraChildCount > 0 && <span className={styles.extraChildBadge}>+{extraChildCount}</span>}
                    </span>
                  ) : '--'}
                </td>
                <td>{member.membership?.tierName ?? '--'}</td>
                <td>
                  <span className={isCancelled ? styles.statusCancelled : styles.statusActive}>
                    {status}
                  </span>
                </td>
                <td>
                  {member.membership?.endDate ? (
                    <span>
                      {formatDate(member.membership.endDate)}
                      {remaining != null && status === 'active' && (
                        <span className={remaining <= 3 ? styles.daysExpiring : remaining <= 7 ? styles.daysWarning : styles.daysBadge}>
                          {remaining}d
                        </span>
                      )}
                    </span>
                  ) : '--'}
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
                      canManage && (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => member.membership?.membershipId && onDelete(member.membership.membershipId, name)}
                          disabled={!member.membership?.membershipId}
                        >
                          Delete
                        </button>
                      )
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
  const isGuest = !booking.guardian && booking.guestName;
  return {
    status: booking.status,
    eventDate: booking.eventDate ? booking.eventDate.slice(0, 10) : '',
    startTime: booking.startTime ?? '',
    location: booking.location ?? '',
    notes: booking.notes ?? '',
    privateNotes: booking.privateNotes ?? '',
    guestName: isGuest ? (booking.guestName ?? '') : `${booking.guardian?.firstName ?? ''} ${booking.guardian?.lastName ?? ''}`.trim(),
    guestEmail: isGuest ? (booking.guestEmail ?? '') : (booking.guardian?.email ?? ''),
    guestPhone: isGuest ? (booking.guestPhone ?? '') : (booking.guardian?.phone ?? ''),
    guests: booking.guests ?? 0,
    total: booking.total ?? 0,
    paymentStatus: booking.paymentStatus ?? '',
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
  if (form.guestName !== undefined) payload.guestName = form.guestName;
  if (form.guestEmail !== undefined) payload.guestEmail = form.guestEmail;
  if (form.guestPhone !== undefined) payload.guestPhone = form.guestPhone;
  if (form.guests !== undefined) payload.guests = form.guests;
  if (form.total !== undefined) payload.total = form.total;
  if (form.paymentStatus !== undefined) payload.paymentStatus = form.paymentStatus;
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
    'event.created',
    'event.updated',
    'event.deleted',
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
