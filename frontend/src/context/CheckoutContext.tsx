import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type BookingCartItem = {
  id: string;
  type: "booking";
  bookingId: string;
  reference: string;
  location: string;
  eventDate: string;
  startTime: string;
  total: number;
  depositAmount: number;
  balanceRemaining: number;
  status: "awaiting_deposit" | "deposit_paid";
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
  markBookingDepositPaid: (bookingId: string, balanceRemaining: number) => void;
  addTicketPurchase: (item: TicketCartItem) => void;
  markTicketFulfilled: (itemId: string, update: { ticketId?: string; codes?: string[]; discounts?: DiscountLine[]; promoCode?: string }) => void;
  addMembershipPurchase: (item: MembershipCartItem) => void;
  markMembershipActivated: (itemId: string, activatedAt?: string) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

const CheckoutContext = createContext<CheckoutContextValue | undefined>(undefined);
const STORAGE_KEY = "playfunia_checkout_items";

function loadStoredItems(): CheckoutItem[] {
  try {
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
  }, [items]);

  const addBookingDepositItem = (item: BookingCartItem) => {
    setItems(prev => {
      const filtered = prev.filter(existing => !(existing.type === "booking" && existing.bookingId === item.bookingId));
      return [...filtered, item];
    });
  };

  const markBookingDepositPaid = (bookingId: string, balanceRemaining: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.type === "booking" && item.bookingId === bookingId) {
          return {
            ...item,
            status: "deposit_paid",
            balanceRemaining,
          };
        }
        return item;
      }),
    );
  };

  const addTicketPurchase = (item: TicketCartItem) => {
    setItems(prev => [...prev, item]);
  };

  const markTicketFulfilled = (
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
  };

  const addMembershipPurchase = (item: MembershipCartItem) => {
    setItems(prev => [...prev, item]);
  };

  const markMembershipActivated = (itemId: string, activatedAt?: string) => {
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
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const clear = () => setItems([]);

  const value = useMemo<CheckoutContextValue>(
    () => ({
      items,
      addBookingDepositItem,
      markBookingDepositPaid,
      addTicketPurchase,
      markTicketFulfilled,
      addMembershipPurchase,
      markMembershipActivated,
      removeItem,
      clear,
    }),
    [items],
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
