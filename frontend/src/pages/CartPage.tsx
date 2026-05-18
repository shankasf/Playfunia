import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useCheckout, CheckoutItem } from '../context/CheckoutContext';
import { useAuth } from '../context/AuthContext';
import { SquarePaymentForm } from '../components/checkout/SquarePaymentForm';
import { CountdownTimer } from '../components/checkout/CountdownTimer';
import {
  getSquareConfig,
  finalizeSquareCheckout,
  finalizeSquareGuestCheckout,
  SquareConfig,
  SquareCheckoutFinalizeResponse,
} from '../api/square';
import { getReceiptsByPaymentId, getReceiptPdfUrl, ReceiptInfo } from '../api/receipts';
import { getAllPricing, type AllPricing } from '../api/pricing';
import { reserveSlot, cancelReservation } from '../api/reservations';
import { createCheckoutSession, cancelCheckoutSession } from '../api/checkout-sessions';
import { formatTime } from '../lib/dateUtils';
import {
  formatNameInput,
  formatPhoneInput,
  isValidName,
  isValidPhone,
  isValidEmail,
} from '../utils/validation';
import { uploadChildPhoto } from '../api/child-photo';
import { addChild } from '../api/users';
import { MEMBERSHIP_REFUND_POLICY_ITEMS } from '../data/membershipRefundPolicy';
import { validateCoupon, type CouponCartItem, type ValidateCouponSuccess } from '../api/coupons';
import styles from './CartPage.module.css';

// Default tax rate (fallback before API loads)
const DEFAULT_TAX_RATE = 0.08;

// Order details stored after successful payment
interface CompletedOrder {
  paymentId: string;
  items: CheckoutItem[];
  subtotal: number;
  tax: number;
  total: number;
  date: string;
  receipts: ReceiptInfo[];
}

export function CartPage() {
  const { items, removeItem, updateTicketQuantity, markTicketFulfilled, markMembershipActivated, markBookingPaid, clear } = useCheckout();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [squareConfig, setSquareConfig] = useState<SquareConfig | null>(null);
  const [pricingData, setPricingData] = useState<AllPricing | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  // Refs for payment timers so we can clean them up on unmount
  const receiptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [squareConfigError, setSquareConfigError] = useState<string | null>(null);

  // Refund policy acceptance (required for membership items)
  const [refundPolicyAccepted, setRefundPolicyAccepted] = useState(false);
  const [refundPolicyAcceptedAt, setRefundPolicyAcceptedAt] = useState<string | null>(null);
  const [showRefundPolicy, setShowRefundPolicy] = useState(false);

  // Guest checkout form state
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);

  // Membership child/parent info (required for membership purchases)
  const [memberChildFirstName, setMemberChildFirstName] = useState('');
  const [memberChildLastName, setMemberChildLastName] = useState('');
  const [memberChildBirthDate, setMemberChildBirthDate] = useState('');
  const [memberChildPhoto, setMemberChildPhoto] = useState<File | null>(null);
  const [memberChildPhotoPreview, setMemberChildPhotoPreview] = useState<string | null>(null);
  const [memberParentZipCode, setMemberParentZipCode] = useState('');
  const [memberParentPhone, setMemberParentPhone] = useState('');
  const [memberReferralAnswer, setMemberReferralAnswer] = useState<'yes' | 'no' | ''>('');
  const [memberReferralName, setMemberReferralName] = useState('');
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  // Pre-fill parent phone from user profile
  useEffect(() => {
    if (user?.phone && !memberParentPhone) {
      setMemberParentPhone(user.phone);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill guest info from booking item (if guest booked a party)
  // Only runs on mount and when items change - uses functional updates to avoid stale closures
  useEffect(() => {
    if (user) return; // Skip for logged-in users

    // Find a booking item with guestInfo
    const bookingWithGuestInfo = items.find(
      item => item.type === 'booking' && item.guestInfo
    );

    if (bookingWithGuestInfo?.type === 'booking' && bookingWithGuestInfo.guestInfo) {
      const info = bookingWithGuestInfo.guestInfo;
      // Only pre-fill if the field is currently empty
      setGuestFirstName(prev => prev || info.firstName || '');
      setGuestLastName(prev => prev || info.lastName || '');
      setGuestEmail(prev => prev || info.email || '');
      setGuestPhone(prev => prev || info.phone || '');
    }
  }, [items, user]);

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<ValidateCouponSuccess | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  // Slot reservation state (5-minute countdown)
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [allReservationIds, setAllReservationIds] = useState<string[]>([]);
  const [reservationExpiresAt, setReservationExpiresAt] = useState<string | null>(null);
  const [reservationExpired, setReservationExpired] = useState(false);
  const [reservingSlot, setReservingSlot] = useState(false);
  // Checkout session tracking (DB-backed 5-minute timer)
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);

  // Filter to pending items only
  const pendingItems = items.filter(item => {
    if (item.type === 'ticket') return item.status === 'pending';
    if (item.type === 'membership') return item.status === 'pending';
    if (item.type === 'booking') return item.status === 'pending';
    return false;
  });

  const hasMembershipItems = pendingItems.some(item => item.type === 'membership');

  // Tax rate for non-booking items (bookings have tax from API)
  // Use API rate when available, fallback to default
  const TAX_RATE = pricingData?.config.taxRate ?? DEFAULT_TAX_RATE;

  // Calculate totals from item data
  // For bookings: use subtotal + cleaningFee for pre-tax amount
  // For tickets/memberships: item.total is pre-tax
  const subtotal = pendingItems.reduce((sum, item) => {
    if (item.type === 'booking') {
      return sum + (item.subtotal ?? 0) + (item.cleaningFee ?? 0);
    }
    return sum + item.total;
  }, 0);

  // Coupon discount: subtract from subtotal before computing tax
  // The backend re-validates and re-computes the discount on its own; this is for display only.
  const couponDiscount = appliedCoupon ? Math.min(appliedCoupon.discountAmount, subtotal) : 0;
  const discountedSubtotalCents = Math.max(0, Math.round(subtotal * 100) - Math.round(couponDiscount * 100));

  // Get tax from booking items (from API), calculate for others
  // Use cents-based math to avoid floating-point rounding errors.
  // When a coupon is applied, distribute it proportionally so the tax recalculation matches the backend.
  const subtotalCents = Math.round(subtotal * 100);
  const discountFactor = subtotalCents > 0 ? discountedSubtotalCents / subtotalCents : 1;
  const taxAmount = pendingItems.reduce((sum, item) => {
    if (item.type === 'booking') {
      return sum + (item.tax ?? 0) * discountFactor;
    }
    const totalCents = Math.round(item.total * 100) * discountFactor;
    const taxCents = Math.round(totalCents * TAX_RATE);
    return sum + taxCents / 100;
  }, 0);

  const total = Number((discountedSubtotalCents / 100 + taxAmount).toFixed(2));

  // Build coupon-cart items for backend validation. Re-derive whenever pendingItems change.
  const couponCartItems: CouponCartItem[] = pendingItems.map(item => {
    if (item.type === 'ticket') return { type: 'ticket', unitPrice: item.unitPrice, quantity: item.quantity };
    if (item.type === 'membership') return { type: 'membership', unitPrice: item.total };
    return { type: 'booking', unitPrice: (item.subtotal ?? 0) + (item.cleaningFee ?? 0) };
  });

  // Re-validate the applied coupon when the cart changes; clear if it's no longer valid.
  useEffect(() => {
    if (!appliedCoupon) return;
    if (pendingItems.length === 0) {
      setAppliedCoupon(null);
      return;
    }
    let cancelled = false;
    validateCoupon({ code: appliedCoupon.code, items: couponCartItems }).then(result => {
      if (cancelled) return;
      if (!result.valid) {
        setAppliedCoupon(null);
        setCouponError(result.message);
      } else {
        setAppliedCoupon(result);
      }
    });
    return () => { cancelled = true; };
    // Re-run when the cart contents change in a way that affects pricing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(couponCartItems)]);

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponError('Enter a coupon code.');
      return;
    }
    if (pendingItems.length === 0) {
      setCouponError('Your cart is empty.');
      return;
    }
    setCouponBusy(true);
    setCouponError(null);
    const result = await validateCoupon({ code, items: couponCartItems });
    setCouponBusy(false);
    if (!result.valid) {
      setAppliedCoupon(null);
      setCouponError(result.message);
      return;
    }
    setAppliedCoupon(result);
    setCouponInput(result.code);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
  };

  // Cleanup timers on unmount to prevent stale state updates
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (receiptTimerRef.current) clearTimeout(receiptTimerRef.current);
      if (clearCartTimerRef.current) clearTimeout(clearCartTimerRef.current);
    };
  }, []);

  // Load Square config and pricing data
  useEffect(() => {
    getSquareConfig()
      .then(setSquareConfig)
      .catch(err => {
        console.error('Failed to load Square config:', err);
        setSquareConfigError('Payment system is temporarily unavailable. Please try again later.');
      });

    getAllPricing()
      .then(setPricingData)
      .catch(err => console.error('Failed to load pricing config:', err));
  }, []);

  // Warn user before navigating away during active payment processing
  useEffect(() => {
    if (!processing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [processing]);

  const handleRemoveItem = (id: string) => {
    // Prevent removing items during active payment processing
    if (processing) return;
    removeItem(id);
    if (pendingItems.length === 1) {
      setShowPayment(false);
    }
  };

  const handleTicketIncrement = (id: string, currentQty: number) => {
    if (currentQty < 10) {
      updateTicketQuantity(id, currentQty + 1);
    }
  };

  const handleTicketDecrement = (id: string, currentQty: number) => {
    if (currentQty <= 1) {
      handleRemoveItem(id);
    } else {
      updateTicketQuantity(id, currentQty - 1);
    }
  };

  const validateGuestInfo = () => {
    if (!guestFirstName.trim()) {
      setError('Please enter your first name.');
      return false;
    }
    if (!isValidName(guestFirstName)) {
      setError('First name can only contain letters, spaces, hyphens, and apostrophes.');
      return false;
    }
    if (!guestLastName.trim()) {
      setError('Please enter your last name.');
      return false;
    }
    if (!isValidName(guestLastName)) {
      setError('Last name can only contain letters, spaces, hyphens, and apostrophes.');
      return false;
    }
    if (!guestEmail.trim()) {
      setError('Please enter your email address.');
      return false;
    }
    if (!isValidEmail(guestEmail)) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (!guestPhone.trim()) {
      setError('Please enter your phone number.');
      return false;
    }
    if (!isValidPhone(guestPhone)) {
      setError('Please enter a valid 10-digit phone number.');
      return false;
    }
    return true;
  };

  // Check if the selected existing child already has a photo on file
  const selectedChildHasPhoto = (): boolean => {
    if (!selectedChildId || !user?.children) return false;
    const child = user.children.find(c => c.id === selectedChildId);
    return !!child?.photoUrl;
  };

  // Check if all membership required fields are filled (used to disable button)
  const isMembershipInfoComplete = (): boolean => {
    if (!hasMembershipItems) return true;
    if (!user) return false;
    if (!memberParentPhone.trim() || !isValidPhone(memberParentPhone)) return false;
    if (!memberParentZipCode.trim() || memberParentZipCode.trim().length < 5) return false;
    if (!selectedChildId) {
      if (!memberChildFirstName.trim() || !memberChildLastName.trim() || !memberChildBirthDate) return false;
    }
    // Photo required: either a new upload or existing child already has one
    if (!memberChildPhoto && !selectedChildHasPhoto()) return false;
    return true;
  };

  const validateMembershipInfo = (): boolean => {
    if (!hasMembershipItems) return true;
    if (!user) {
      setError('Please sign in or create an account to purchase a membership.');
      return false;
    }
    if (!memberParentPhone.trim() || !isValidPhone(memberParentPhone)) {
      setError('Please enter a valid 10-digit phone number.');
      return false;
    }
    if (!memberParentZipCode.trim() || memberParentZipCode.trim().length < 5) {
      setError('Please enter a valid ZIP code.');
      return false;
    }
    if (!selectedChildId) {
      if (!memberChildFirstName.trim()) {
        setError('Please enter the child\'s first name.');
        return false;
      }
      if (!memberChildLastName.trim()) {
        setError('Please enter the child\'s last name.');
        return false;
      }
      if (!memberChildBirthDate) {
        setError('Please enter the child\'s date of birth.');
        return false;
      }
    }
    // Photo required: either a new upload or existing child already has one
    if (!memberChildPhoto && !selectedChildHasPhoto()) {
      setError('Please upload a photo of the child for check-in verification.');
      return false;
    }
    return true;
  };

  const handleProceedToPayment = async () => {
    if (!user && !validateGuestInfo()) {
      return;
    }
    if (!validateMembershipInfo()) {
      return;
    }
    if (hasMembershipItems && !refundPolicyAccepted) {
      setError('You must accept the Membership Refund Policy before proceeding.');
      return;
    }
    setError(null);
    setReservationExpired(false);

    // For memberships: create child + upload photo before payment
    if (hasMembershipItems && !selectedChildId && memberChildFirstName.trim()) {
      try {
        const { child } = await addChild({
          firstName: memberChildFirstName.trim(),
          lastName: memberChildLastName.trim(),
          birthDate: memberChildBirthDate || undefined,
        });
        setSelectedChildId(child.id);

        // Upload photo for the new child
        if (memberChildPhoto) {
          await uploadChildPhoto(child.id, memberChildPhoto);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save child information.');
        return;
      }
    } else if (hasMembershipItems && selectedChildId && memberChildPhoto) {
      // Upload photo for existing child
      try {
        await uploadChildPhoto(selectedChildId, memberChildPhoto);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload child photo.');
        return;
      }
    }

    // Create checkout session in DB to track the 5-minute payment countdown
    try {
      const sessionItems = pendingItems.map(item => ({
        type: item.type,
        label: item.type === 'booking' ? item.packageName : item.label,
        unitPrice: item.type === 'ticket' ? item.unitPrice : item.total,
      }));
      const session = await createCheckoutSession({
        items: sessionItems,
        subtotal,
        tax: taxAmount,
        total,
        guestEmail: !user ? guestEmail : undefined,
      });
      setCheckoutSessionId(session.sessionId);
    } catch (err) {
      // Non-blocking: session tracking is optional, don't block payment
      console.error('Failed to create checkout session:', err);
    }

    // Check if there are booking items that need slot reservation
    const bookingItems = pendingItems.filter(item => item.type === 'booking');

    if (bookingItems.length > 0) {
      // Reserve slots for booking items (5-minute timeout)
      setReservingSlot(true);
      try {
        // Bug fix #17: Reserve ALL booking slots (not just the first)
        const reservations: Array<{ reservationId: string; expiresAt: string }> = [];
        for (const booking of bookingItems) {
          if (booking.type !== 'booking') continue;
          const result = await reserveSlot(
            booking.eventDate,
            booking.startTime,
            booking.location
          );
          if (!result.success) {
            // Cancel already-made reservations on failure
            for (const res of reservations) {
              await cancelReservation(res.reservationId).catch(console.error);
            }
            setError('One or more time slots are no longer available. Please select different times.');
            return;
          }
          reservations.push(result);
        }
        // Store all reservation IDs for cleanup, use first for display
        setAllReservationIds(reservations.map(r => r.reservationId));
        setReservationId(reservations[0].reservationId);
        setReservationExpiresAt(reservations[0].expiresAt);
        setShowPayment(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to reserve slot';
        if (message.includes('no longer available') || message.includes('already reserved')) {
          setError('This time slot was just booked by someone else. Please select a different time.');
        } else {
          setError(message);
        }
      } finally {
        setReservingSlot(false);
      }
    } else {
      // No booking items — start a frontend-only 5-minute payment timer
      setReservationExpiresAt(new Date(Date.now() + 5 * 60 * 1000).toISOString());
      setShowPayment(true);
    }
  };

  const handleReservationExpire = useCallback(() => {
    setReservationExpired(true);
    setError('Your reservation has expired. Please try again.');
    // Don't auto-close payment form, let user see the message
  }, []);

  const handleBackFromPayment = useCallback(async () => {
    // Cancel all reservations (not just the first)
    for (const resId of allReservationIds) {
      try {
        await cancelReservation(resId);
      } catch (err) {
        console.error('Failed to cancel reservation:', err);
      }
    }
    // Cancel checkout session in DB
    if (checkoutSessionId) {
      cancelCheckoutSession(checkoutSessionId).catch(err =>
        console.error('Failed to cancel checkout session:', err)
      );
      setCheckoutSessionId(null);
    }
    setAllReservationIds([]);
    setReservationId(null);
    setReservationExpiresAt(null);
    setReservationExpired(false);
    setShowPayment(false);
  }, [allReservationIds, checkoutSessionId]);

  const handlePaymentSuccess = useCallback(async (sourceId: string) => {
    setProcessing(true);
    setError(null);

    // Snapshot pendingItems at invocation time to prevent stale closure
    // if the cart changes while the payment request is in-flight
    const itemsSnapshot = [...pendingItems];

    try {
      const checkoutItems = itemsSnapshot.map(item => {
        if (item.type === 'ticket') {
          return {
            type: 'ticket' as const,
            label: item.label,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice.toFixed(2)),
            eventId: item.eventId,
          };
        }
        if (item.type === 'membership') {
          const membershipPayload: Record<string, unknown> = {
            type: 'membership' as const,
            label: item.label,
            membershipId: item.membershipId,
            durationMonths: item.durationMonths,
            autoRenew: item.autoRenew,
            unitPrice: item.total,
            refundPolicyAccepted: refundPolicyAccepted,
            refundPolicyAcceptedAt: refundPolicyAcceptedAt ?? new Date().toISOString(),
            parentZipCode: memberParentZipCode.trim(),
            parentPhone: memberParentPhone.trim(),
            referralName: memberReferralAnswer === 'yes' && memberReferralName.trim() ? memberReferralName.trim() : undefined,
          };
          if (selectedChildId) {
            membershipPayload.childInfo = { childId: selectedChildId };
          } else if (memberChildFirstName.trim()) {
            membershipPayload.childInfo = {
              firstName: memberChildFirstName.trim(),
              lastName: memberChildLastName.trim(),
              birthDate: memberChildBirthDate,
            };
          }
          return membershipPayload;
        }
        if (item.type === 'booking') {
          // Build addOns array, ensuring extra_adult is included if present
          const addOns = [...(item.addOns ?? [])];
          if ((item.extraAdultCount ?? 0) > 0) {
            // Add extra_adult to addOns if not already present
            const hasExtraAdult = addOns.some(a => a.id === 'extra_adult');
            if (!hasExtraAdult) {
              addOns.push({ id: 'extra_adult', quantity: item.extraAdultCount! });
            }
          }
          return {
            type: 'booking' as const,
            label: item.packageName,
            packageId: item.packageId,
            unitPrice: item.total,
            location: item.location,
            eventDate: item.eventDate,
            startTime: item.startTime,
            guestCount: item.guestCount,
            childIds: item.childIds,
            notes: item.notes,
            addOns: addOns.length > 0 ? addOns : undefined,
            guestInfo: item.guestInfo,
          };
        }
        return null;
      }).filter(Boolean) as any[];

      let result: SquareCheckoutFinalizeResponse;
      if (user) {
        result = await finalizeSquareCheckout({
          items: checkoutItems,
          sourceId,
          reservationId: reservationId ?? undefined,
          checkoutSessionId: checkoutSessionId ?? undefined,
          promoCode: appliedCoupon?.code,
        });
      } else {
        result = await finalizeSquareGuestCheckout({
          items: checkoutItems,
          sourceId,
          guestFirstName: guestFirstName.trim(),
          guestLastName: guestLastName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim(),
          reservationId: reservationId ?? undefined,
          checkoutSessionId: checkoutSessionId ?? undefined,
          promoCode: appliedCoupon?.code,
        });
      }

      // Store completed order details for display
      const orderDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York',
      });

      // Compute amounts from snapshot to avoid stale closure values
      // (pendingItems-derived subtotal/taxAmount/total may already reflect post-payment state)
      const snapshotSubtotal = itemsSnapshot.reduce((sum, item) => {
        if (item.type === 'booking') {
          return sum + ((item as any).subtotal ?? 0) + ((item as any).cleaningFee ?? 0);
        }
        return sum + item.total;
      }, 0);
      const snapshotTax = itemsSnapshot.reduce((sum, item) => {
        if (item.type === 'booking') {
          return sum + ((item as any).tax ?? 0);
        }
        const totalCents = Math.round(item.total * 100);
        const taxCents = Math.round(totalCents * TAX_RATE);
        return sum + taxCents / 100;
      }, 0);
      const snapshotTotal = Number((snapshotSubtotal + snapshotTax).toFixed(2));

      // Set completed order with items snapshot and snapshot-derived amounts
      setCompletedOrder({
        paymentId: result.paymentId,
        items: itemsSnapshot,
        subtotal: snapshotSubtotal,
        tax: snapshotTax,
        total: snapshotTotal,
        date: orderDate,
        receipts: [],
      });

      // Set success state FIRST to prevent empty cart flash
      setSuccess('Payment successful! Your order has been confirmed. A receipt has been sent to your email and mobile number (if provided).');
      setShowPayment(false);

      // Then update item statuses using the snapshot (cartIndex corresponds to snapshot positions)
      result.tickets.forEach(ticket => {
        const originalItem = itemsSnapshot[ticket.cartIndex];
        if (originalItem?.type === 'ticket') {
          markTicketFulfilled(originalItem.id, {
            ticketId: ticket.ticket.id,
            codes: ticket.ticket.codes.map(c => c.code),
          });
        }
      });

      result.memberships.forEach(membership => {
        const originalItem = itemsSnapshot[membership.cartIndex];
        if (originalItem?.type === 'membership') {
          markMembershipActivated(originalItem.id, membership.membership.startedAt);
        }
      });

      // Mark bookings as paid with their new bookingId and reference
      if (result.bookings) {
        result.bookings.forEach((booking: { cartIndex: number; bookingId: string; reference: string }) => {
          const originalItem = itemsSnapshot[booking.cartIndex];
          if (originalItem?.type === 'booking') {
            markBookingPaid(originalItem.id, booking.bookingId, booking.reference);
          }
        });
      }

      // Clear guest form fields to prevent stale data on subsequent purchases
      setGuestFirstName('');
      setGuestLastName('');
      setGuestEmail('');
      setGuestPhone('');

      if (user) {
        await refreshProfile().catch(console.error);
      }

      // Redirect to account page after membership purchase so user can see their membership
      const hasMembership = itemsSnapshot.some(item => item.type === 'membership');
      if (hasMembership && user) {
        setTimeout(() => {
          if (mountedRef.current) {
            navigate('/account');
          }
        }, 3000);
      }

      // Fetch receipts after a short delay (receipts are generated async on backend)
      setLoadingReceipts(true);
      receiptTimerRef.current = setTimeout(async () => {
        try {
          const receiptsResponse = await getReceiptsByPaymentId(result.paymentId);
          if (mountedRef.current) {
            setCompletedOrder(prev => prev ? { ...prev, receipts: receiptsResponse.receipts } : null);
          }
        } catch (receiptErr) {
          console.error('Failed to fetch receipts:', receiptErr);
        } finally {
          if (mountedRef.current) {
            setLoadingReceipts(false);
          }
        }
      }, 2000);

      clearCartTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          clear();
        }
      }, 30000); // Extended timeout to allow user to download receipts

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [pendingItems, TAX_RATE, user, guestFirstName, guestLastName, guestEmail, guestPhone, reservationId, refundPolicyAccepted, refundPolicyAcceptedAt, markTicketFulfilled, markMembershipActivated, markBookingPaid, refreshProfile, clear, selectedChildId, memberParentZipCode, memberReferralAnswer, memberReferralName, memberChildFirstName, memberChildLastName, memberChildBirthDate, checkoutSessionId, navigate]);

  const renderItemDetails = (item: CheckoutItem) => {
    switch (item.type) {
      case 'ticket':
        return (
          <>
            <span className={styles.itemLabel}>{item.label}</span>
            <div className={styles.quantityControls}>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={() => handleTicketDecrement(item.id, item.quantity)}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className={styles.qtyDisplay}>{item.quantity}</span>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={() => handleTicketIncrement(item.id, item.quantity)}
                disabled={item.quantity >= 10}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </>
        );
      case 'membership':
        return (
          <>
            <span className={styles.itemLabel}>{item.label}</span>
            <span className={styles.itemMeta}>{item.durationMonths} month{item.durationMonths > 1 ? 's' : ''}</span>
          </>
        );
      case 'booking':
        return (
          <>
            <span className={styles.itemLabel}>{item.packageName}</span>
            <span className={styles.itemMeta}>
              {item.eventDate} at {formatTime(item.startTime)} • {item.location}
              {item.durationMinutes && ` • ${item.durationMinutes} min`}
            </span>
            <span className={styles.itemMeta}>{item.guestCount} guest{item.guestCount !== 1 ? 's' : ''}</span>
            {/* Price breakdown */}
            <div className={styles.bookingBreakdown}>
              {item.basePrice && (
                <div className={styles.breakdownLine}>
                  <span>Base package</span>
                  <span>${item.basePrice.toFixed(2)}</span>
                </div>
              )}
              {(item.extraAdultCount ?? 0) > 0 && (
                <div className={styles.breakdownLine}>
                  <span>Extra adults ({item.extraAdultCount} × ${item.extraAdultFee?.toFixed(2)})</span>
                  <span>${item.extraAdultTotal?.toFixed(2)}</span>
                </div>
              )}
              {item.addOnDetails?.map(addon => (
                <div key={addon.id} className={styles.breakdownLine}>
                  <span>{addon.name}{addon.quantity > 1 ? ` (×${addon.quantity})` : ''}</span>
                  <span>${(addon.price * addon.quantity).toFixed(2)}</span>
                </div>
              ))}
              {item.cleaningFee && (
                <div className={styles.breakdownLine}>
                  <span>Cleaning fee</span>
                  <span>${item.cleaningFee.toFixed(2)}</span>
                </div>
              )}
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const getItemPrice = (item: CheckoutItem) => {
    return item.total;
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'ticket': return '🎟️';
      case 'membership': return '⭐';
      case 'booking': return '🎉';
      default: return '📦';
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Your Cart</h1>

        {success ? (
          <div className={styles.successState}>
            <div className={styles.successIcon}>✓</div>
            <h2>Order Confirmed!</h2>
            <p>{success}</p>

            {/* Order Details */}
            {completedOrder && (
              <div className={styles.orderDetails}>
                <div className={styles.orderHeader}>
                  <span className={styles.orderDate}>{completedOrder.date}</span>
                </div>

                {/* Items List */}
                <div className={styles.orderItems}>
                  {completedOrder.items.map((item, index) => (
                    <div key={index} className={styles.orderItem}>
                      <span className={styles.orderItemIcon}>{getItemIcon(item.type)}</span>
                      <div className={styles.orderItemInfo}>
                        <span className={styles.orderItemName}>
                          {item.type === 'booking' ? item.packageName : item.label}
                        </span>
                        {item.type === 'ticket' && (
                          <span className={styles.orderItemMeta}>Qty: {item.quantity}</span>
                        )}
                        {item.type === 'booking' && (
                          <span className={styles.orderItemMeta}>
                            {item.eventDate} at {formatTime(item.startTime)} • {item.location}
                          </span>
                        )}
                        {item.type === 'membership' && (
                          <span className={styles.orderItemMeta}>{item.durationMonths} month{item.durationMonths > 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <span className={styles.orderItemPrice}>${item.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Order Summary */}
                <div className={styles.orderSummary}>
                  <div className={styles.orderSummaryRow}>
                    <span>Subtotal</span>
                    <span>${completedOrder.subtotal.toFixed(2)}</span>
                  </div>
                  <div className={styles.orderSummaryRow}>
                    <span>Tax</span>
                    <span>${completedOrder.tax.toFixed(2)}</span>
                  </div>
                  <div className={styles.orderSummaryTotal}>
                    <span>Total Paid</span>
                    <span>${completedOrder.total.toFixed(2)}</span>
                  </div>
                </div>

              </div>
            )}

            {/* Download Receipt Button */}
            <div className={styles.actionButtons}>
              {loadingReceipts ? (
                <button className={styles.downloadReceiptBtn} disabled>
                  Loading Receipt...
                </button>
              ) : completedOrder && completedOrder.receipts.length > 0 ? (
                completedOrder.receipts.map((receipt, index) => (
                  <a
                    key={index}
                    href={getReceiptPdfUrl(receipt.receiptNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.downloadReceiptBtn}
                  >
                    📄 Download Receipt (PDF)
                  </a>
                ))
              ) : (
                <button className={styles.downloadReceiptBtn} disabled>
                  Receipt sent to email
                </button>
              )}
              <Link to="/" className={styles.shopLink}>Back to Home</Link>
            </div>
          </div>
        ) : pendingItems.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🛒</div>
            <h2>Your cart is empty</h2>
            <p>Add tickets, memberships, or book a party to get started!</p>
            <Link to="/" className={styles.shopLink}>Continue Shopping</Link>
          </div>
        ) : (
          <div className={styles.layout}>
            {/* Cart Items */}
            <div className={styles.itemsSection}>
              <h2 className={styles.sectionTitle}>Items ({pendingItems.length})</h2>
              <div className={styles.itemsList}>
                {pendingItems.map(item => (
                  <div key={item.id} className={styles.cartItem}>
                    <div className={styles.itemIcon}>{getItemIcon(item.type)}</div>
                    <div className={styles.itemInfo}>
                      {renderItemDetails(item)}
                    </div>
                    <div className={styles.itemPrice}>${getItemPrice(item).toFixed(2)}</div>
                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemoveItem(item.id)}
                      aria-label="Remove item"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Checkout Section */}
            <div className={styles.checkoutSection}>
              <h2 className={styles.sectionTitle}>Order Summary</h2>

              {/* Membership: Login required - block everything until signed in */}
              {hasMembershipItems && !user && !showPayment && (
                <div className={styles.membershipLoginNotice}>
                  <h3>Sign In Required</h3>
                  <p>You must sign in or create an account to purchase a membership. This allows you to manage your membership, track visits, and check in at the venue.</p>
                  <Link to="/account?redirect=/cart" className={styles.loginBtn}>
                    Sign In / Create Account
                  </Link>
                </div>
              )}

              {/* Guest Info Form - only for non-membership carts */}
              {!user && !hasMembershipItems && !showPayment && (
                <div className={styles.guestForm}>
                  <h3>Contact Information</h3>
                  <div className={styles.formRow}>
                    <input
                      type="text"
                      placeholder="First name"
                      value={guestFirstName}
                      onChange={(e) => setGuestFirstName(formatNameInput(e.target.value))}
                      className={styles.input}
                      required
                      maxLength={100}
                      pattern="[A-Za-zÀ-ÿ\s'\-]+"
                      title="Letters, spaces, hyphens, and apostrophes only"
                      autoComplete="given-name"
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={guestLastName}
                      onChange={(e) => setGuestLastName(formatNameInput(e.target.value))}
                      className={styles.input}
                      required
                      maxLength={100}
                      pattern="[A-Za-zÀ-ÿ\s'\-]+"
                      title="Letters, spaces, hyphens, and apostrophes only"
                      autoComplete="family-name"
                    />
                  </div>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value.trim())}
                    className={styles.input}
                    required
                    maxLength={255}
                    autoComplete="email"
                  />
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="Phone (10 digits)"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(formatPhoneInput(e.target.value))}
                    className={styles.input}
                    required
                    maxLength={10}
                    pattern="\d{10}"
                    title="10-digit phone number"
                    autoComplete="tel"
                  />
                  <label className={styles.smsConsent}>
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={(e) => setSmsConsent(e.target.checked)}
                    />
                    <span className={styles.smsConsentText}>
                      By providing your phone number and checking this box, you consent to receive transactional text messages from Playfunia (e.g., booking confirmations, ticket codes, membership alerts, and reminders). Consent is not a condition of purchase. Msg &amp; data rates may apply. Msg frequency varies. Reply STOP to unsubscribe at any time. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> &amp; <a href="/waiver-policy" target="_blank" rel="noopener noreferrer">Terms</a>.
                    </span>
                  </label>
                </div>
              )}

              {/* Membership Details Form (logged-in users) */}
              {hasMembershipItems && user && !showPayment && (
                <div className={styles.membershipDetailsForm}>
                  <h3>Membership Details</h3>

                  {/* Parent info section */}
                  <h4 className={styles.membershipSubheading}>Parent / Account Holder</h4>

                  <div className={styles.membershipParentInfo}>
                    <div className={styles.profileInfoRow}>
                      <span>Name:</span>
                      <strong>{user.firstName} {user.lastName}</strong>
                    </div>
                    <div className={styles.profileInfoRow}>
                      <span>Email:</span>
                      <strong>{user.email}</strong>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <label className={styles.fieldLabel}>
                      Phone <span className={!memberParentPhone.trim() || !isValidPhone(memberParentPhone) ? styles.missingField : ''}>*</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="Phone (10 digits)"
                        value={memberParentPhone}
                        onChange={(e) => setMemberParentPhone(formatPhoneInput(e.target.value))}
                        className={!memberParentPhone.trim() || !isValidPhone(memberParentPhone) ? `${styles.input} ${styles.inputMissing}` : styles.input}
                        required
                        maxLength={10}
                        autoComplete="tel"
                      />
                    </label>
                    <label className={styles.fieldLabel}>
                      ZIP Code <span className={!memberParentZipCode.trim() ? styles.missingField : ''}>*</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="ZIP Code"
                        value={memberParentZipCode}
                        onChange={(e) => setMemberParentZipCode(e.target.value.replace(/[^\d-]/g, '').slice(0, 10))}
                        className={!memberParentZipCode.trim() ? `${styles.input} ${styles.inputMissing}` : styles.input}
                        required
                        maxLength={10}
                      />
                    </label>
                  </div>
                  <label className={styles.smsConsent}>
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={(e) => setSmsConsent(e.target.checked)}
                    />
                    <span className={styles.smsConsentText}>
                      By providing your phone number and checking this box, you consent to receive transactional text messages from Playfunia (e.g., membership alerts, reminders, and updates). Consent is not a condition of purchase. Msg &amp; data rates may apply. Msg frequency varies. Reply STOP to unsubscribe at any time. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> &amp; <a href="/waiver-policy" target="_blank" rel="noopener noreferrer">Terms</a>.
                    </span>
                  </label>

                  {/* Child selection or new child */}
                  <h4 className={styles.membershipSubheading}>Child Information</h4>

                  {user.children && user.children.length > 0 && (
                    <div className={styles.childSelectSection}>
                      <label className={styles.fieldLabel}>
                        Select existing child
                        <select
                          value={selectedChildId ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            // Clear photo state when switching children to prevent stale preview
                            setMemberChildPhoto(null);
                            setMemberChildPhotoPreview(null);
                            if (val) {
                              setSelectedChildId(Number(val));
                              const child = user.children?.find(c => c.id === Number(val));
                              if (child) {
                                setMemberChildFirstName(child.firstName);
                                setMemberChildLastName(child.lastName ?? '');
                                setMemberChildBirthDate(child.birthDate ?? '');
                              }
                            } else {
                              setSelectedChildId(null);
                              setMemberChildFirstName('');
                              setMemberChildLastName('');
                              setMemberChildBirthDate('');
                            }
                          }}
                          className={styles.input}
                        >
                          <option value="">-- Add new child --</option>
                          {user.children.map(child => (
                            <option key={child.id} value={child.id}>
                              {child.firstName} {child.lastName}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {!selectedChildId && (
                    <div className={styles.childInfoFields}>
                      <div className={styles.formRow}>
                        <label className={styles.fieldLabel}>
                          Child First Name <span className={!memberChildFirstName.trim() ? styles.missingField : ''}>*</span>
                          <input
                            type="text"
                            placeholder="First name"
                            value={memberChildFirstName}
                            onChange={(e) => setMemberChildFirstName(formatNameInput(e.target.value))}
                            className={!memberChildFirstName.trim() ? `${styles.input} ${styles.inputMissing}` : styles.input}
                            required
                            maxLength={100}
                          />
                        </label>
                        <label className={styles.fieldLabel}>
                          Child Last Name <span className={!memberChildLastName.trim() ? styles.missingField : ''}>*</span>
                          <input
                            type="text"
                            placeholder="Last name"
                            value={memberChildLastName}
                            onChange={(e) => setMemberChildLastName(formatNameInput(e.target.value))}
                            className={!memberChildLastName.trim() ? `${styles.input} ${styles.inputMissing}` : styles.input}
                            required
                            maxLength={100}
                          />
                        </label>
                      </div>
                      <label className={styles.fieldLabel}>
                        Date of Birth <span className={!memberChildBirthDate ? styles.missingField : ''}>*</span>
                        <input
                          type="date"
                          value={memberChildBirthDate}
                          onChange={(e) => setMemberChildBirthDate(e.target.value)}
                          className={!memberChildBirthDate ? `${styles.input} ${styles.inputMissing}` : styles.input}
                          required
                          max={new Date().toISOString().split('T')[0]}
                        />
                      </label>
                    </div>
                  )}

                  {/* Child Photo Upload */}
                  <label className={styles.fieldLabel}>
                    Child Photo <span className={!memberChildPhoto && !selectedChildHasPhoto() ? styles.missingField : ''}>*</span> <span className={styles.fieldHint}>(Required for check-in verification)</span>
                    <div className={styles.photoUploadArea}>
                      {memberChildPhotoPreview ? (
                        <div className={styles.photoPreview}>
                          <img src={memberChildPhotoPreview} alt="Child" />
                          <button
                            type="button"
                            className={styles.removePhotoBtn}
                            onClick={() => {
                              setMemberChildPhoto(null);
                              setMemberChildPhotoPreview(null);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : selectedChildHasPhoto() ? (
                        <div className={styles.photoPreview}>
                          <img src={user?.children?.find(c => c.id === selectedChildId)?.photoUrl ?? ''} alt="Child" />
                          <span className={styles.fieldHint}>Photo on file. Upload a new one to replace it.</span>
                          <div className={styles.photoDropzone}>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 10 * 1024 * 1024) {
                                    setError('Photo must be under 10MB.');
                                    return;
                                  }
                                  setMemberChildPhoto(file);
                                  setMemberChildPhotoPreview(URL.createObjectURL(file));
                                  setError(null);
                                }
                              }}
                              className={styles.photoInput}
                            />
                            <span>Upload new photo (optional)</span>
                          </div>
                        </div>
                      ) : (
                        <div className={!memberChildPhoto && !selectedChildHasPhoto() ? `${styles.photoDropzone} ${styles.photoDropzoneMissing}` : styles.photoDropzone}>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 10 * 1024 * 1024) {
                                  setError('Photo must be under 10MB.');
                                  return;
                                }
                                setMemberChildPhoto(file);
                                setMemberChildPhotoPreview(URL.createObjectURL(file));
                                setError(null);
                              }
                            }}
                            className={styles.photoInput}
                          />
                          <span>Click to upload photo (JPG, PNG)</span>
                        </div>
                      )}
                    </div>
                  </label>

                  {/* Referral Section */}
                  <h4 className={styles.membershipSubheading}>Referral</h4>
                  <div className={styles.referralSection}>
                    <p className={styles.referralQuestion}>Were you referred by a team member?</p>
                    <div className={styles.referralOptions}>
                      <label className={styles.referralOption}>
                        <input
                          type="radio"
                          name="referral"
                          value="yes"
                          checked={memberReferralAnswer === 'yes'}
                          onChange={() => setMemberReferralAnswer('yes')}
                        />
                        Yes
                      </label>
                      <label className={styles.referralOption}>
                        <input
                          type="radio"
                          name="referral"
                          value="no"
                          checked={memberReferralAnswer === 'no'}
                          onChange={() => { setMemberReferralAnswer('no'); setMemberReferralName(''); }}
                        />
                        No
                      </label>
                    </div>
                    {memberReferralAnswer === 'yes' && (
                      <label className={styles.fieldLabel}>
                        Enter staff name
                        <input
                          type="text"
                          placeholder="Staff member name"
                          value={memberReferralName}
                          onChange={(e) => setMemberReferralName(e.target.value)}
                          className={styles.input}
                          maxLength={100}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Hide summary/payment when membership requires login */}
              {!(hasMembershipItems && !user) && (
                <>
                  {/* Summary */}
                  <div className={styles.summary}>
                    {/* Per-item breakdown */}
                    {pendingItems.map(item => (
                      <div key={item.id} className={styles.summaryItemGroup}>
                        {item.type === 'booking' && (
                          <>
                            <div className={styles.summaryItemHeader}>
                              <span className={styles.summaryItemName}>{item.packageName}</span>
                            </div>
                            {item.basePrice && (
                              <div className={styles.summaryDetailRow}>
                                <span>Base package</span>
                                <span>${item.basePrice.toFixed(2)}</span>
                              </div>
                            )}
                            {(item.extraAdultCount ?? 0) > 0 && (
                              <div className={styles.summaryDetailRow}>
                                <span>Extra adults ({item.extraAdultCount})</span>
                                <span>${item.extraAdultTotal?.toFixed(2)}</span>
                              </div>
                            )}
                            {item.addOnDetails?.map(addon => (
                              <div key={addon.id} className={styles.summaryDetailRow}>
                                <span>{addon.name}</span>
                                <span>${(addon.price * addon.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                            {item.cleaningFee && (
                              <div className={styles.summaryDetailRow}>
                                <span>Cleaning Fee</span>
                                <span>${item.cleaningFee.toFixed(2)}</span>
                              </div>
                            )}
                          </>
                        )}
                        {item.type === 'ticket' && (
                          <div className={styles.summaryDetailRow}>
                            <span>{item.label} (×{item.quantity})</span>
                            <span>${item.total.toFixed(2)}</span>
                          </div>
                        )}
                        {item.type === 'membership' && (
                          <div className={styles.summaryDetailRow}>
                            <span>{item.label} ({item.durationMonths} mo)</span>
                            <span>${item.total.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className={styles.summaryDivider} />
                    <div className={styles.summaryRow}>
                      <span>Subtotal</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>

                    {/* Coupon code — applies to memberships, tickets, bookings or all */}
                    {!showPayment && pendingItems.length > 0 && (
                      <div className={styles.couponSection}>
                        {!appliedCoupon && (
                          <>
                            <label className={styles.couponToggle} style={{ cursor: 'default' }}>
                              🎟 Have a coupon code?
                            </label>
                            <div className={styles.couponInputRow}>
                              <input
                                type="text"
                                className={styles.couponInput}
                                placeholder="e.g. SUMMER10"
                                value={couponInput}
                                onChange={e => setCouponInput(e.target.value.toUpperCase())}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleApplyCoupon();
                                  }
                                }}
                                disabled={couponBusy}
                                maxLength={40}
                              />
                              <button
                                type="button"
                                className={styles.couponApplyBtn}
                                onClick={handleApplyCoupon}
                                disabled={couponBusy || !couponInput.trim()}
                              >
                                {couponBusy ? 'Checking...' : 'Apply'}
                              </button>
                            </div>
                            {couponError && <div className={styles.couponError}>{couponError}</div>}
                          </>
                        )}

                        {appliedCoupon && (
                          <div className={styles.couponApplied}>
                            <span>✓ {appliedCoupon.label} applied</span>
                            <button
                              type="button"
                              className={styles.couponRemoveBtn}
                              onClick={handleRemoveCoupon}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {appliedCoupon && couponDiscount > 0 && (
                      <div className={styles.summaryDiscountRow}>
                        <span>Coupon ({appliedCoupon.code})</span>
                        <span>-${couponDiscount.toFixed(2)}</span>
                      </div>
                    )}

                    <div className={styles.summaryRow}>
                      <span>Tax{TAX_RATE > 0 ? ` (${Math.round(TAX_RATE * 100)}%)` : ''}</span>
                      <span>${taxAmount.toFixed(2)}</span>
                    </div>
                    <div className={styles.summaryTotal}>
                      <span>Total</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Membership Refund Policy Acceptance */}
                  {hasMembershipItems && !showPayment && (
                    <div className={styles.refundPolicySection}>
                      <label className={styles.refundPolicyCheckbox}>
                        <input
                          type="checkbox"
                          checked={refundPolicyAccepted}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setRefundPolicyAccepted(checked);
                            setRefundPolicyAcceptedAt(checked ? new Date().toISOString() : null);
                          }}
                        />
                        <span>
                          I have read and agree to the{' '}
                          <button
                            type="button"
                            className={styles.refundPolicyLink}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowRefundPolicy(prev => !prev);
                            }}
                          >
                            Membership Refund Policy
                          </button>
                        </span>
                      </label>
                      {showRefundPolicy && (
                        <div className={styles.refundPolicyOverlay} onClick={() => setShowRefundPolicy(false)}>
                          <div className={styles.refundPolicyModal} onClick={(e) => e.stopPropagation()}>
                            <h4>Membership Refund Policy</h4>
                            <p className={styles.refundPolicyIntro}>
                              All membership purchases are final. By purchasing a membership, you agree to the following terms:
                            </p>
                            <ul>
                              {MEMBERSHIP_REFUND_POLICY_ITEMS.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                            <button
                              type="button"
                              className={styles.refundPolicyOkButton}
                              onClick={() => setShowRefundPolicy(false)}
                            >
                              OK
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Messages */}
                  {error && <div className={styles.error}>{error}</div>}
                  {squareConfigError && <div className={styles.error}>{squareConfigError}</div>}

                  {/* Payment Section */}
                  {showPayment && squareConfig?.available ? (
                    <div className={styles.paymentSection}>
                      <h3>Payment</h3>

                      {/* Countdown Timer for Slot Reservation */}
                      {reservationExpiresAt && (
                        <div className={styles.reservationTimer}>
                          <CountdownTimer
                            expiresAt={reservationExpiresAt}
                            onExpire={handleReservationExpire}
                          />
                          <span className={styles.reservationNote}>
                            Complete your payment to secure your purchase
                          </span>
                        </div>
                      )}

                      {/* Reservation Expired Warning */}
                      {reservationExpired && (
                        <div className={styles.reservationExpired}>
                          Your reservation has expired. Please go back and try again.
                        </div>
                      )}

                      <SquarePaymentForm
                        amount={total}
                        currency="USD"
                        description={`${pendingItems.length} item${pendingItems.length > 1 ? 's' : ''}`}
                        submitLabel={processing ? 'Processing...' : 'Pay Now'}
                        processingLabel="Processing..."
                        disabled={reservationExpired}
                        billingContact={
                          user
                            ? {
                                givenName: user.firstName,
                                familyName: user.lastName,
                                email: user.email,
                                phone: user.phone,
                                countryCode: 'US',
                              }
                            : {
                                givenName: guestFirstName.trim(),
                                familyName: guestLastName.trim(),
                                email: guestEmail.trim(),
                                phone: guestPhone.trim(),
                                countryCode: 'US',
                              }
                        }
                        onSuccess={handlePaymentSuccess}
                      />
                      <button
                        className={styles.backBtn}
                        onClick={handleBackFromPayment}
                        disabled={processing}
                      >
                        ← Back
                      </button>
                    </div>
                  ) : (
                    <button
                      className={styles.checkoutBtn}
                      onClick={handleProceedToPayment}
                      disabled={pendingItems.length === 0 || reservingSlot || !!squareConfigError || (hasMembershipItems && !refundPolicyAccepted) || (hasMembershipItems && !isMembershipInfoComplete())}
                    >
                      {reservingSlot ? 'Reserving slot...' : 'Proceed to Payment'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
