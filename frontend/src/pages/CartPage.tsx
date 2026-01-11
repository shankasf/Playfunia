import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

import { useCheckout, CheckoutItem } from '../context/CheckoutContext';
import { useAuth } from '../context/AuthContext';
import { SquarePaymentForm } from '../components/checkout/SquarePaymentForm';
import {
  getSquareConfig,
  finalizeSquareCheckout,
  finalizeSquareGuestCheckout,
  SquareConfig,
} from '../api/square';
import {
  formatNameInput,
  formatPhoneInput,
  isValidName,
  isValidPhone,
  isValidEmail,
} from '../utils/validation';
import styles from './CartPage.module.css';

export function CartPage() {
  const { items, removeItem, updateTicketQuantity, markTicketFulfilled, markMembershipActivated, markBookingDepositPaid, clear } = useCheckout();
  const { user, refreshProfile } = useAuth();

  const [squareConfig, setSquareConfig] = useState<SquareConfig | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Guest checkout form state
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // Filter to pending items only
  const pendingItems = items.filter(item => {
    if (item.type === 'ticket') return item.status === 'pending';
    if (item.type === 'membership') return item.status === 'pending';
    if (item.type === 'booking') return item.status === 'awaiting_deposit';
    return false;
  });

  // Calculate totals
  const subtotal = pendingItems.reduce((sum, item) => {
    if (item.type === 'ticket') return sum + item.total;
    if (item.type === 'membership') return sum + item.total;
    if (item.type === 'booking') return sum + item.depositAmount;
    return sum;
  }, 0);

  // Load Square config
  useEffect(() => {
    if (!squareConfig) {
      getSquareConfig()
        .then(setSquareConfig)
        .catch(err => console.error('Failed to load Square config:', err));
    }
  }, [squareConfig]);

  const handleRemoveItem = (id: string) => {
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

  const handleProceedToPayment = () => {
    if (!user && !validateGuestInfo()) {
      return;
    }
    setError(null);
    setShowPayment(true);
  };

  const handlePaymentSuccess = useCallback(async (sourceId: string) => {
    setProcessing(true);
    setError(null);

    try {
      const checkoutItems = pendingItems.map(item => {
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
          return {
            type: 'ticket' as const,
            label: `Party Deposit - ${item.reference}`,
            quantity: 1,
            unitPrice: item.depositAmount,
            metadata: { bookingId: item.bookingId, reference: item.reference },
          };
        }
        return null;
      }).filter(Boolean) as any[];

      let result;
      if (user) {
        result = await finalizeSquareCheckout({
          items: checkoutItems,
          sourceId,
        });
      } else {
        result = await finalizeSquareGuestCheckout({
          items: checkoutItems,
          sourceId,
          guestFirstName: guestFirstName.trim(),
          guestLastName: guestLastName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim(),
        });
      }

      // Set success state FIRST to prevent empty cart flash
      setSuccess('Payment successful! Your order has been confirmed.');
      setShowPayment(false);

      // Then update item statuses
      result.tickets.forEach(ticket => {
        const originalItem = pendingItems[ticket.cartIndex];
        if (originalItem?.type === 'ticket') {
          markTicketFulfilled(originalItem.id, {
            ticketId: ticket.ticket.id,
            codes: ticket.ticket.codes.map(c => c.code),
          });
        }
      });

      result.memberships.forEach(membership => {
        const originalItem = pendingItems[membership.cartIndex];
        if (originalItem?.type === 'membership') {
          markMembershipActivated(originalItem.id, membership.membership.startedAt);
        }
      });

      pendingItems.forEach(item => {
        if (item.type === 'booking') {
          markBookingDepositPaid(item.bookingId, item.balanceRemaining);
        }
      });

      if (user) {
        await refreshProfile().catch(console.error);
      }

      setTimeout(() => {
        clear();
      }, 5000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [pendingItems, user, guestFirstName, guestLastName, guestEmail, guestPhone, markTicketFulfilled, markMembershipActivated, markBookingDepositPaid, refreshProfile, clear]);

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
            <span className={styles.itemLabel}>Party Booking</span>
            <span className={styles.itemMeta}>{item.reference}</span>
            <span className={styles.itemDeposit}>Deposit required</span>
          </>
        );
      default:
        return null;
    }
  };

  const getItemPrice = (item: CheckoutItem) => {
    if (item.type === 'booking') return item.depositAmount;
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
            <Link to="/" className={styles.shopLink}>Back to Home</Link>
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
                      maxLength={100}
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={guestLastName}
                      onChange={(e) => setGuestLastName(formatNameInput(e.target.value))}
                      className={styles.input}
                      maxLength={100}
                    />
                  </div>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className={styles.input}
                  />
                  <input
                    type="tel"
                    placeholder="Phone (10 digits)"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(formatPhoneInput(e.target.value))}
                    className={styles.input}
                    maxLength={10}
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
                  <span>Tax</span>
                  <span>$0.00</span>
                </div>
                <div className={styles.summaryTotal}>
                  <span>Total</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Error Message */}
              {error && <div className={styles.error}>{error}</div>}

              {/* Payment Section */}
              {showPayment && squareConfig?.available ? (
                <div className={styles.paymentSection}>
                  <h3>Payment</h3>
                  <SquarePaymentForm
                    amount={subtotal}
                    currency="USD"
                    description={`${pendingItems.length} item${pendingItems.length > 1 ? 's' : ''}`}
                    submitLabel={processing ? 'Processing...' : 'Pay Now'}
                    processingLabel="Processing..."
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
                    onClick={() => setShowPayment(false)}
                    disabled={processing}
                  >
                    ← Back
                  </button>
                </div>
              ) : (
                <button
                  className={styles.checkoutBtn}
                  onClick={handleProceedToPayment}
                  disabled={pendingItems.length === 0}
                >
                  Proceed to Payment
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
