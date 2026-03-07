import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type BookingCartItem = {
  id: string;
  type: "booking";
  // Cart-only fields (no bookingId until payment)
  packageId: string;
  packageName: string;
  location: string;
  eventDate: string;
  startTime: string;
  guestCount: number;
  total: number;
  // Pricing breakdown for display
  durationMinutes?: number;
  basePrice?: number;
  extraAdultCount?: number;
  extraAdultFee?: number;
  extraAdultTotal?: number;
  addOnDetails?: Array<{ id: string; name: string; price: number; quantity: number }>;
  cleaningFee?: number;
  subtotal?: number;
  tax?: number;
  // Booking creation data
  childIds?: string[];
  notes?: string;
  addOns?: Array<{ id: string; quantity: number }>;
  // Guest booking data (if not logged in)
  guestInfo?: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    childName: string;
    childBirthDate?: string;
    additionalChildren?: Array<{ name: string; birthDate?: string }>;
  };
  // After payment
  bookingId?: string;
  reference?: string;
  status: "pending" | "paid";
};

export type DiscountLine = {
  label: string;
  amount: number;
};

export type TicketCartItem = {
  id: string;
  type: "ticket";
  ticketId?: string;
  eventId?: string;
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
  codes?: string[];
  purchasedAt?: string;
  status: "pending" | "paid";
  discounts?: DiscountLine[];
  promoCode?: string;
};

export type MembershipCartItem = {
  id: string;
  type: "membership";
  membershipId: string;
  label: string;
  monthlyPrice: number;
  durationMonths: number;
  autoRenew: boolean;
  total: number;
  status: "pending" | "activated";
  activatedAt?: string;
};

export type CheckoutItem = BookingCartItem | TicketCartItem | MembershipCartItem;

interface CheckoutContextValue {
  items: CheckoutItem[];
  addBookingDepositItem: (item: BookingCartItem) => void;
  markBookingPaid: (cartItemId: string, bookingId: string, reference: string) => void;
  addTicketPurchase: (item: TicketCartItem) => void;
  updateTicketQuantity: (itemId: string, newQuantity: number) => void;
  markTicketFulfilled: (itemId: string, update: { ticketId?: string; codes?: string[]; discounts?: DiscountLine[]; promoCode?: string }) => void;
  addMembershipPurchase: (item: MembershipCartItem) => void;
  markMembershipActivated: (itemId: string, activatedAt?: string) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

const CheckoutContext = createContext<CheckoutContextValue | undefined>(undefined);
const STORAGE_KEY = "playfunia_checkout_items";

const CART_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const TIMESTAMP_KEY = "playfunia_checkout_ts";

function loadStoredItems(): CheckoutItem[] {
  try {
    // Expire cart items after 24 hours
    const ts = localStorage.getItem(TIMESTAMP_KEY);
    if (ts && Date.now() - Number(ts) > CART_EXPIRY_MS) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TIMESTAMP_KEY);
      return [];
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return (parsed as CheckoutItem[]).map(item => {
      if (item && (item as CheckoutItem).type === "ticket") {
        const ticket = item as TicketCartItem;
        return {
          ...ticket,
          status: ticket.status ?? "pending",
          unitPrice: ticket.unitPrice ?? (ticket.quantity > 0 ? ticket.total / ticket.quantity : 0),
          codes: ticket.codes ?? [],
        };
      }
      if (item && (item as CheckoutItem).type === "membership") {
        const membership = item as MembershipCartItem;
        return {
          ...membership,
          status: membership.status ?? "pending",
        };
      }
      return item;
    });
  } catch (error) {
    console.warn("Unable to parse stored checkout items", error);
    return [];
  }
}

export function CheckoutProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CheckoutItem[]>(() => loadStoredItems());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (items.length > 0) {
      // Update timestamp on any cart change; set initial timestamp if not present
      if (!localStorage.getItem(TIMESTAMP_KEY)) {
        localStorage.setItem(TIMESTAMP_KEY, String(Date.now()));
      }
    } else {
      localStorage.removeItem(TIMESTAMP_KEY);
    }
  }, [items]);

  const addBookingDepositItem = useCallback((item: BookingCartItem) => {
    setItems(prev => {
      // Remove any existing booking with same details (package + date + time + location)
      const filtered = prev.filter(existing =>
        !(existing.type === "booking" &&
          existing.packageId === item.packageId &&
          existing.eventDate === item.eventDate &&
          existing.startTime === item.startTime &&
          existing.location === item.location)
      );
      return [...filtered, item];
    });
  }, []);

  const markBookingPaid = useCallback((cartItemId: string, bookingId: string, reference: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.type === "booking" && item.id === cartItemId) {
          return {
            ...item,
            bookingId,
            reference,
            status: "paid" as const,
          };
        }
        return item;
      }),
    );
  }, []);

  const addTicketPurchase = useCallback((item: TicketCartItem) => {
    setItems(prev => {
      // Check if there's an existing pending ticket with the same label
      const existingIndex = prev.findIndex(
        existing =>
          existing.type === "ticket" &&
          existing.status === "pending" &&
          existing.label === item.label
      );

      if (existingIndex !== -1) {
        // Update existing ticket quantity
        const existing = prev[existingIndex] as TicketCartItem;
        const newQuantity = existing.quantity + item.quantity;
        const updated: TicketCartItem = {
          ...existing,
          quantity: newQuantity,
          // Bug fix #18: Use integer cents math to avoid floating-point errors
          total: Math.round(Math.round(existing.unitPrice * 100) * newQuantity) / 100,
        };
        const newItems = [...prev];
        newItems[existingIndex] = updated;
        return newItems;
      }

      // Add as new item
      return [...prev, item];
    });
  }, []);

  const updateTicketQuantity = useCallback((itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      // Remove item if quantity is 0 or less
      setItems(prev => prev.filter(item => item.id !== itemId));
      return;
    }
    setItems(prev =>
      prev.map(item => {
        if (item.type === "ticket" && item.id === itemId && item.status === "pending") {
          return {
            ...item,
            quantity: newQuantity,
            // Bug fix #18: Use integer cents math to avoid floating-point errors
            total: Math.round(Math.round(item.unitPrice * 100) * newQuantity) / 100,
          };
        }
        return item;
      }),
    );
  }, []);

  const markTicketFulfilled = useCallback((
    itemId: string,
    update: { ticketId?: string; codes?: string[]; discounts?: DiscountLine[]; promoCode?: string },
  ) => {
    setItems(prev =>
      prev.map(item => {
        if (item.type === "ticket" && item.id === itemId) {
          return {
            ...item,
            status: "paid",
            ticketId: update.ticketId ?? item.ticketId,
            codes: update.codes ?? item.codes,
            discounts: update.discounts ?? item.discounts,
            promoCode: update.promoCode ?? item.promoCode,
            purchasedAt: item.purchasedAt ?? new Date().toISOString(),
          };
        }
        return item;
      }),
    );
  }, []);

  const addMembershipPurchase = useCallback((item: MembershipCartItem) => {
    setItems(prev => {
      // Replace existing pending membership of the same plan (prevent duplicates)
      const existingIndex = prev.findIndex(
        i => i.type === 'membership' && i.status === 'pending' && i.membershipId === item.membershipId
      );
      if (existingIndex !== -1) {
        const newItems = [...prev];
        newItems[existingIndex] = item;
        return newItems;
      }
      return [...prev, item];
    });
  }, []);

  const markMembershipActivated = useCallback((itemId: string, activatedAt?: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.type === "membership" && item.id === itemId) {
          return {
            ...item,
            status: "activated",
            activatedAt: activatedAt ?? new Date().toISOString(),
          };
        }
        return item;
      }),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CheckoutContextValue>(
    () => ({
      items,
      addBookingDepositItem,
      markBookingPaid,
      addTicketPurchase,
      updateTicketQuantity,
      markTicketFulfilled,
      addMembershipPurchase,
      markMembershipActivated,
      removeItem,
      clear,
    }),
    [items, addBookingDepositItem, markBookingPaid, addTicketPurchase, updateTicketQuantity, markTicketFulfilled, addMembershipPurchase, markMembershipActivated, removeItem, clear],
  );

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout() {
  const ctx = useContext(CheckoutContext);
  if (!ctx) {
    throw new Error("useCheckout must be used within CheckoutProvider");
  }
  return ctx;
}
