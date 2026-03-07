import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';

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
import { formatTime } from '../lib/dateUtils';
import {
  formatNameInput,
  formatPhoneInput,
  isValidName,
  isValidPhone,
  isValidEmail,
} from '../utils/validation';
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

  // Guest checkout form state
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

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

  // Slot reservation state (5-minute countdown)
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [allReservationIds, setAllReservationIds] = useState<string[]>([]);
  const [reservationExpiresAt, setReservationExpiresAt] = useState<string | null>(null);
  const [reservationExpired, setReservationExpired] = useState(false);
  const [reservingSlot, setReservingSlot] = useState(false);

  // Filter to pending items only
  const pendingItems = items.filter(item => {
    if (item.type === 'ticket') return item.status === 'pending';
    if (item.type === 'membership') return item.status === 'pending';
    if (item.type === 'booking') return item.status === 'pending';
    return false;
  });

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

  // Get tax from booking items (from API), calculate for others
  // Use cents-based math to avoid floating-point rounding errors
  const taxAmount = pendingItems.reduce((sum, item) => {
    if (item.type === 'booking') {
      return sum + (item.tax ?? 0);
    }
    const totalCents = Math.round(item.total * 100);
    const taxCents = Math.round(totalCents * TAX_RATE);
    return sum + taxCents / 100;
  }, 0);

  const total = Number((subtotal + taxAmount).toFixed(2));

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

  const handleProceedToPayment = async () => {
    if (!user && !validateGuestInfo()) {
      return;
    }
    setError(null);
    setReservationExpired(false);

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
    setAllReservationIds([]);
    setReservationId(null);
    setReservationExpiresAt(null);
    setReservationExpired(false);
    setShowPayment(false);
  }, [allReservationIds]);

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
          return {
            type: 'membership' as const,
            label: item.label,
            membershipId: item.membershipId,
            durationMonths: item.durationMonths,
            autoRenew: item.autoRenew,
            unitPrice: item.total,
          };
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
          reservationId: reservationId ?? undefined, // Pass existing reservation to avoid double-reservation
        });
      } else {
        result = await finalizeSquareGuestCheckout({
          items: checkoutItems,
          sourceId,
          guestFirstName: guestFirstName.trim(),
          guestLastName: guestLastName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim(),
          reservationId: reservationId ?? undefined, // Pass existing reservation to avoid double-reservation
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
  }, [pendingItems, TAX_RATE, user, guestFirstName, guestLastName, guestEmail, guestPhone, reservationId, markTicketFulfilled, markMembershipActivated, markBookingPaid, refreshProfile, clear]);

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

              {/* Guest Info Form */}
              {!user && !showPayment && (
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
                </div>
              )}

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
                <div className={styles.summaryRow}>
                  <span>Tax{TAX_RATE > 0 ? ` (${Math.round(TAX_RATE * 100)}%)` : ''}</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                <div className={styles.summaryTotal}>
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

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
                  disabled={pendingItems.length === 0 || reservingSlot || !!squareConfigError}
                >
                  {reservingSlot ? 'Reserving slot...' : 'Proceed to Payment'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
