import { apiPost } from "./client";

export type ReserveTicketsPayload = {
  type: "general" | "event";
  eventId?: string;
  quantity: number;
  price: number;
  metadata?: Record<string, unknown>;
};

export type ReserveTicketsResponse = {
  ticket: {
    id: string;
    reference?: string;
    codes: Array<{ code: string; status: "unused" | "redeemed" }>;
    quantity: number;
    total: number;
    price: number;
  };
};

export async function reserveTickets(payload: ReserveTicketsPayload) {
  return apiPost<ReserveTicketsResponse, ReserveTicketsPayload>("/tickets/reserve", payload);
}
