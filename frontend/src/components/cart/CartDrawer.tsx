import { useEffect, useState, useCallback, useRef } from 'react';

import { useCheckout, CheckoutItem } from '../../context/CheckoutContext';
import { useAuth } from '../../context/AuthContext';
import { SquarePaymentForm } from '../checkout/SquarePaymentForm';
import { CountdownTimer } from '../checkout/CountdownTimer';
import {
  getSquareConfig,
  finalizeSquareCheckout,
  finalizeSquareGuestCheckout,
  SquareConfig,
} from '../../api/square';
import { reserveSlot, cancelReservation } from '../../api/reservations';
import { getAllPricing, type AllPricing } from '../../api/pricing';
import {
  formatNameInput,
  formatPhoneInput,
  isValidName,
  isValidPhone,
  isValidEmail,
} from '../../utils/validation';
import styles from './CartDrawer.module.css';

// Default tax rate (fallback before API loads)
const DEFAULT_TAX_RATE = 0.08;

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeItem, updateTicketQuantity, markTicketFulfilled, markMembershipActivated, markBookingPaid, clear } = useCheckout();
  const { user, refreshProfile } = useAuth();

  const [squareConfig, setSquareConfig] = useState<SquareConfig | null>(null);
  const [pricingData, setPricingData] = useState<AllPricing | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Slot reservation state
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [allReservationIds, setAllReservationIds] = useState<string[]>([]);
  const [reservationExpiresAt, setReservationExpiresAt] = useState<string | null>(null);
  const [reservationExpired, setReservationExpired] = useState(false);
  const [reservingSlot, setReservingSlot] = useState(false);
  const [squareConfigError, setSquareConfigError] = useState(false);

  // Bug fix #14: Ref for success timer cleanup on unmount
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guest checkout form state
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // Pre-fill guest info from booking item (if guest booked a party)
  useEffect(() => {
    if (user) return; // Skip for logged-in users
    const bookingWithGuestInfo = items.find(
      item => item.type === 'booking' && item.guestInfo
    );
    if (bookingWithGuestInfo?.type === 'booking' && bookingWithGuestInfo.guestInfo) {
      const info = bookingWithGuestInfo.guestInfo;
      setGuestFirstName(prev => prev || info.firstName || '');
      setGuestLastName(prev => prev || info.lastName || '');
      setGuestEmail(prev => prev || info.email || '');
      setGuestPhone(prev => prev || info.phone || '');
    }
  }, [items, user]);

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

  // Load Square config and pricing data (only retry once on failure to prevent infinite loop)
  useEffect(() => {
    if (isOpen && !squareConfig && !squareConfigError) {
      getSquareConfig()
        .then(setSquareConfig)
        .catch(err => {
          console.error('Failed to load Square config:', err);
          setSquareConfigError(true);
        });
    }
    if (isOpen && !pricingData) {
      getAllPricing()
        .then(setPricingData)
        .catch(err => console.error('Failed to load pricing config:', err));
    }
  }, [isOpen, squareConfig, pricingData, squareConfigError]);

  // Bug fix #14: Cleanup success timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Cancel all reservations when drawer closes
  useEffect(() => {
    if (!isOpen && allReservationIds.length > 0) {
      allReservationIds.forEach(resId => cancelReservation(resId).catch(() => {}));
      setAllReservationIds([]);
      setReservationId(null);
      setReservationExpiresAt(null);
      setReservationExpired(false);
      setShowPayment(false);
    } else if (!isOpen) {
      setReservationExpiresAt(null);
      setReservationExpired(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

    // Check for booking items that need slot reservation
    const bookingItems = pendingItems.filter(item => item.type === 'booking');
    if (bookingItems.length > 0) {
      setReservingSlot(true);
      try {
        // Bug fix #17: Reserve ALL booking slots (not just the first)
        const reservations: Array<{ reservationId: string; expiresAt: string }> = [];
        for (const booking of bookingItems) {
          if (booking.type !== 'booking') continue;
          const result = await reserveSlot(booking.eventDate, booking.startTime, booking.location);
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
  }, []);

  const handlePaymentSuccess = useCallback(async (sourceId: string) => {
    setProcessing(true);
    setError(null);

    // Snapshot pendingItems at invocation time to prevent stale closure
    // if the cart changes while the payment request is in-flight
    const itemsSnapshot = [...pendingItems];

    try {
      // Build items payload for Square checkout
      const checkoutItems = itemsSnapshot.map(item => {
        if (item.type === 'ticket') {
          return {
            type: 'ticket' as const,
            label: item.label,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
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
        // For bookings, send as proper booking type with package details
        if (item.type === 'booking') {
          // Build addOns array, ensuring extra_adult is included if present
          const addOns = [...(item.addOns ?? [])];
          if ((item.extraAdultCount ?? 0) > 0) {
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

      let result;
      if (user) {
        result = await finalizeSquareCheckout({
          items: checkoutItems,
          sourceId,
          reservationId: reservationId ?? undefined,
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
        });
      }

      // Update cart items with fulfillment info using the snapshot (cartIndex corresponds to snapshot positions)
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

      // Refresh user profile if authenticated
      if (user) {
        await refreshProfile().catch(console.error);
      }

      setSuccess('Payment successful! Your order has been confirmed. A receipt has been sent to your email and mobile number (if provided).');
      setShowPayment(false);

      // Close drawer after short delay (store ref for cleanup)
      successTimerRef.current = setTimeout(() => {
        clear();
        onClose();
        setSuccess(null);
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [pendingItems, user, guestFirstName, guestLastName, guestEmail, guestPhone, reservationId, markTicketFulfilled, markMembershipActivated, markBookingPaid, refreshProfile, clear, onClose]);

  
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
            <span className={styles.itemQty}>{item.durationMonths} month{item.durationMonths > 1 ? 's' : ''}</span>
          </>
        );
      case 'booking':
        return (
          <>
            <span className={styles.itemLabel}>{item.packageName}</span>
            <span className={styles.itemNote}>
              {item.eventDate} at {item.startTime}
              {item.durationMinutes && ` • ${item.durationMinutes} min`}
            </span>
            <span className={styles.itemNote}>{item.guestCount} guest{item.guestCount !== 1 ? 's' : ''} • {item.location}</span>
            {/* Brief breakdown */}
            {item.basePrice && (
              <div className={styles.bookingBreakdown}>
                <span>Base: ${item.basePrice.toFixed(2)}</span>
                {(item.extraAdultCount ?? 0) > 0 && (
                  <span>+{item.extraAdultCount} adults</span>
                )}
                {item.addOnDetails && item.addOnDetails.length > 0 && (
                  <span>+{item.addOnDetails.length} add-on{item.addOnDetails.length > 1 ? 's' : ''}</span>
                )}
              </div>
            )}
          </>
        );
      default:
        return null;
    }
  };

  const getItemPrice = (item: CheckoutItem) => {
    return item.total;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - prevent closing during payment processing */}
      <div className={styles.backdrop} onClick={processing ? undefined : onClose} />

      {/* Drawer */}
      <div className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            <svg className={styles.titleIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            Your Cart
          </h2>
          <button className={styles.closeButton} onClick={onClose} disabled={processing} aria-label="Close cart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          {pendingItems.length === 0 ? (
            <div className={styles.emptyCart}>
              <div className={styles.emptyIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
              </div>
              <h3>Your cart is empty</h3>
              <p>Add tickets, memberships, or book a party to get started!</p>
              <button className={styles.shopButton} onClick={onClose}>
                Continue Shopping
              </button>
            </div>
          ) : (
            <>
              {/* Cart Items */}
              <div className={styles.itemsList}>
                {pendingItems.map(item => (
                  <div key={item.id} className={styles.cartItem}>
                    <div className={styles.itemIcon}>
                      {item.type === 'ticket' && '🎟️'}
                      {item.type === 'membership' && '⭐'}
                      {item.type === 'booking' && '🎉'}
                    </div>
                    <div className={styles.itemInfo}>
                      {renderItemDetails(item)}
                    </div>
                    <div className={styles.itemPrice}>
                      ${getItemPrice(item).toFixed(2)}
                    </div>
                    <button
                      className={styles.removeButton}
                      onClick={() => handleRemoveItem(item.id)}
                      aria-label="Remove item"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Guest Info Form (if not logged in) */}
              {!user && !showPayment && (
                <div className={styles.guestForm}>
                  <h3 className={styles.guestFormTitle}>Contact Information</h3>
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
                <div className={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Tax{TAX_RATE > 0 ? ` (${Math.round(TAX_RATE * 100)}%)` : ''}</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                <div className={`${styles.summaryRow} ${styles.total}`}>
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className={styles.errorMessage}>
                  {error}
                </div>
              )}
              {success && (
                <div className={styles.successMessage}>
                  {success}
                </div>
              )}

              {/* Payment Section */}
              {showPayment && squareConfig?.available ? (
                <div className={styles.paymentSection}>
                  <h3 className={styles.paymentTitle}>Payment</h3>

                  {/* Countdown Timer */}
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
                    description={`${pendingItems.length} item${pendingItems.length > 1 ? 's' : ''} - Playfunia`}
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
                    className={styles.backButton}
                    onClick={async () => {
                      // Cancel all reservations
                      for (const resId of allReservationIds) {
                        try { await cancelReservation(resId); } catch (_) { /* ignore */ }
                      }
                      setAllReservationIds([]);
                      setReservationId(null);
                      setReservationExpiresAt(null);
                      setReservationExpired(false);
                      setShowPayment(false);
                    }}
                    disabled={processing}
                  >
                    ← Back to cart
                  </button>
                </div>
              ) : !success && (
                <button
                  className={styles.checkoutButton}
                  onClick={handleProceedToPayment}
                  disabled={pendingItems.length === 0 || reservingSlot}
                >
                  {reservingSlot ? 'Reserving slot...' : 'Proceed to Payment'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
