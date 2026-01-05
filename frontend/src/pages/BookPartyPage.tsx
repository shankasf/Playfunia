import { FormEvent, useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { useCheckout } from '../context/CheckoutContext';
import {
  formatTime,
  formatDateWithWeekday,
  formatMonthYear,
  formatDate,
  formatWeekday,
  formatDayNumber,
} from '../lib/dateUtils';
import {
  BookingEstimate,
  BookingSlotsResponse,
  BookingAddOnSelection,
  CreateBookingPayload,
  CreateGuestBookingPayload,
  fetchPartyPackages,
  fetchBookingSlots,
  estimateBooking,
  createBooking,
  createGuestBooking,
  PartyPackageDto,
} from '../api/bookings';
import { getPartyAddOns, getPricingConfig, type PartyAddOnPricing, type PricingConfig } from '../api/pricing';
import { fetchMyWaivers, type GuardianWaiver } from '../api/waivers';
import { addChild } from '../api/users';
import styles from './BookPartyPage.module.css';

const PARTY_LOCATIONS = ['Poughkeepsie', 'Deptford'] as const;
const DAYS_TO_SHOW = 5;
const BOOKING_STATE_KEY = 'playfunia_booking_state';

type SavedBookingState = {
  location: string;
  selectedDate: string | null;
  selectedSlot: string | null;
  selectedPackageId: string | null;
  packageQty: number;
  extraChildQty: number;
  extraAdultQty: number;
  addOns: AddOnState;
  notes: string;
  childSelections: Record<string, boolean>;
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string;
  guestPhone: string;
  guestChildName: string;
  guestChildBirthDate: string;
  guestWaiverAgreed: boolean;
  waiverAgreement: boolean;
  waiverConfirmed: boolean;
  timestamp: number;
};

function saveBookingState(state: SavedBookingState) {
  try {
    sessionStorage.setItem(BOOKING_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save booking state', e);
  }
}

function loadBookingState(): SavedBookingState | null {
  try {
    const saved = sessionStorage.getItem(BOOKING_STATE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as SavedBookingState;
    // Expire after 30 minutes
    if (Date.now() - parsed.timestamp > 30 * 60 * 1000) {
      sessionStorage.removeItem(BOOKING_STATE_KEY);
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

function clearBookingState() {
  sessionStorage.removeItem(BOOKING_STATE_KEY);
}

// Add-on display configuration (type determines UI behavior)
const ADD_ON_UI_CONFIG: Record<string, { type: 'toggle' | 'quantity' }> = {
  extra_hour: { type: 'toggle' },
  extra_child: { type: 'quantity' },
  face_painting: { type: 'toggle' },
  photo_video: { type: 'toggle' },
  balloon_artist: { type: 'toggle' },
  character_visit: { type: 'toggle' },
};

// Build add-on options from API data
function buildAddOnOptions(addOns: PartyAddOnPricing[]) {
  return addOns.map(addOn => ({
    id: addOn.code,
    label: addOn.label,
    price: addOn.price,
    description: addOn.description ?? '',
    type: ADD_ON_UI_CONFIG[addOn.code]?.type ?? 'toggle',
  }));
}

type AddOnState = {
  extraHour: boolean;
  extraChildCount: number;
  facePainting: boolean;
  photoVideo: boolean;
};

const DEFAULT_ADD_ON_STATE: AddOnState = {
  extraHour: false,
  extraChildCount: 0,
  facePainting: false,
  photoVideo: false,
};

type SlotsErrorState = {
  message: string;
  requiresAuth?: boolean;
};

export function BookPartyPage() {
  const { user, refreshProfile } = useAuth();
  const { addBookingDepositItem } = useCheckout();
  const navigate = useNavigate();

  const hasValidWaiver = user?.hasValidWaiver ?? false;

  // Package state
  const [packages, setPackages] = useState<PartyPackageDto[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Booking state
  const [location, setLocation] = useState<(typeof PARTY_LOCATIONS)[number]>('Poughkeepsie');
  const [dateOffset, setDateOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<BookingSlotsResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<SlotsErrorState | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Ticket quantities (for display)
  const [packageQty, setPackageQty] = useState(0);
  const [extraChildQty, setExtraChildQty] = useState(0);
  const [extraAdultQty, setExtraAdultQty] = useState(0);

  // Add-ons
  const [addOns, setAddOns] = useState<AddOnState>(DEFAULT_ADD_ON_STATE);

  // Pricing data from API
  const [addOnPricing, setAddOnPricing] = useState<PartyAddOnPricing[]>([]);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);

  // Build add-on options from API data
  const addOnOptions = useMemo(() => buildAddOnOptions(addOnPricing), [addOnPricing]);

  // Add child form state
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  const [newChildFirstName, setNewChildFirstName] = useState('');
  const [newChildLastName, setNewChildLastName] = useState('');
  const [newChildBirthDate, setNewChildBirthDate] = useState('');
  const [addingChild, setAddingChild] = useState(false);
  const [addChildError, setAddChildError] = useState<string | null>(null);

  // Children and notes
  const [childSelections, setChildSelections] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');

  // Guest booking form state
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestChildName, setGuestChildName] = useState('');
  const [guestChildBirthDate, setGuestChildBirthDate] = useState('');
  const [guestWaiverAgreed, setGuestWaiverAgreed] = useState(false);

  // Waiver
  const [waiverAgreement, setWaiverAgreement] = useState(false);
  const [waiverConfirmed, setWaiverConfirmed] = useState(false);
  const [waivers, setWaivers] = useState<GuardianWaiver[]>([]);
  const [waiverLoading, setWaiverLoading] = useState(false);
  const [waiverError, setWaiverError] = useState<string | null>(null);
  const [showWaiverDetails, setShowWaiverDetails] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error' | 'info'; message?: string }>({ type: 'idle' });

  // Estimate
  const [estimate, setEstimate] = useState<BookingEstimate | null>(null);

  // Track if state has been restored from sessionStorage
  const [stateRestored, setStateRestored] = useState(false);

  // Restore saved state on mount
  useEffect(() => {
    const saved = loadBookingState();
    if (saved) {
      setLocation(saved.location as typeof location);
      if (saved.selectedDate) {
        setSelectedDate(new Date(saved.selectedDate));
      }
      setSelectedSlot(saved.selectedSlot);
      if (saved.selectedPackageId) {
        setSelectedPackageId(saved.selectedPackageId);
      }
      setPackageQty(saved.packageQty);
      setExtraChildQty(saved.extraChildQty);
      setExtraAdultQty(saved.extraAdultQty);
      setAddOns(saved.addOns);
      setNotes(saved.notes);
      setChildSelections(saved.childSelections);
      setGuestFirstName(saved.guestFirstName);
      setGuestLastName(saved.guestLastName);
      setGuestEmail(saved.guestEmail);
      setGuestPhone(saved.guestPhone);
      setGuestChildName(saved.guestChildName);
      setGuestChildBirthDate(saved.guestChildBirthDate);
      setGuestWaiverAgreed(saved.guestWaiverAgreed);
      setWaiverAgreement(saved.waiverAgreement);
      setWaiverConfirmed(saved.waiverConfirmed);
    }
    setStateRestored(true);
  }, []);

  // Fetch add-on pricing from API
  useEffect(() => {
    let mounted = true;
    async function loadPricing() {
      try {
        const [addOnsResult, configResult] = await Promise.all([
          getPartyAddOns(),
          getPricingConfig(),
        ]);
        if (mounted) {
          setAddOnPricing(addOnsResult.addOns);
          setPricingConfig(configResult.config);
        }
      } catch (error) {
        console.error('Failed to load pricing:', error);
      } finally {
        if (mounted) {
          setPricingLoading(false);
        }
      }
    }
    loadPricing();
    return () => { mounted = false; };
  }, []);

  // Save state to sessionStorage when key values change
  useEffect(() => {
    if (!stateRestored) return; // Don't save until we've restored
    saveBookingState({
      location,
      selectedDate: selectedDate?.toISOString() ?? null,
      selectedSlot,
      selectedPackageId,
      packageQty,
      extraChildQty,
      extraAdultQty,
      addOns,
      notes,
      childSelections,
      guestFirstName,
      guestLastName,
      guestEmail,
      guestPhone,
      guestChildName,
      guestChildBirthDate,
      guestWaiverAgreed,
      waiverAgreement,
      waiverConfirmed,
      timestamp: Date.now(),
    });
  }, [
    stateRestored,
    location,
    selectedDate,
    selectedSlot,
    selectedPackageId,
    packageQty,
    extraChildQty,
    extraAdultQty,
    addOns,
    notes,
    childSelections,
    guestFirstName,
    guestLastName,
    guestEmail,
    guestPhone,
    guestChildName,
    guestChildBirthDate,
    guestWaiverAgreed,
    waiverAgreement,
    waiverConfirmed,
  ]);

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) ?? null,
    [packages, selectedPackageId]
  );

  const latestWaiver = useMemo(() => (waivers.length > 0 ? waivers[0] : null), [waivers]);

  const selectedChildIds = useMemo(
    () => user?.children.filter((child) => childSelections[child.id]).map((child) => child.id) ?? [],
    [childSelections, user]
  );

  const addOnPayload = useMemo(() => buildAddOnPayload(addOns), [addOns]);

  // Generate dates for horizontal picker
  const visibleDates = useMemo(() => {
    const dates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < DAYS_TO_SHOW; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + dateOffset + i + 1); // Start from tomorrow
      dates.push(d);
    }
    return dates;
  }, [dateOffset]);

  const currentMonth = useMemo(() => {
    if (visibleDates.length === 0) return '';
    return formatMonthYear(visibleDates[0]).toUpperCase();
  }, [visibleDates]);

  // Load packages
  useEffect(() => {
    let active = true;
    async function loadPackages() {
      try {
        const result = await fetchPartyPackages();
        if (!active) return;
        setPackages(result);
        if (result.length > 0) {
          setSelectedPackageId(result[0].id);
        }
      } catch (error) {
        console.error('Failed to load packages', error);
      }
    }
    loadPackages();
    return () => { active = false; };
  }, []);

  // Initialize children selections
  useEffect(() => {
    if (!user?.children) {
      setChildSelections({});
      return;
    }
    setChildSelections((prev) => {
      const next: Record<string, boolean> = {};
      user.children.forEach((child) => {
        next[child.id] = prev[child.id] ?? true;
      });
      return next;
    });
  }, [user?.children]);

  // Refresh profile on mount to get latest children (e.g., after returning from waiver)
  useEffect(() => {
    refreshProfile().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle adding a child manually
  const handleAddChild = useCallback(async () => {
    const firstName = newChildFirstName.trim();
    if (!firstName) {
      setAddChildError('First name is required');
      return;
    }

    setAddingChild(true);
    setAddChildError(null);

    try {
      await addChild({
        firstName,
        lastName: newChildLastName.trim() || undefined,
        birthDate: newChildBirthDate || undefined,
      });
      // Refresh profile to get updated children list
      await refreshProfile();
      // Reset form
      setNewChildFirstName('');
      setNewChildLastName('');
      setNewChildBirthDate('');
      setShowAddChildForm(false);
    } catch (error) {
      setAddChildError(error instanceof Error ? error.message : 'Failed to add child');
    } finally {
      setAddingChild(false);
    }
  }, [newChildFirstName, newChildLastName, newChildBirthDate, refreshProfile]);

  // Load slots when date changes
  useEffect(() => {
    if (!selectedDate) {
      setSlots(null);
      return;
    }

    let active = true;
    async function loadSlots() {
      setSlotsLoading(true);
      setSlotsError(null);
      setSelectedSlot(null);

      const eventDate = selectedDate!.toISOString().slice(0, 10);

      try {
        const result = await fetchBookingSlots({ location, eventDate });
        if (!active) return;
        setSlots(result);
      } catch (error) {
        if (!active) return;
        setSlotsError(resolveSlotsError(error));
      } finally {
        if (active) setSlotsLoading(false);
      }
    }
    loadSlots();
    return () => { active = false; };
  }, [location, selectedDate]);

  // Calculate estimate
  useEffect(() => {
    if (!selectedPackageId) {
      setEstimate(null);
      return;
    }

    let active = true;
    async function calculateEstimate() {
      try {
        const result = await estimateBooking({
          partyPackageId: selectedPackageId!,
          location,
          guests: Math.max(packageQty * (selectedPackage?.maxGuests ?? 12) + extraChildQty, 1),
          addOns: addOnPayload.length > 0 ? addOnPayload : undefined,
        });
        if (!active) return;
        setEstimate(result);
      } catch {
        if (!active) return;
        setEstimate(null);
      }
    }
    calculateEstimate();
    return () => { active = false; };
  }, [selectedPackageId, location, packageQty, extraChildQty, addOnPayload, selectedPackage?.maxGuests]);

  // Reset waiver when auth changes
  useEffect(() => {
    if (!hasValidWaiver) {
      setWaiverAgreement(false);
      setWaiverConfirmed(false);
      setWaivers([]);
      setWaiverError(null);
      setShowWaiverDetails(false);
    }
  }, [hasValidWaiver]);

  // Fetch most recent waiver when one is on file
  useEffect(() => {
    if (!hasValidWaiver) return;

    let active = true;
    setWaiverLoading(true);
    setWaiverError(null);

    fetchMyWaivers()
      .then(data => {
        if (!active) return;
        const sorted = [...data].sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());
        setWaivers(sorted);
      })
      .catch(error => {
        if (!active) return;
        setWaiverError(getErrorMessage(error, 'Unable to load your waiver.'));
      })
      .finally(() => {
        if (active) setWaiverLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hasValidWaiver]);

  // Handlers
  const handleDateNav = (direction: 'prev' | 'next') => {
    setDateOffset((prev) => direction === 'next' ? prev + DAYS_TO_SHOW : Math.max(0, prev - DAYS_TO_SHOW));
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handleWaiverConfirm = () => {
    if (waiverAgreement) {
      setWaiverConfirmed(true);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedPackageId || !selectedSlot || !selectedDate) {
      setStatus({ type: 'error', message: 'Choose a package, date, and time slot before booking.' });
      return;
    }

    // Guest booking validation
    if (!user) {
      if (!guestFirstName.trim() || !guestLastName.trim()) {
        setStatus({ type: 'error', message: 'Please enter your full name.' });
        return;
      }
      if (!guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
        setStatus({ type: 'error', message: 'Please enter a valid email address.' });
        return;
      }
      if (!guestPhone.trim() || guestPhone.trim().length < 10) {
        setStatus({ type: 'error', message: 'Please enter a valid phone number.' });
        return;
      }
      if (!guestChildName.trim()) {
        setStatus({ type: 'error', message: 'Please enter the birthday child\'s name.' });
        return;
      }
      if (!guestWaiverAgreed) {
        setStatus({ type: 'error', message: 'Please agree to the waiver terms.' });
        return;
      }
    } else {
      // Authenticated user validation
      if (selectedChildIds.length === 0) {
        setStatus({ type: 'error', message: 'Select at least one child for this celebration.' });
        return;
      }

      if (!hasValidWaiver || !waiverConfirmed) {
        setStatus({ type: 'error', message: 'Please complete and confirm your waiver.' });
        return;
      }
    }

    setSubmitting(true);
    setStatus({ type: 'info', message: 'Saving your party details...' });

    try {
      if (!user) {
        // Guest booking
        const payload: CreateGuestBookingPayload = {
          guestFirstName: guestFirstName.trim(),
          guestLastName: guestLastName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim(),
          childName: guestChildName.trim(),
          childBirthDate: guestChildBirthDate || undefined,
          partyPackageId: selectedPackageId,
          location,
          eventDate: selectedDate.toISOString().slice(0, 10),
          startTime: selectedSlot,
          guests: Math.max(packageQty * (selectedPackage?.maxGuests ?? 12) + extraChildQty, 1),
          notes: notes.trim() || undefined,
          addOns: addOnPayload.length ? addOnPayload : undefined,
        };

        const result = await createGuestBooking(payload);
        setStatus({
          type: 'success',
          message: `Party reserved! Confirmation sent to ${result.guestEmail}. Our team will contact you for payment.`
        });
      } else {
        // Authenticated booking
        const payload: CreateBookingPayload = {
          childIds: selectedChildIds,
          partyPackageId: selectedPackageId,
          location,
          eventDate: selectedDate.toISOString().slice(0, 10),
          startTime: selectedSlot,
          guests: Math.max(packageQty * (selectedPackage?.maxGuests ?? 12) + extraChildQty, 1),
          notes: notes.trim() || undefined,
          addOns: addOnPayload.length ? addOnPayload : undefined,
        };

        const result = await createBooking(payload);
        addBookingDepositItem({
          id: `booking-${result.bookingId}`,
          type: 'booking',
          bookingId: result.bookingId,
          reference: result.reference,
          location,
          eventDate: selectedDate.toISOString().slice(0, 10),
          startTime: selectedSlot,
          total: result.total,
          depositAmount: result.depositAmount,
          balanceRemaining: result.balanceRemaining,
          status: 'awaiting_deposit',
        });
        clearBookingState(); // Clear saved state after successful booking
        setStatus({ type: 'success', message: 'Party reserved! Continue to checkout.' });
        navigate('/checkout');
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: getErrorMessage(error, 'Could not complete booking. Try another slot.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const hasCartItems = packageQty > 0 || extraChildQty > 0 || extraAdultQty > 0;
  const cartTotal = estimate?.total ?? 0;

  return (
    <section className={styles.page}>
      <form className={styles.mainLayout} onSubmit={handleSubmit}>
        {/* Left Column - Booking Form */}
        <div className={styles.bookingColumn}>
          {/* Package Header */}
          <div className={styles.packageHeader}>
            <button type="button" className={styles.backButton} onClick={() => navigate(-1)}>
              <span className={styles.backArrow}>←</span>
            </button>

            <div className={styles.packageInfo}>
              <h1>{selectedPackage?.name ?? 'Select a Party Package'}</h1>
              {selectedPackage && (
                <>
                  <ul className={styles.packageFeatures}>
                    <li>Admission for up to {selectedPackage.maxGuests / 2} children and {selectedPackage.maxGuests / 2} adults</li>
                    <li>Party Host</li>
                    <li>Setup with 4 tables (1 cake table, 2 food & beverage tables, 1 kids' table)</li>
                    <li>Celebration banner and solid color tablecloths</li>
                    <li>2-hour room...</li>
                  </ul>
                  <button type="button" className={styles.readMore}>Read more</button>
                </>
              )}
            </div>

            <img
              src="/images/parties/birthday-parties.jpg"
              alt="Birthday party setup"
              className={styles.packageImage}
              loading="lazy"
            />
          </div>

          {/* Location Selector */}
          <div className={styles.locationSelector}>
            <h2>Select location</h2>
            <div className={styles.locationButtons}>
              {PARTY_LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  className={`${styles.locationButton} ${location === loc ? styles.locationActive : ''}`}
                  onClick={() => setLocation(loc)}
                >
                  {loc} Mall
                </button>
              ))}
            </div>
          </div>

          {/* Date Selector */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Select a date</h2>
              <button type="button" className={styles.calendarToggle} title="Open calendar">
                📅
              </button>
            </div>

            <p className={styles.monthLabel}>{currentMonth}</p>

            <div className={styles.dateStrip}>
              <button
                type="button"
                className={styles.dateNav}
                onClick={() => handleDateNav('prev')}
                disabled={dateOffset === 0}
              >
                ←
              </button>

              <div className={styles.dateList}>
                {visibleDates.map((date) => {
                  const isSelected = selectedDate?.toDateString() === date.toDateString();
                  const dayName = formatWeekday(date);
                  const dayNum = formatDayNumber(date);

                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      className={`${styles.dateItem} ${isSelected ? styles.dateItemSelected : ''}`}
                      onClick={() => handleDateSelect(date)}
                    >
                      <span className={styles.dateItemDay}>{dayName}</span>
                      <span className={styles.dateItemNumber}>{dayNum}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className={styles.dateNav}
                onClick={() => handleDateNav('next')}
              >
                →
              </button>
            </div>
          </div>

          {/* Time Selector */}
          <div className={styles.section}>
            <h2>Select a time</h2>

            {!selectedDate ? (
              <p className={styles.slotsEmpty}>Select a date above to see available times.</p>
            ) : slotsLoading ? (
              <p className={styles.slotsLoading}>Loading available times...</p>
            ) : slotsError ? (
              <p className={styles.slotsEmpty}>{slotsError.message}</p>
            ) : slots && slots.slots.length > 0 ? (
              <div className={styles.timeSlots}>
                {slots.slots.map((slot) => {
                  const isSelected = slot.startTime === selectedSlot;
                  const requiresExtraHour = addOns.extraHour;
                  const slotSupportsExtraHour = slot.supportsExtraHour ?? true;
                  const blockedByExtraHour = requiresExtraHour && !slotSupportsExtraHour;
                  const disabled = !slot.available || blockedByExtraHour;

                  return (
                    <button
                      key={slot.startTime}
                      type="button"
                      className={`${styles.timeSlot} ${isSelected ? styles.timeSlotSelected : ''}`}
                      onClick={() => !disabled && setSelectedSlot(slot.startTime)}
                      disabled={disabled}
                    >
                      {formatTime(slot.startTime)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className={styles.slotsEmpty}>No slots available. Try another date.</p>
            )}
          </div>

          {/* Ticket Selection */}
          <div className={styles.ticketSection}>
            <h2>Select tickets</h2>
            <div className={styles.ticketList}>
              {/* Base Package */}
              <div className={styles.ticketRow}>
                <div className={styles.ticketInfo}>
                  <h3>{selectedPackage?.name ?? 'Party Package'}</h3>
                  <span className={styles.ticketPrice}>
                    ${(selectedPackage?.basePrice ?? 0).toLocaleString()}.00
                  </span>
                  <span className={styles.ticketHint}>
                    Includes {selectedPackage?.maxGuests ?? 24} guests
                  </span>
                </div>
                <div className={styles.quantityControl}>
                  <button
                    type="button"
                    className={styles.quantityBtn}
                    onClick={() => setPackageQty(Math.max(0, packageQty - 1))}
                  >
                    −
                  </button>
                  <span className={styles.quantityValue}>{packageQty}</span>
                  <button
                    type="button"
                    className={styles.quantityBtn}
                    onClick={() => setPackageQty(packageQty + 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Additional Child */}
              <div className={styles.ticketRow}>
                <div className={styles.ticketInfo}>
                  <h3>Additional Child</h3>
                  <span className={styles.ticketPrice}>$20.00 /guest</span>
                </div>
                <div className={styles.quantityControl}>
                  <button
                    type="button"
                    className={styles.quantityBtn}
                    onClick={() => setExtraChildQty(Math.max(0, extraChildQty - 1))}
                  >
                    −
                  </button>
                  <span className={styles.quantityValue}>{extraChildQty}</span>
                  <button
                    type="button"
                    className={styles.quantityBtn}
                    onClick={() => setExtraChildQty(extraChildQty + 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Additional Adult */}
              <div className={styles.ticketRow}>
                <div className={styles.ticketInfo}>
                  <h3>Additional Adult</h3>
                  <span className={styles.ticketPrice}>$10.00 /guest</span>
                </div>
                <div className={styles.quantityControl}>
                  <button
                    type="button"
                    className={styles.quantityBtn}
                    onClick={() => setExtraAdultQty(Math.max(0, extraAdultQty - 1))}
                  >
                    −
                  </button>
                  <span className={styles.quantityValue}>{extraAdultQty}</span>
                  <button
                    type="button"
                    className={styles.quantityBtn}
                    onClick={() => setExtraAdultQty(extraAdultQty + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Package Selection (if multiple) */}
          {packages.length > 1 && (
            <div className={styles.section}>
              <h2>Choose package type</h2>
              <div className={styles.packageGrid}>
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    className={`${styles.packageCard} ${pkg.id === selectedPackageId ? styles.packageCardSelected : ''}`}
                    onClick={() => setSelectedPackageId(pkg.id)}
                  >
                    <div className={styles.packageCardHeader}>
                      <h3>{pkg.name}</h3>
                      <span className={styles.packageCardPrice}>${pkg.basePrice}</span>
                    </div>
                    {pkg.description && <p className={styles.packageCardDesc}>{pkg.description}</p>}
                    <div className={styles.packageCardMeta}>
                      <span>{pkg.durationMinutes} min</span>
                      <span>Up to {pkg.maxGuests} guests</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add-ons */}
          <div className={styles.addOnsSection}>
            <h2>Party upgrades</h2>
            <div className={styles.addOnsList}>
              {addOnOptions.filter(o => o.type === 'toggle').map((option) => {
                const isActive = getToggleState(addOns, option.id);
                return (
                  <div
                    key={option.id}
                    className={`${styles.addOnItem} ${isActive ? styles.addOnActive : ''}`}
                  >
                    <div className={styles.addOnInfo}>
                      <h3>{option.label} <span className={styles.addOnPrice}>+${option.price}</span></h3>
                      <p>{option.description}</p>
                    </div>
                    <button
                      type="button"
                      className={`${styles.addOnToggle} ${isActive ? styles.addOnToggleActive : ''}`}
                      onClick={() =>
                        setAddOns((current) => updateAddOn(current, option.id, !isActive, 'toggle'))
                      }
                      aria-pressed={isActive}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Children Section - Different for authenticated vs guest */}
          {user ? (
            <div className={styles.childrenSection}>
              <h2>Children celebrating</h2>

              {user.children.length > 0 && (
                <div className={styles.childrenList}>
                  {user.children.map((child) => (
                    <label key={child.id} className={styles.childCheckbox}>
                      <input
                        type="checkbox"
                        checked={Boolean(childSelections[child.id])}
                        onChange={() =>
                          setChildSelections((prev) => ({ ...prev, [child.id]: !prev[child.id] }))
                        }
                      />
                      <span>
                        {child.firstName} {child.lastName ?? ''}
                        {child.birthDate && ` (${formatBirthDate(child.birthDate)})`}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {user.children.length === 0 && !showAddChildForm && (
                <div className={styles.emptyChildren}>
                  <p>No children added yet. Add a child to continue.</p>
                </div>
              )}

              {/* Add Child Form */}
              {showAddChildForm ? (
                <div className={styles.addChildForm}>
                  <h3>Add a child</h3>
                  <div className={styles.formRow}>
                    <label>
                      <span>First name *</span>
                      <input
                        type="text"
                        value={newChildFirstName}
                        onChange={(e) => setNewChildFirstName(e.target.value)}
                        placeholder="First name"
                        disabled={addingChild}
                      />
                    </label>
                    <label>
                      <span>Last name</span>
                      <input
                        type="text"
                        value={newChildLastName}
                        onChange={(e) => setNewChildLastName(e.target.value)}
                        placeholder="Last name (optional)"
                        disabled={addingChild}
                      />
                    </label>
                  </div>
                  <div className={styles.formRow}>
                    <label>
                      <span>Birth date</span>
                      <input
                        type="date"
                        value={newChildBirthDate}
                        onChange={(e) => setNewChildBirthDate(e.target.value)}
                        disabled={addingChild}
                      />
                    </label>
                  </div>
                  {addChildError && (
                    <div className={styles.addChildError}>{addChildError}</div>
                  )}
                  <div className={styles.addChildActions}>
                    <button
                      type="button"
                      className={styles.addChildCancel}
                      onClick={() => {
                        setShowAddChildForm(false);
                        setNewChildFirstName('');
                        setNewChildLastName('');
                        setNewChildBirthDate('');
                        setAddChildError(null);
                      }}
                      disabled={addingChild}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.addChildSubmit}
                      onClick={handleAddChild}
                      disabled={addingChild || !newChildFirstName.trim()}
                    >
                      {addingChild ? 'Adding...' : 'Add child'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.addChildOptions}>
                  <button
                    type="button"
                    className={styles.addChildButton}
                    onClick={() => setShowAddChildForm(true)}
                  >
                    + Add child
                  </button>
                  <Link to="/waiver?return=/book-party" className={styles.waiverLink}>
                    Or complete waiver to add children
                  </Link>
                </div>
              )}
            </div>
          ) : (
            /* Guest Booking Form */
            <div className={styles.guestFormSection}>
              <h2>Your contact information</h2>
              <p className={styles.guestFormHint}>
                We&apos;ll use this to contact you about your booking.
                <Link to="/account" className={styles.signInLink}> Already have an account? Sign in</Link>
              </p>

              <div className={styles.formRow}>
                <label>
                  <span>First name *</span>
                  <input
                    type="text"
                    value={guestFirstName}
                    onChange={(e) => setGuestFirstName(e.target.value)}
                    placeholder="Your first name"
                    required
                  />
                </label>
                <label>
                  <span>Last name *</span>
                  <input
                    type="text"
                    value={guestLastName}
                    onChange={(e) => setGuestLastName(e.target.value)}
                    placeholder="Your last name"
                    required
                  />
                </label>
              </div>

              <div className={styles.formRow}>
                <label>
                  <span>Email *</span>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                  />
                </label>
                <label>
                  <span>Phone *</span>
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    required
                  />
                </label>
              </div>

              <h3 className={styles.guestChildHeader}>Birthday child</h3>
              <div className={styles.formRow}>
                <label>
                  <span>Child&apos;s name *</span>
                  <input
                    type="text"
                    value={guestChildName}
                    onChange={(e) => setGuestChildName(e.target.value)}
                    placeholder="Child's full name"
                    required
                  />
                </label>
                <label>
                  <span>Birth date (optional)</span>
                  <input
                    type="date"
                    value={guestChildBirthDate}
                    onChange={(e) => setGuestChildBirthDate(e.target.value)}
                  />
                </label>
              </div>

              <label className={styles.guestWaiverCheckbox}>
                <input
                  type="checkbox"
                  checked={guestWaiverAgreed}
                  onChange={(e) => setGuestWaiverAgreed(e.target.checked)}
                />
                <span>
                  I agree to the <Link to="/waiver" target="_blank">liability waiver</Link> and understand I&apos;ll need to complete it before the party.
                </span>
              </label>
            </div>
          )}

          {/* Notes */}
          <div className={styles.notesSection}>
            <h2>Special requests</h2>
            <textarea
              className={styles.notesInput}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Let us know about themes, allergies, or special requests..."
            />
          </div>
        </div>

        {/* Right Column - Cart */}
        <aside className={styles.cartColumn}>
          <div className={styles.cartHeader}>
            <span className={styles.cartIcon}>🛒</span>
            <h2>Your cart</h2>
          </div>

          {!hasCartItems ? (
            <div className={styles.cartEmpty}>
              <span className={styles.cartEmptyIcon}>🛒</span>
              <p>Your cart is empty.</p>
              <p>Add some items to get started</p>
            </div>
          ) : (
            <div className={styles.cartContent}>
              {/* Cart Items */}
              {packageQty > 0 && (
                <div className={styles.cartItem}>
                  <div className={styles.cartItemHeader}>
                    <h3>{selectedPackage?.name}</h3>
                    <span className={styles.cartItemPrice}>
                      ${((selectedPackage?.basePrice ?? 0) * packageQty).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.cartItemDetails}>
                    <span>Qty: {packageQty}</span>
                    {selectedDate && <span>{formatDisplayDate(selectedDate)}</span>}
                    {selectedSlot && <span>{formatTime(selectedSlot)}</span>}
                    <span>{location} Mall</span>
                  </div>
                </div>
              )}

              {extraChildQty > 0 && (
                <div className={styles.cartItem}>
                  <div className={styles.cartItemHeader}>
                    <h3>Additional Child</h3>
                    <span className={styles.cartItemPrice}>${extraChildQty * 20}</span>
                  </div>
                  <div className={styles.cartItemDetails}>
                    <span>{extraChildQty} × $20.00</span>
                  </div>
                </div>
              )}

              {extraAdultQty > 0 && (
                <div className={styles.cartItem}>
                  <div className={styles.cartItemHeader}>
                    <h3>Additional Adult</h3>
                    <span className={styles.cartItemPrice}>${extraAdultQty * 10}</span>
                  </div>
                  <div className={styles.cartItemDetails}>
                    <span>{extraAdultQty} × $10.00</span>
                  </div>
                </div>
              )}

              {/* Add-ons in cart */}
              {addOns.extraHour && (
                <div className={styles.cartItem}>
                  <div className={styles.cartItemHeader}>
                    <h3>Extra hour</h3>
                    <span className={styles.cartItemPrice}>$100</span>
                  </div>
                </div>
              )}
              {addOns.facePainting && (
                <div className={styles.cartItem}>
                  <div className={styles.cartItemHeader}>
                    <h3>Face painting</h3>
                    <span className={styles.cartItemPrice}>$100</span>
                  </div>
                </div>
              )}
              {addOns.photoVideo && (
                <div className={styles.cartItem}>
                  <div className={styles.cartItemHeader}>
                    <h3>Photo & video</h3>
                    <span className={styles.cartItemPrice}>$250</span>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className={styles.cartSummary}>
                <div className={styles.cartLine}>
                  <span>Subtotal</span>
                  <span>${cartTotal.toLocaleString()}</span>
                </div>
                <div className={styles.cartLine}>
                  <span>Cleaning fee</span>
                  <span>$50</span>
                </div>
                <div className={styles.cartTotal}>
                  <span>Total</span>
                  <span>${(cartTotal + 50).toLocaleString()}</span>
                </div>
                <div className={styles.cartDeposit}>
                  <span>Deposit due now (50%)</span>
                  <span>${((cartTotal + 50) / 2).toLocaleString()}</span>
                </div>
              </div>

              {/* Waiver Status - only for authenticated users */}
              {user && (
                <>
                  {!hasValidWaiver ? (
                    <div className={`${styles.waiverCard} ${styles.waiverNeeded}`}>
                      <div className={styles.waiverCardHeader}>
                        <h3>⚠️ Waiver required</h3>
                      </div>
                      <p>You must sign the liability waiver before booking.</p>
                      <Link to="/waiver?return=/book-party" className={styles.waiverButton + ' ' + styles.waiverButtonPrimary}>
                        Sign waiver now
                      </Link>
                    </div>
                  ) : (
                    <div className={`${styles.waiverCard} ${styles.waiverComplete}`}>
                      <div className={styles.waiverCardHeader}>
                        <h3>✓ Waiver on file</h3>
                      </div>
                      <p>Your waiver is valid for 5 years.</p>
                      {waiverLoading && <p className={styles.waiverNote}>Loading your waiver…</p>}
                      {waiverError && <p className={styles.statusError}>{waiverError}</p>}
                      {latestWaiver && (
                        <div className={styles.waiverPreview}>
                          <div className={styles.waiverPreviewHeader}>
                            <div>
                              <div className={styles.waiverPreviewTitle}>Signed {formatIsoDate(latestWaiver.signedAt)}</div>
                              <div className={styles.waiverPreviewMeta}>
                                Expires {formatIsoDate(latestWaiver.expiresAt ?? undefined) ?? '—'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className={styles.waiverPreviewToggle}
                              onClick={() => setShowWaiverDetails((prev) => !prev)}
                            >
                              {showWaiverDetails ? 'Hide details' : 'Show details'}
                            </button>
                          </div>

                          {showWaiverDetails && (
                            <div className={styles.waiverPreviewBody}>
                              <div className={styles.waiverPreviewGrid}>
                                <div>
                                  <span className={styles.waiverLabel}>Guardian</span>
                                  <div className={styles.waiverValue}>
                                    {latestWaiver.guardianName}
                                    {latestWaiver.guardianEmail ? ` · ${latestWaiver.guardianEmail}` : ''}
                                  </div>
                                </div>
                                <div>
                                  <span className={styles.waiverLabel}>Phone</span>
                                  <div className={styles.waiverValue}>{latestWaiver.guardianPhone || '—'}</div>
                                </div>
                                <div>
                                  <span className={styles.waiverLabel}>Guardian DOB</span>
                                  <div className={styles.waiverValue}>{formatIsoDate(latestWaiver.guardianDateOfBirth ?? undefined)}</div>
                                </div>
                                <div>
                                  <span className={styles.waiverLabel}>Relationship</span>
                                  <div className={styles.waiverValue}>{latestWaiver.relationshipToChildren || '—'}</div>
                                </div>
                                <div>
                                  <span className={styles.waiverLabel}>Allergies</span>
                                  <div className={styles.waiverValue}>{latestWaiver.allergies || 'None listed'}</div>
                                </div>
                                <div>
                                  <span className={styles.waiverLabel}>Medical notes</span>
                                  <div className={styles.waiverValue}>{latestWaiver.medicalNotes || 'None listed'}</div>
                                </div>
                                <div>
                                  <span className={styles.waiverLabel}>Insurance</span>
                                  <div className={styles.waiverValue}>
                                    {latestWaiver.insuranceProvider || '—'}
                                    {latestWaiver.insurancePolicyNumber
                                      ? ` · ${latestWaiver.insurancePolicyNumber}`
                                      : ''}
                                  </div>
                                </div>
                                <div>
                                  <span className={styles.waiverLabel}>Marketing opt-in</span>
                                  <div className={styles.waiverValue}>{latestWaiver.marketingOptIn ? 'Yes' : 'No'}</div>
                                </div>
                              </div>

                              <div className={styles.waiverChildrenSection}>
                                <div className={styles.waiverLabel}>Children</div>
                                <div className={styles.waiverChildrenGrid}>
                                  {latestWaiver.children.map((child) => (
                                    <div key={`${child.name}-${child.birthDate}`} className={styles.waiverChildCard}>
                                      <div className={styles.waiverValue}>{child.name}</div>
                                      <div className={styles.waiverSubValue}>
                                        DOB: {formatIsoDate(child.birthDate)}
                                        {child.gender ? ` · ${child.gender}` : ''}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {latestWaiver.acceptedPolicies?.length ? (
                                <div className={styles.waiverPolicies}>
                                  <div className={styles.waiverLabel}>Accepted policies</div>
                                  <ul>
                                    {latestWaiver.acceptedPolicies.map((policy) => (
                                      <li key={policy}>{policy}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )}
                      <label className={styles.waiverCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={waiverAgreement}
                          onChange={(e) => {
                            setWaiverAgreement(e.target.checked);
                            if (!e.target.checked) setWaiverConfirmed(false);
                          }}
                        />
                        <span>I agree to the Playfunia terms & conditions.</span>
                      </label>
                      <button
                        type="button"
                        className={`${styles.waiverButton} ${waiverConfirmed ? styles.waiverConfirmedBtn : styles.waiverConfirmBtn}`}
                        onClick={handleWaiverConfirm}
                        disabled={!waiverAgreement}
                      >
                        {waiverConfirmed ? '✓ Waiver confirmed' : 'Confirm waiver'}
                      </button>
                      <Link to="/waiver?return=/book-party" className={styles.waiverModifyLink}>
                        Modify waiver details
                      </Link>
                    </div>
                  )}
                </>
              )}

              {/* Status Messages */}
              {status.type === 'error' && (
                <div className={`${styles.statusMessage} ${styles.statusError}`}>
                  {status.message}
                </div>
              )}
              {status.type === 'success' && (
                <div className={`${styles.statusMessage} ${styles.statusSuccess}`}>
                  {status.message}
                </div>
              )}
              {status.type === 'info' && (
                <div className={`${styles.statusMessage} ${styles.statusInfo}`}>
                  {status.message}
                </div>
              )}

              {/* Checkout Button */}
              <button
                type="submit"
                className={styles.checkoutButton}
                disabled={
                  submitting ||
                  !selectedPackageId ||
                  !selectedSlot ||
                  !selectedDate ||
                  packageQty === 0 ||
                  (user ? (!hasValidWaiver || !waiverConfirmed) : !guestWaiverAgreed)
                }
              >
                {submitting ? (
                  <>
                    <span className={styles.buttonSpinner} />
                    Processing...
                  </>
                ) : user ? (
                  '💌 Reserve this party!'
                ) : (
                  '💌 Request booking'
                )}
              </button>
            </div>
          )}
        </aside>
      </form>
    </section>
  );
}

// Helper functions
function formatDisplayDate(date: Date) {
  return formatDateWithWeekday(date);
}

function formatBirthDate(value: string) {
  return formatMonthYear(value);
}

function formatIsoDate(value?: string) {
  return formatDate(value);
}

function buildAddOnPayload(state: AddOnState): BookingAddOnSelection[] {
  const items: BookingAddOnSelection[] = [];
  if (state.extraHour) items.push({ id: 'extra_hour' });
  if (state.extraChildCount > 0) items.push({ id: 'extra_child', quantity: state.extraChildCount });
  if (state.facePainting) items.push({ id: 'face_painting' });
  if (state.photoVideo) items.push({ id: 'photo_video' });
  return items;
}

function getToggleState(state: AddOnState, addOnId: string) {
  switch (addOnId) {
    case 'extra_hour': return state.extraHour;
    case 'face_painting': return state.facePainting;
    case 'photo_video': return state.photoVideo;
    default: return false;
  }
}

function updateAddOn(state: AddOnState, addOnId: string, value: boolean | number, type: 'toggle' | 'quantity') {
  if (type === 'quantity') {
    return { ...state, extraChildCount: typeof value === 'number' && value > 0 ? Math.floor(value) : 0 };
  }
  const applied = Boolean(value);
  switch (addOnId) {
    case 'extra_hour': return { ...state, extraHour: applied };
    case 'face_painting': return { ...state, facePainting: applied };
    case 'photo_video': return { ...state, photoVideo: applied };
    default: return state;
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed) as { message?: string };
      if (data?.message) return data.message;
    } catch { /* ignore */ }
  }
  const match = trimmed.match(/"message"\s*:\s*"([^"]+)"/i);
  if (match) return match[1];
  return trimmed || fallback;
}

function resolveSlotsError(error: unknown): SlotsErrorState {
  const message = getErrorMessage(error, 'Unable to load available party slots.');
  const lower = message.toLowerCase();
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('token')) {
    return { message: 'Please sign in again to view availability.', requiresAuth: true };
  }
  return { message };
}
