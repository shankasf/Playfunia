import { z } from "zod";

export const reserveTicketsSchema = z.object({
  guardianId: z.string().min(1),
  customerId: z.number().int().positive().optional(),
  type: z.enum(["general", "event"]),
  eventId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(100),
  price: z.number().min(0.50, 'Minimum price is $0.50').max(1000),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export type ReserveTicketsInput = z.infer<typeof reserveTicketsSchema>;

export const redeemTicketSchema = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9-]+$/, 'Code must be alphanumeric'),
});

export type RedeemTicketInput = z.infer<typeof redeemTicketSchema>;
