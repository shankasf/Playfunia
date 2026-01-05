import { z } from 'zod';

export const eventIdParamSchema = z.object({
  eventId: z.string().min(1),
});

export type EventIdParams = z.infer<typeof eventIdParamSchema>;

export const eventFilterSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  tag: z.string().optional(),
});

export type EventFilterInput = z.infer<typeof eventFilterSchema>;

export const rsvpEventSchema = z.object({
  quantity: z.number().int().positive().max(20),
});

export type RsvpEventInput = z.infer<typeof rsvpEventSchema>;

