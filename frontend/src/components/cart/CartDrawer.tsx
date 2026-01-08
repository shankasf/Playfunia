import { useEffect, useState, useCallback } from 'react';

import { useCheckout, CheckoutItem } from '../../context/CheckoutContext';
import { useAuth } from '../../context/AuthContext';
import { SquarePaymentForm } from '../checkout/SquarePaymentForm';
import {
  getSquareConfig,
  finalizeSquareCheckout,
  finalizeSquareGuestCheckout,
  SquareConfig,
} from '../../api/square';
import styles from './CartDrawer.module.css';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeItem, markTicketFulfilled, markMembershipActivated, markBookingDepositPaid, clear } = useCheckout();
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
    if (isOpen && !squareConfig) {
      getSquareConfig()
        .then(setSquareConfig)
        .catch(err => console.error('Failed to load Square config:', err));
    }
  }, [isOpen, squareConfig]);

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

  const handleRemoveItem = (id: string) => {
    removeItem(id);
    if (pendingItems.length === 1) {
      setShowPayment(false);
    }
  };

  const validateGuestInfo = () => {
    if (!guestFirstName.trim() || !guestLastName.trim()) {
      setError('Please enter your full name.');
      return false;
    }
    if (!guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (!guestPhone.trim() || guestPhone.trim().length < 10) {
      setError('Please enter a valid phone number.');
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
      // Build items payload for Square checkout
      const checkoutItems = pendingItems.map(item => {
        if (item.type === 'ticket') {
          return {
            type: 'ticket' as const,
            label: item.label,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
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
        // For bookings, treat deposit as a ticket-like item
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

      // Update cart items with fulfillment info
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

      // Handle booking deposits
      pendingItems.forEach(item => {
        if (item.type === 'booking') {
          markBookingDepositPaid(item.bookingId, item.balanceRemaining);
        }
      });

      // Refresh user profile if authenticated
      if (user) {
        await refreshProfile().catch(console.error);
      }

      setSuccess('Payment successful! Your order has been confirmed.');
      setShowPayment(false);

      // Close drawer after short delay
      setTimeout(() => {
        clear();
        onClose();
        setSuccess(null);
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [pendingItems, user, guestFirstName, guestLastName, guestEmail, guestPhone, markTicketFulfilled, markMembershipActivated, markBookingDepositPaid, refreshProfile, clear, onClose]);

  
  const renderItemDetails = (item: CheckoutItem) => {
    switch (item.type) {
      case 'ticket':
        return (
          <>
            <span className={styles.itemLabel}>{item.label}</span>
            <span className={styles.itemQty}>Qty: {item.quantity}</span>
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
            <span className={styles.itemLabel}>Party Booking</span>
            <span className={styles.itemQty}>{item.reference}</span>
            <span className={styles.itemNote}>Deposit: ${item.depositAmount.toFixed(2)}</span>
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

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

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
          <button className={styles.closeButton} onClick={onClose} aria-label="Close cart">
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
                      onChange={(e) => setGuestFirstName(e.target.value)}
                      className={styles.input}
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={guestLastName}
                      onChange={(e) => setGuestLastName(e.target.value)}
                      className={styles.input}
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
                    placeholder="Phone number"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className={styles.input}
                  />
                </div>
              )}

              {/* Summary */}
              <div className={styles.summary}>
                <div className={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className={`${styles.summaryRow} ${styles.total}`}>
                  <span>Total</span>
                  <span>${subtotal.toFixed(2)}</span>
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
                  <SquarePaymentForm
                    amount={subtotal}
                    currency="USD"
                    description={`${pendingItems.length} item${pendingItems.length > 1 ? 's' : ''} - Playfunia`}
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
                    className={styles.backButton}
                    onClick={() => setShowPayment(false)}
                    disabled={processing}
                  >
                    ← Back to cart
                  </button>
                </div>
              ) : !success && (
                <button
                  className={styles.checkoutButton}
                  onClick={handleProceedToPayment}
                  disabled={pendingItems.length === 0}
                >
                  Proceed to Payment
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
