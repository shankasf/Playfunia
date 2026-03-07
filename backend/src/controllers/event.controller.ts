import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { getEventById, listEvents } from '../services/event.service';
import { EventPhotoRepository } from '../repositories';
import {
  eventFilterSchema,
  eventIdParamSchema,
  type EventFilterInput,
} from '../schemas/event.schema';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export const listEventsHandler = asyncHandler(async (req: Request, res: Response) => {
  const filter = parseQuery(eventFilterSchema, req.query);
  const rawEvents = await listEvents(filter);
  const eventIdsWithMedia = await EventPhotoRepository.getEventIdsWithMedia();
  const mediaSet = new Set(eventIdsWithMedia);
  const events = rawEvents.map(e => ({
    ...mapEventToCamelCase(e),
    hasMedia: mediaSet.has(Number(e.event_id)),
  }));
  return res.status(200).json({ events });
});

function mapEventToCamelCase(e: Record<string, unknown>) {
  return {
    id: String(e.event_id),
    title: e.title,
    description: e.description ?? null,
    startDate: e.start_date,
    endDate: e.end_date,
    imageUrl: e.image_url ?? null,
  };
}

export const getEventHandler = asyncHandler(async (req: Request, res: Response) => {
  const { eventId } = parseWithSchema(eventIdParamSchema, req.params);
  const event = await getEventById(eventId);
  return res.status(200).json({ event });
});

export const getEventPhotosPublicHandler = asyncHandler(async (req: Request, res: Response) => {
  const eventIdRaw = parseInt(req.params.eventId || '', 10);
  if (isNaN(eventIdRaw)) {
    throw new AppError('Invalid event ID', 400);
  }
  const photos = await EventPhotoRepository.findByEventId(eventIdRaw);
  return res.status(200).json({
    photos: photos.map((p: Record<string, unknown>) => ({
      id: p.photo_id,
      url: p.photo_url,
      caption: p.caption,
      mediaType: (p.media_type as string) ?? 'image',
    })),
  });
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
