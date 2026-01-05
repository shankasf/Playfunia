import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getEventById, listEvents, rsvpToEvent } from '../services/event.service';
import {
  eventFilterSchema,
  eventIdParamSchema,
  rsvpEventSchema,
  type EventFilterInput,
} from '../schemas/event.schema';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export const listEventsHandler = asyncHandler(async (req: Request, res: Response) => {
  const filter = parseQuery(eventFilterSchema, req.query);
  const events = await listEvents(filter);
  return res.status(200).json({ events });
});

export const getEventHandler = asyncHandler(async (req: Request, res: Response) => {
  const { eventId } = parseWithSchema(eventIdParamSchema, req.params);
  const event = await getEventById(eventId);
  return res.status(200).json({ event });
});

export const rsvpEventHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const { eventId } = parseWithSchema(eventIdParamSchema, req.params);
  const payload = parseWithSchema(rsvpEventSchema, req.body);
  const ticket = await rsvpToEvent(req.user.id, eventId, payload);

  return res.status(200).json({ ticket });
});

function parseWithSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map(issue => issue.message).join(', ');
      throw new AppError(`Validation failed: ${message}`, 400, { cause: error });
    }
    throw error;
  }
}

function parseQuery(schema: { parse: (data: unknown) => EventFilterInput }, data: unknown) {
  try {
    return schema.parse(data);
  } catch {
    return {} as EventFilterInput;
  }
}
