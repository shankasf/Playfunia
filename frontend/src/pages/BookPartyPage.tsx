import { FormEvent, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCheckout } from '../context/CheckoutContext';
import {
  formatTime,
  formatMonthYear,
} from '../lib/dateUtils';
import {
  formatNameInput,
  formatPhoneInput,
  isValidName,
  isValidPhone,
  isValidEmail,
  isValidChildDOB,
} from '../utils/validation';
import {
  BookingEstimate,
  BookingSlotsResponse,
  fetchPartyPackages,
  fetchBookingSlots,
  estimateBooking,
  PartyPackageDto,
} from '../api/bookings';
import { getPartyAddOns, getPricingConfig, type PartyAddOnPricing, type PricingConfig } from '../api/pricing';
import styles from './BookPartyPage.module.css';

const PARTY_LOCATIONS = ['Albany'] as const;
const BOOKING_STATE_KEY = 'playfunia_booking_state';

/** Format a Date to YYYY-MM-DD using local date components (avoids toISOString UTC shift) */
function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// FAQ data for birthday parties
const PARTY_FAQS = [
  {
    question: 'Do you offer private birthday parties?',
    answer: 'Yes. You will have exclusive access to the party room for 2 hours. The play area remains open to the public during your event.',
  },
  {
    question: 'Can we arrive early to decorate for a Mini Fun party?',
    answer: 'No. Party room access begins at your scheduled start time only.',
  },
  {
    question: 'Can we bring balloons to our party?',
    answer: 'Yes for Mini Fun. You may bring balloons and use our in-room decor such as the backdrop, cake stand, and party tables.',
  },
  {
    question: 'Do you provide party supplies?',
    answer: 'Yes. Super Fun and Mega Fun packages include party supplies. We decorate the room and set up the tables for you.',
  },
  {
    question: 'What party themes do you offer?',
    answer: 'For Super Fun, tableware themes are available in blue, pink, or white. Mega Fun includes custom themed balloon decor based on your child\'s favorite colors or characters.',
  },
  {
    question: 'What ages are the parties suitable for?',
    answer: 'Our parties are designed for children ages 1-13. For baby showers or special events, please contact us for a custom quote.',
  },
  {
    question: 'Is food included in the party package?',
    answer: 'Yes for Super Fun and Mega Fun. Each child receives one slice of cheese pizza, bottled water, juice, and a shared snack tray with cookies and chips.',
  },
  {
    question: 'Can parents stay during the party?',
    answer: 'Yes. Parental supervision is required at all times.',
  },
  {
    question: 'How long is the party, and can we extend it?',
    answer: 'All party packages include 2 hours in the party room. Additional time may be purchased during checkout. One extra hour is $100.',
  },
  {
    question: 'Is there a cleaning fee?',
    answer: 'Yes. A $50 cleaning fee is added to all party reservations.',
  },
  {
    question: 'Can we bring our own cake or desserts?',
    answer: 'Yes, if you have booked a birthday party package. Outside cakes are not permitted for open play visits in the cafe or seating areas.',
  },
  {
    question: 'How many adults are included in the package?',
    answer: 'One adult per child is included. Additional guests are $10 each.',
  },
  {
    question: 'Can we add more children after booking?',
    answer: 'Please contact us directly if you need to adjust the number of children for your party.',
  },
  {
    question: 'Can I host a birthday without booking a party package?',
    answer: 'You\'re welcome to visit for open play, but cakes and celebrations in seating areas are only allowed with a booked party package.',
  },
  {
    question: 'What is your cancellation and refund policy?',
    answer: 'Cancellation more than 10 days prior receives 75% refund; within 10 days receives 50% refund; within 72 hours no refund. Please review our full policy on the Refund Policy page.',
  },
  {
    question: 'I\'m an adult not playing in the structure. Do I still need to remove my shoes?',
    answer: 'Yes. Grip socks are required for both adults and children to maintain a clean and safe environment for all guests.',
  },
  {
    question: 'Are waivers required for party guests?',
    answer: 'Yes. Every child entering the facility must have a waiver signed for the day of the visit.',
  },
  {
    question: 'Can we leave and re-enter during the party?',
    answer: 'Yes. Re-entry is allowed while your party is in progress.',
  },
  {
    question: 'Is the entire facility closed during our party?',
    answer: 'No. Your group will have exclusive use of the party room, but the play floor remains open to other guests.',
  },
];

// Modal state type
type ModalState = {
  isOpen: boolean;
  step: 'calendar' | 'confirm';
  selectedPackage: PartyPackageDto | null;
};

type GuestChild = {
  id: string;
  name: string;
  birthDate: string;
};

type SavedBookingState = {
  location: string;
  selectedDate: string | null;
  selectedSlot: string | null;
  selectedPackageId: string | null;
  packageQty: number;
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
  guestChildren: GuestChild[];
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
    const parsed = JSON.parse(saved);
    // Validate parsed data has expected structure
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.timestamp !== 'number'
    ) {
      sessionStorage.removeItem(BOOKING_STATE_KEY);
      return null;
    }
    // Expire after 30 minutes
    if (Date.now() - parsed.timestamp > 30 * 60 * 1000) {
      sessionStorage.removeItem(BOOKING_STATE_KEY);
      return null;
    }
    return parsed as SavedBookingState;
  } catch (e) {
    sessionStorage.removeItem(BOOKING_STATE_KEY);
    return null;
  }
}

function clearBookingState() {
  sessionStorage.removeItem(BOOKING_STATE_KEY);
}

// Add-on display configuration (type determines UI behavior)
const ADD_ON_UI_CONFIG: Record<string, { type: 'toggle' | 'quantity' }> = {
  extra_hour: { type: 'toggle' },
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
  facePainting: boolean;
  photoVideo: boolean;
};

const DEFAULT_ADD_ON_STATE: AddOnState = {
  extraHour: false,
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
  const [searchParams] = useSearchParams();
  const packageFromUrl = searchParams.get('package');

  // Ref for navigation timeout cleanup on unmount
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (navTimerRef.current) clearTimeout(navTimerRef.current); };
  }, []);


  // Additional terms tooltip toggle (by package id)
  const [openTermsId, setOpenTermsId] = useState<string | null>(null);
  const [dismissedTermsId, setDismissedTermsId] = useState<string | null>(null);
  const toggleTerms = useCallback((e: React.MouseEvent, pkgId: string) => {
    e.stopPropagation();
    setDismissedTermsId(null);
    setOpenTermsId((prev) => (prev === pkgId ? null : pkgId));
  }, []);
  const closeTerms = useCallback((e: React.MouseEvent, pkgId: string) => {
    e.stopPropagation();
    setOpenTermsId(null);
    setDismissedTermsId(pkgId);
  }, []);

  // Package state
  const [packages, setPackages] = useState<PartyPackageDto[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Booking state
  const [location, setLocation] = useState<(typeof PARTY_LOCATIONS)[number]>('Albany');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<BookingSlotsResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<SlotsErrorState | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Ticket quantities (for display)
  const [packageQty, setPackageQty] = useState(0);
  const [extraAdultQty, setExtraAdultQty] = useState(0);

  // Add-ons
  const [addOns, setAddOns] = useState<AddOnState>(DEFAULT_ADD_ON_STATE);

  // Pricing data from API
  const [addOnPricing, setAddOnPricing] = useState<PartyAddOnPricing[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [pricingLoading, setPricingLoading] = useState(true);

  // Build add-on options from API data
  const addOnOptions = useMemo(() => buildAddOnOptions(addOnPricing), [addOnPricing]);

  // Add child form state



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
  const [guestChildren, setGuestChildren] = useState<GuestChild[]>([]);
  const [guestWaiverAgreed, setGuestWaiverAgreed] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error' | 'info'; message?: string }>({ type: 'idle' });

  // Estimate
  const [estimate, setEstimate] = useState<BookingEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  // Track if state has been restored from sessionStorage
  const [stateRestored, setStateRestored] = useState(false);

  // Modal state
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    step: 'calendar',
    selectedPackage: null,
  });

  // Calendar month offset for modal calendar navigation
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);

  // Policy checkboxes state
  const [refundPolicyAgreed, setRefundPolicyAgreed] = useState(false);
  const [guestPolicyAgreed, setGuestPolicyAgreed] = useState(false);
  const [waiverPolicyAgreed, setWaiverPolicyAgreed] = useState(false);

  // FAQ accordion state
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  // Restore saved state on mount
  useEffect(() => {
    const saved = loadBookingState();
    if (saved) {
      setLocation(saved.location as typeof location);
      if (saved.selectedDate) {
        setSelectedDate(new Date(saved.selectedDate + 'T12:00:00'));
      }
      setSelectedSlot(saved.selectedSlot);
      if (saved.selectedPackageId) {
        setSelectedPackageId(saved.selectedPackageId);
      }
      setPackageQty(saved.packageQty);
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
      setGuestChildren(saved.guestChildren || []);
      setGuestWaiverAgreed(saved.guestWaiverAgreed);
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
          setAddOnPricing(addOnsResult.addOns ?? []);
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
      selectedDate: selectedDate ? toLocalISODate(selectedDate) : null,
      selectedSlot,
      selectedPackageId,
      packageQty,
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
      guestChildren,
      guestWaiverAgreed,
      waiverAgreement: false,
      waiverConfirmed: false,
      timestamp: Date.now(),
    });
  }, [
    stateRestored,
    location,
    selectedDate,
    selectedSlot,
    selectedPackageId,
    packageQty,
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
    guestChildren,
    guestWaiverAgreed,
  ]);

  // Sort packages by price ascending
  const sortedPackages = useMemo(
    () => [...packages].sort((a, b) => (a.basePrice ?? 0) - (b.basePrice ?? 0)),
    [packages]
  );

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) ?? null,
    [packages, selectedPackageId]
  );

  const selectedChildIds = useMemo(
    () => (user?.children ?? []).filter((child) => childSelections[child.id]).map((child) => child.id),
    [childSelections, user]
  );

  const addOnPayload = useMemo(() => buildAddOnPayload(addOns), [addOns]);

  // Load packages
  useEffect(() => {
    let active = true;
    async function loadPackages() {
      try {
        const result = await fetchPartyPackages();
        if (!active) return;
        setPackages(result);
        // Use package from URL if provided and valid, otherwise use first package
        if (packageFromUrl && result.some(p => p.id === packageFromUrl)) {
          setSelectedPackageId(packageFromUrl);
          setPackageQty(1); // Auto-add to cart
        } else if (result.length > 0 && !selectedPackageId) {
          setSelectedPackageId(result[0].id);
          setPackageQty(1); // Auto-add to cart
        }
      } catch (error) {
        console.error('Failed to load packages', error);
      }
    }
    loadPackages();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageFromUrl]);

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

      const eventDate = toLocalISODate(selectedDate!);

      try {
        const result = await fetchBookingSlots({ location, eventDate, packageId: modal.selectedPackage?.id });
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
  }, [location, selectedDate, modal.selectedPackage?.id]);

  // Calculate estimate - fetches pricing from database
  useEffect(() => {
    if (!selectedPackageId) {
      setEstimate(null);
      setEstimateError(null);
      return;
    }

    let active = true;
    async function calculateEstimate() {
      setEstimateLoading(true);
      setEstimateError(null);
      try {
        const result = await estimateBooking({
          partyPackageId: selectedPackageId!,
          location,
          guests: Math.max(packageQty * (selectedPackage?.maxGuests ?? 12), 1),
          extraAdults: extraAdultQty,
          addOns: addOnPayload.length > 0 ? addOnPayload : undefined,
        });
        if (!active) return;
        setEstimate(result);
        setEstimateError(null);
      } catch (err) {
        if (!active) return;
        setEstimate(null);
        setEstimateError('Unable to load pricing. Please try again.');
        console.error('Failed to load pricing estimate:', err);
      } finally {
        if (active) {
          setEstimateLoading(false);
        }
      }
    }
    calculateEstimate();
    return () => { active = false; };
  }, [selectedPackageId, location, packageQty, extraAdultQty, addOnPayload, selectedPackage?.maxGuests]);

  // Generate calendar days for the modal monthly calendar
  const calendarDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate the month to display
    const displayMonth = new Date(today.getFullYear(), today.getMonth() + calendarMonthOffset, 1);
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();

    // First day of the month
    const firstDay = new Date(year, month, 1);

    // Start from Sunday of the first week
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days: { date: Date; isCurrentMonth: boolean; isPast: boolean }[] = [];
    const current = new Date(startDate);

    // Generate 42 days (6 weeks) to fill the calendar grid
    for (let i = 0; i < 42; i++) {
      days.push({
        date: new Date(current),
        isCurrentMonth: current.getMonth() === month,
        isPast: current < today,
      });
      current.setDate(current.getDate() + 1);
    }

    return {
      days,
      monthLabel: displayMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      canGoPrev: calendarMonthOffset > 0,
    };
  }, [calendarMonthOffset]);

  // Modal handlers
  const openModal = (pkg: PartyPackageDto) => {
    setModal({
      isOpen: true,
      step: 'calendar',
      selectedPackage: pkg,
    });
    setSelectedPackageId(pkg.id);
    setPackageQty(1);
    // Reset all booking-specific state so previous selections don't carry over
    setExtraAdultQty(0);
    setAddOns(DEFAULT_ADD_ON_STATE);
    setSelectedDate(null);
    setSelectedSlot(null);
    setNotes('');
    setRefundPolicyAgreed(false);
    setGuestPolicyAgreed(false);
    setWaiverPolicyAgreed(false);
    setEstimate(null);
    setEstimateError(null);
    setStatus({ type: 'idle' });
    // Reset calendar to current month
    setCalendarMonthOffset(0);
  };

  const closeModal = () => {
    setModal({
      isOpen: false,
      step: 'calendar',
      selectedPackage: null,
    });
  };

  const goToConfirmStep = () => {
    setModal(prev => ({ ...prev, step: 'confirm' }));
  };

  const goBackToCalendarStep = () => {
    setModal(prev => ({ ...prev, step: 'calendar' }));
  };

  // Handlers
  const handleCalendarDateSelect = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date >= today) {
      setSelectedDate(date);
      setSelectedSlot(null);
    }
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    if (event) {
      event.preventDefault();
    }

    if (!selectedPackageId || !selectedSlot || !selectedDate) {
      setStatus({ type: 'error', message: 'Choose a package, date, and time slot before booking.' });
      return;
    }

    // Ensure pricing data has loaded from the database
    if (!estimate) {
      setStatus({ type: 'error', message: 'Pricing data is still loading. Please wait a moment and try again.' });
      return;
    }

    // Policy agreement validation
    if (!refundPolicyAgreed || !guestPolicyAgreed || !waiverPolicyAgreed) {
      setStatus({ type: 'error', message: 'Please agree to all policies before continuing.' });
      return;
    }

    // Guest booking validation
    if (!user) {
      if (!guestFirstName.trim()) {
        setStatus({ type: 'error', message: 'Please enter your first name.' });
        return;
      }
      if (!isValidName(guestFirstName)) {
        setStatus({ type: 'error', message: 'First name can only contain letters, spaces, hyphens, and apostrophes.' });
        return;
      }
      if (!guestLastName.trim()) {
        setStatus({ type: 'error', message: 'Please enter your last name.' });
        return;
      }
      if (!isValidName(guestLastName)) {
        setStatus({ type: 'error', message: 'Last name can only contain letters, spaces, hyphens, and apostrophes.' });
        return;
      }
      if (!guestEmail.trim()) {
        setStatus({ type: 'error', message: 'Please enter your email address.' });
        return;
      }
      if (!isValidEmail(guestEmail)) {
        setStatus({ type: 'error', message: 'Please enter a valid email address.' });
        return;
      }
      if (!guestPhone.trim()) {
        setStatus({ type: 'error', message: 'Please enter your phone number.' });
        return;
      }
      if (!isValidPhone(guestPhone)) {
        setStatus({ type: 'error', message: 'Please enter a valid 10-digit phone number.' });
        return;
      }
      if (!guestChildName.trim()) {
        setStatus({ type: 'error', message: 'Please enter the birthday child\'s name.' });
        return;
      }
      if (!isValidName(guestChildName)) {
        setStatus({ type: 'error', message: 'Child name can only contain letters, spaces, hyphens, and apostrophes.' });
        return;
      }
      // Validate child birth date if provided
      if (guestChildBirthDate && !isValidChildDOB(guestChildBirthDate)) {
        setStatus({ type: 'error', message: 'Please enter a valid birth date. Child must be between 0-13 years old.' });
        return;
      }
      // Check additional children have valid names and DOBs
      for (const child of guestChildren) {
        if (!child.name.trim()) {
          setStatus({ type: 'error', message: 'Please enter names for all children or remove empty entries.' });
          return;
        }
        if (!isValidName(child.name)) {
          setStatus({ type: 'error', message: 'Child names can only contain letters, spaces, hyphens, and apostrophes.' });
          return;
        }
        if (child.birthDate && !isValidChildDOB(child.birthDate)) {
          setStatus({ type: 'error', message: 'Please enter valid birth dates. Children must be between 0-13 years old.' });
          return;
        }
      }
    } else {
      // Authenticated user validation
      if (selectedChildIds.length === 0) {
        setStatus({ type: 'error', message: 'Select at least one child for this celebration.' });
        return;
      }
    }

    setSubmitting(true);

    // Bug fix #15: Wrap in try/catch so setSubmitting is reset on error
    try {

    // Standard e-commerce: Add to cart only (no database record until payment)
    // Store pre-tax total - tax is calculated at checkout
    const totalAmount = (estimate?.subtotal ?? cartSubtotal) + (estimate?.cleaningFee ?? cleaningFee);
    const guestCount = Math.max(packageQty * (selectedPackage?.maxGuests ?? 12), 1);
    const cartItemId = `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build add-on details with names for display
    const addOnDetailsForCart = estimate?.addOns?.map(a => {
      const option = addOnOptions.find(opt => opt.id === a.id);
      return {
        id: a.id,
        name: option?.label ?? a.id,
        price: a.price,
        quantity: a.quantity,
      };
    }) ?? [];

    if (!user) {
      // Guest booking - store guest info in cart
      addBookingDepositItem({
        id: cartItemId,
        type: 'booking',
        packageId: selectedPackageId,
        packageName: selectedPackage?.name ?? 'Party Package',
        location,
        eventDate: toLocalISODate(selectedDate),
        startTime: selectedSlot,
        guestCount,
        total: totalAmount,
        // Pricing breakdown for display
        durationMinutes: selectedPackage?.durationMinutes,
        basePrice: estimate?.basePrice ?? selectedPackage?.basePrice,
        extraAdultCount: extraAdultQty,
        extraAdultFee: estimate?.extraAdultFee,
        extraAdultTotal: estimate?.extraAdultTotal,
        addOnDetails: addOnDetailsForCart.length > 0 ? addOnDetailsForCart : undefined,
        cleaningFee: estimate?.cleaningFee ?? cleaningFee,
        subtotal: estimate?.subtotal ?? cartSubtotal,
        tax: estimate?.tax ?? tax,
        notes: notes.trim() || undefined,
        addOns: addOnPayload.length ? addOnPayload : undefined,
        guestInfo: {
          firstName: guestFirstName.trim(),
          lastName: guestLastName.trim(),
          email: guestEmail.trim(),
          phone: guestPhone.trim(),
          childName: guestChildName.trim(),
          childBirthDate: guestChildBirthDate || undefined,
          additionalChildren: guestChildren.length > 0
            ? guestChildren.map(c => ({ name: c.name.trim(), birthDate: c.birthDate || undefined }))
            : undefined,
        },
        status: 'pending',
      });
    } else {
      // Authenticated booking - store user's selected children
      addBookingDepositItem({
        id: cartItemId,
        type: 'booking',
        packageId: selectedPackageId,
        packageName: selectedPackage?.name ?? 'Party Package',
        location,
        eventDate: toLocalISODate(selectedDate),
        startTime: selectedSlot,
        guestCount,
        total: totalAmount,
        // Pricing breakdown for display
        durationMinutes: selectedPackage?.durationMinutes,
        basePrice: estimate?.basePrice ?? selectedPackage?.basePrice,
        extraAdultCount: extraAdultQty,
        extraAdultFee: estimate?.extraAdultFee,
        extraAdultTotal: estimate?.extraAdultTotal,
        addOnDetails: addOnDetailsForCart.length > 0 ? addOnDetailsForCart : undefined,
        cleaningFee: estimate?.cleaningFee ?? cleaningFee,
        subtotal: estimate?.subtotal ?? cartSubtotal,
        tax: estimate?.tax ?? tax,
        childIds: selectedChildIds,
        notes: notes.trim() || undefined,
        addOns: addOnPayload.length ? addOnPayload : undefined,
        status: 'pending',
      });
    }

    // Clear state and show success
    clearBookingState();
    setStatus({ type: 'success', message: 'Party added to cart!' });

    // Redirect to cart after brief delay (cleanup on unmount via navTimerRef)
    navTimerRef.current = setTimeout(() => {
      setSubmitting(false);
      closeModal();
      navigate('/cart');
    }, 1500);

    } catch (err) {
      // Bug fix #15: Reset submitting state so user can retry
      setSubmitting(false);
      const message = err instanceof Error ? err.message : 'Failed to add party to cart. Please try again.';
      setStatus({ type: 'error', message });
    }
  };

  // All values from estimate API - no hardcoded fallbacks
  const cartSubtotal = estimate?.subtotal ?? 0;
  const cleaningFee = estimate?.cleaningFee ?? 0;
  const tax = estimate?.tax ?? 0;

  // Calculate end time from start time and duration
  const getEndTime = (startTime: string, durationMinutes: number) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMins = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  };

  // Check if confirm button should be enabled
  const canConfirmBooking = () => {
    // Pricing must be loaded from database
    if (!estimate) return false;
    if (!refundPolicyAgreed || !guestPolicyAgreed || !waiverPolicyAgreed) return false;
    if (!user) {
      // Guest validation
      if (!guestFirstName.trim() || !guestLastName.trim() || !guestEmail.trim() || !guestPhone.trim() || !guestChildName.trim()) return false;
    } else {
      // Auth user validation
      if (selectedChildIds.length === 0) return false;
    }
    return true;
  };

  return (
    <section className={styles.page}>
      <div className={styles.mainLayout}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <button type="button" className={styles.backButton} onClick={() => navigate(-1)}>
            <span className={styles.backArrow}>←</span>
            <span>Back</span>
          </button>
          <h1>Book a Party</h1>
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

        {/* Package Selection */}
        {sortedPackages.length > 0 && (
          <div className={styles.section}>
            <h2>Choose your package</h2>
            <p className={styles.sectionHint}>Click a package to start booking</p>
            <div className={styles.packageGrid}>
              {sortedPackages.map((pkg) => {
                // Use features from API, fallback to empty array
                const features = pkg.features ?? [];
                const additionalTerms = pkg.additionalTerms ?? [];
                const extraAdultPrice = pkg.extraAdultPrice ?? 10;

                return (
                  <button
                    key={pkg.id}
                    type="button"
                    className={styles.packageCard}
                    onClick={() => openModal(pkg)}
                  >
                    <div className={styles.packageCardHeader}>
                      <h3>{pkg.name}</h3>
                      <span className={styles.packageCardPrice}>${pkg.basePrice}</span>
                    </div>
                    <div className={styles.packageCardSubheader}>
                      <span>Up to {pkg.maxGuests} Children</span>
                      <span>Additional guest (13+ years old) is ${extraAdultPrice}</span>
                    </div>
                    {features.length > 0 && (
                      <ul className={styles.packageCardFeatureList}>
                        {features.map((feature, idx) => (
                          <li key={idx}>{feature}</li>
                        ))}
                      </ul>
                    )}
                    {additionalTerms.length > 0 && (
                      <div
                        className={styles.additionalTermsRow}
                        onClick={(e) => toggleTerms(e, pkg.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <span>Additional Terms</span>
                        <div className={`${styles.tooltipWrapper}${dismissedTermsId === pkg.id ? ` ${styles.tooltipDismissed}` : ''}`}>
                          <span className={styles.tooltipIcon}>?</span>
                          <div className={`${styles.tooltipContent}${openTermsId === pkg.id ? ` ${styles.tooltipOpen}` : ''}`}>
                            <span
                              role="button"
                              tabIndex={0}
                              className={styles.tooltipClose}
                              onClick={(e) => closeTerms(e, pkg.id)}
                              aria-label="Close"
                            >
                              &times;
                            </span>
                            <strong>Additional Terms</strong>
                            <ol>
                              {additionalTerms.map((term, idx) => (
                                <li key={idx}><strong>{term.title}</strong> — {term.description}</li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className={styles.packageCardAction}>
                      Select Package
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* FAQ Section */}
        <div className={styles.faqSection}>
          <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
          <p className={styles.faqSubtitle}>Everything you need to know about birthday parties at Playfunia</p>
          <div className={styles.faqList}>
            {PARTY_FAQS.map((faq, index) => (
              <div
                key={index}
                className={`${styles.faqItem} ${expandedFaq === index ? styles.faqItemExpanded : ''}`}
              >
                <button
                  type="button"
                  className={styles.faqQuestion}
                  onClick={() => toggleFaq(index)}
                  aria-expanded={expandedFaq === index}
                >
                  <span>{faq.question}</span>
                  <span className={styles.faqIcon}>{expandedFaq === index ? '−' : '+'}</span>
                </button>
                {expandedFaq === index && (
                  <div className={styles.faqAnswer}>
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      {modal.isOpen && modal.selectedPackage && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>
                  {modal.step === 'calendar' ? modal.selectedPackage.name : 'Confirm booking'}
                </h2>
                {modal.step === 'calendar' && (
                  <p className={styles.modalSubtitle}>
                    <span className={styles.durationIcon}>⏱</span>
                    {Math.floor(modal.selectedPackage.durationMinutes / 60)} hours
                  </p>
                )}
                {modal.step === 'confirm' && (
                  <p className={styles.modalSubtitle}>{modal.selectedPackage.name}</p>
                )}
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className={styles.modalBody}>
              {modal.step === 'calendar' && (
                <>
                  {/* Calendar Step */}
                  <div className={styles.calendarTimeContainer}>
                    {/* Monthly Calendar */}
                    <div className={styles.calendarSection}>
                      <div className={styles.calendarHeader}>
                        <h3 className={styles.calendarMonthLabel}>{calendarDays.monthLabel}</h3>
                        <div className={styles.calendarNav}>
                          <button
                            type="button"
                            className={styles.calendarNavBtn}
                            onClick={() => setCalendarMonthOffset(prev => Math.max(0, prev - 1))}
                            disabled={!calendarDays.canGoPrev}
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            className={styles.calendarNavBtn}
                            onClick={() => setCalendarMonthOffset(prev => Math.min(12, prev + 1))}
                            disabled={calendarMonthOffset >= 12}
                          >
                            ›
                          </button>
                        </div>
                      </div>
                      <div className={styles.calendarGrid}>
                        <div className={styles.calendarWeekdays}>
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className={styles.calendarWeekday}>{day}</div>
                          ))}
                        </div>
                        <div className={styles.calendarDays}>
                          {calendarDays.days.map((day, index) => {
                            const isSelected = selectedDate?.toDateString() === day.date.toDateString();
                            const isDisabled = day.isPast || !day.isCurrentMonth;
                            return (
                              <button
                                key={index}
                                type="button"
                                className={`${styles.calendarDay} ${isSelected ? styles.calendarDaySelected : ''} ${!day.isCurrentMonth ? styles.calendarDayOtherMonth : ''} ${day.isPast ? styles.calendarDayDisabled : ''}`}
                                onClick={() => !isDisabled && handleCalendarDateSelect(day.date)}
                                disabled={isDisabled}
                              >
                                {day.date.getDate()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Time Slots */}
                    <div className={styles.timeSlotsSection}>
                      {selectedDate ? (
                        <>
                          <h3 className={styles.timeSlotsTitle}>
                            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                          </h3>
                          {slotsLoading ? (
                            <p className={styles.slotsLoading}>Loading available times...</p>
                          ) : slotsError ? (
                            <div className={styles.slotsErrorBox}>
                              <p>{slotsError.message}</p>
                            </div>
                          ) : slots && slots.slots.length > 0 ? (
                            <div className={styles.timeSlotsList}>
                              {slots.slots.map((slot) => {
                                const isSelected = slot.startTime === selectedSlot;
                                const disabled = !slot.available;
                                const endTime = getEndTime(slot.startTime, modal.selectedPackage?.durationMinutes ?? 120);
                                return (
                                  <button
                                    key={slot.startTime}
                                    type="button"
                                    className={`${styles.timeSlotItem} ${isSelected ? styles.timeSlotItemSelected : ''}`}
                                    onClick={() => !disabled && setSelectedSlot(slot.startTime)}
                                    disabled={disabled}
                                  >
                                    {formatTime(slot.startTime)} - {formatTime(endTime)}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className={styles.slotsEmpty}>No slots available for this date.</p>
                          )}
                          {!selectedSlot && slots && slots.slots.length > 0 && (
                            <p className={styles.selectTimeHint}>Please select a time slot</p>
                          )}
                        </>
                      ) : (
                        <div className={styles.selectDatePrompt}>
                          <p>Select a date to see available times</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {modal.step === 'confirm' && (
                <>
                  {/* Confirm Step */}
                  <div className={styles.confirmContent}>
                    {/* Booking Summary */}
                    <div className={styles.bookingSummaryBar}>
                      <div className={styles.bookingSummaryItem}>
                        <span className={styles.bookingSummaryIcon}>📅</span>
                        <span>
                          {formatTime(selectedSlot ?? '')} - {formatTime(getEndTime(selectedSlot ?? '', (modal.selectedPackage?.durationMinutes ?? 120) + (addOns.extraHour ? 60 : 0)))} | {selectedDate?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    {/* Add-ons Section */}
                    <div className={styles.confirmSection}>
                      <h3>Take a look at other services</h3>
                      <div className={styles.addOnsGrid}>
                        {/* Additional Adult */}
                        <div className={styles.addOnCard}>
                          <div className={styles.addOnCardInfo}>
                            <div className={styles.addOnCardIcon}>+1👤</div>
                            <div>
                              <h4>Additional Guest (13+ years old)</h4>
                              <span className={styles.addOnCardPrice}>${estimate?.extraAdultFee ?? 10}</span>
                            </div>
                          </div>
                          <div className={styles.addOnCardControls}>
                            <button type="button" onClick={() => setExtraAdultQty(Math.max(0, extraAdultQty - 1))}>−</button>
                            <span>{extraAdultQty}</span>
                            <button type="button" onClick={() => setExtraAdultQty(Math.min(20, extraAdultQty + 1))} disabled={extraAdultQty >= 20}>+</button>
                          </div>
                        </div>

                        {/* Extra Hour */}
                        <div className={`${styles.addOnCard} ${styles.addOnCardWide}`}>
                          <div className={styles.addOnCardInfo}>
                            <div className={styles.addOnCardIcon}>⏰</div>
                            <div>
                              <h4>Extra 1 Hour</h4>
                              <span className={styles.addOnCardPrice}>${addOnOptions.find(a => a.id === 'extra_hour')?.price ?? 100}</span>
                              <span className={styles.addOnCardMeta}>+60 minutes</span>
                            </div>
                          </div>
                          <div className={styles.addOnCardControls}>
                            <button type="button" onClick={() => setAddOns(s => ({ ...s, extraHour: false }))}>
                              −
                            </button>
                            <span>{addOns.extraHour ? 1 : 0}</span>
                            <button type="button" onClick={() => setAddOns(s => ({ ...s, extraHour: true }))}>+</button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Info Banner */}
                    <div className={styles.infoBanner}>
                      <span className={styles.infoBannerIcon}>ℹ</span>
                      <div>
                        <strong>Booking will be confirmed after checkout.</strong>
                        <p>You will receive an email confirmation with appointment details after checking out.</p>
                      </div>
                    </div>

                    {/* Children Section - For authenticated users */}
                    {user && (
                      <div className={styles.confirmSection}>
                        <h3>Children celebrating</h3>
                        {(user.children?.length ?? 0) > 0 ? (
                          <div className={styles.childrenCheckboxList}>
                            {(user.children ?? []).map((child) => (
                              <label key={child.id} className={styles.childCheckboxItem}>
                                <input
                                  type="radio"
                                  name="celebratingChild"
                                  checked={Boolean(childSelections[child.id])}
                                  onChange={() =>
                                    setChildSelections({ [child.id]: true })
                                  }
                                />
                                <span>
                                  {child.firstName} {child.lastName ?? ''}
                                  {child.birthDate && ` (${formatMonthYear(child.birthDate)})`}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.noChildrenMsg}>No children on your account.</p>
                        )}
                      </div>
                    )}

                    {/* Contact Form - For guests */}
                    {!user && (
                      <div className={styles.confirmSection}>
                        <h3>Your contact information</h3>
                        <p className={styles.guestFormNote}>
                          <Link to="/account?redirect=/book-party">Already have an account? Sign in</Link>
                        </p>
                        <div className={styles.contactFormGrid}>
                          <div className={styles.formField}>
                            <label>First Name: *</label>
                            <input
                              type="text"
                              value={guestFirstName}
                              onChange={(e) => setGuestFirstName(formatNameInput(e.target.value))}
                              placeholder="First name"
                              required
                              maxLength={100}
                              pattern="[A-Za-zÀ-ÿ\s'\-]+"
                              title="Letters, spaces, hyphens, and apostrophes only"
                              autoComplete="given-name"
                            />
                          </div>
                          <div className={styles.formField}>
                            <label>Last Name: *</label>
                            <input
                              type="text"
                              value={guestLastName}
                              onChange={(e) => setGuestLastName(formatNameInput(e.target.value))}
                              placeholder="Last name"
                              required
                              maxLength={100}
                              pattern="[A-Za-zÀ-ÿ\s'\-]+"
                              title="Letters, spaces, hyphens, and apostrophes only"
                              autoComplete="family-name"
                            />
                          </div>
                          <div className={styles.formField}>
                            <label>Email: *</label>
                            <input
                              type="email"
                              value={guestEmail}
                              onChange={(e) => setGuestEmail(e.target.value.trim())}
                              placeholder="your@email.com"
                              required
                              maxLength={255}
                              autoComplete="email"
                            />
                          </div>
                          <div className={styles.formField}>
                            <label>Phone: *</label>
                            <input
                              type="tel"
                              inputMode="numeric"
                              value={guestPhone}
                              onChange={(e) => setGuestPhone(formatPhoneInput(e.target.value))}
                              placeholder="5551234567"
                              required
                              maxLength={10}
                              pattern="\d{10}"
                              title="10-digit phone number"
                              autoComplete="tel"
                            />
                          </div>
                        </div>

                        <h4 className={styles.childSubheader}>Birthday child</h4>
                        <div className={styles.contactFormGrid}>
                          <div className={styles.formField}>
                            <label>Child&apos;s name: *</label>
                            <input
                              type="text"
                              value={guestChildName}
                              onChange={(e) => setGuestChildName(formatNameInput(e.target.value))}
                              placeholder="Child's full name"
                              required
                              maxLength={100}
                              pattern="[A-Za-zÀ-ÿ\s'\-]+"
                              title="Letters, spaces, hyphens, and apostrophes only"
                            />
                          </div>
                          <div className={styles.formField}>
                            <label>Birth date:</label>
                            <input
                              type="date"
                              value={guestChildBirthDate}
                              onChange={(e) => setGuestChildBirthDate(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Special Requests */}
                    <div className={styles.confirmSection}>
                      <h3>Special requests</h3>
                      <textarea
                        className={styles.notesTextarea}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Let us know about themes, allergies, or special requests..."
                        rows={3}
                        maxLength={500}
                      />
                    </div>

                    {/* Policy Checkboxes */}
                    <div className={styles.confirmSection}>
                      <h3>Policies &amp; Agreements</h3>
                      <div className={styles.policiesSection}>
                        <label className={styles.policyCheckbox}>
                          <input
                            type="checkbox"
                            checked={refundPolicyAgreed}
                            onChange={(e) => setRefundPolicyAgreed(e.target.checked)}
                          />
                          <div className={styles.policyContent}>
                            <span className={styles.policyTitle}>
                              Party Booking Refund Policy (<Link to="/refund-policy" target="_blank">see here</Link>) *
                            </span>
                            <p className={styles.policyText}>
                              I agree to the refund policy: cancellation more than 10 days prior receives 75% refund; within 10 days receives 50% refund; within 72 hours no refund.
                            </p>
                          </div>
                        </label>

                        <label className={styles.policyCheckbox}>
                          <input
                            type="checkbox"
                            checked={guestPolicyAgreed}
                            onChange={(e) => setGuestPolicyAgreed(e.target.checked)}
                          />
                          <div className={styles.policyContent}>
                            <span className={styles.policyTitle}>
                              Guest Policy (<Link to="/guest-policy" target="_blank">see here</Link>) *
                            </span>
                            <p className={styles.policyText}>
                              I agree to pay for any additional guests or services if the number of attendees exceeds my package.
                            </p>
                          </div>
                        </label>

                        <label className={styles.policyCheckbox}>
                          <input
                            type="checkbox"
                            checked={waiverPolicyAgreed}
                            onChange={(e) => setWaiverPolicyAgreed(e.target.checked)}
                          />
                          <div className={styles.policyContent}>
                            <span className={styles.policyTitle}>
                              Waiver Policy (<Link to="/waiver-policy" target="_blank">see here</Link>) *
                            </span>
                            <p className={styles.policyText}>
                              I understand all children must have a waiver signed by their parent/guardian before participating.
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>

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
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className={styles.modalFooter}>
              {modal.step === 'confirm' ? (
                <div className={styles.modalTotal}>
                  <span className={styles.modalTotalLabel}>Deposit Due Today</span>
                  {estimateLoading || !estimate ? (
                    <span className={styles.modalTotalAmount}>Loading...</span>
                  ) : estimateError ? (
                    <span className={styles.modalTotalAmount} style={{ color: '#dc2626' }}>Error</span>
                  ) : (
                    <span className={styles.modalTotalAmount}>${estimate.total.toFixed(2)}</span>
                  )}
                </div>
              ) : (
                <div />
              )}
              {modal.step === 'confirm' && estimateError && (
                <div className={styles.pricingError}>{estimateError}</div>
              )}
              <div className={styles.modalActions}>
                {modal.step === 'confirm' && (
                  <button
                    type="button"
                    className={styles.modalBackBtn}
                    onClick={goBackToCalendarStep}
                  >
                    ← Back
                  </button>
                )}
                {modal.step === 'calendar' && (
                  <button
                    type="button"
                    className={styles.modalNextBtn}
                    onClick={goToConfirmStep}
                    disabled={!selectedDate || !selectedSlot}
                  >
                    Next →
                  </button>
                )}
                {modal.step === 'confirm' && (
                  <button
                    type="button"
                    className={styles.modalConfirmBtn}
                    onClick={() => handleSubmit()}
                    disabled={submitting || !canConfirmBooking() || estimateLoading}
                  >
                    {submitting ? 'Processing...' : estimateLoading ? 'Loading pricing...' : 'Confirm Booking'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Helper functions
function buildAddOnPayload(state: AddOnState): Array<{ id: string; quantity: number }> {
  const items: Array<{ id: string; quantity: number }> = [];
  if (state.extraHour) items.push({ id: 'extra_hour', quantity: 1 });
  if (state.facePainting) items.push({ id: 'face_painting', quantity: 1 });
  if (state.photoVideo) items.push({ id: 'photo_video', quantity: 1 });
  return items;
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
