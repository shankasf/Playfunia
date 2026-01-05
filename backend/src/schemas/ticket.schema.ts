import { z } from "zod";

export const reserveTicketsSchema = z.object({
  guardianId: z.string().min(1),
  type: z.enum(["general", "event"]),
  eventId: z.string().min(1).optional(),
  quantity: z.number().int().min(1),
  price: z.number().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ReserveTicketsInput = z.infer<typeof reserveTicketsSchema>;

export const redeemTicketSchema = z.object({
  code: z.string().min(1),
});

export type RedeemTicketInput = z.infer<typeof redeemTicketSchema>;
