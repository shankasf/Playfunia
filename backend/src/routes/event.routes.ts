import { Router } from 'express';

import { getEventHandler, listEventsHandler, rsvpEventHandler } from '../controllers/event.controller';
import { authGuard } from '../middleware/auth.middleware';
import { cachePublic } from '../middleware/cache.middleware';

export const eventRouter = Router();

eventRouter.get('/', cachePublic(60), listEventsHandler);
eventRouter.get('/:eventId', cachePublic(60), getEventHandler);
eventRouter.post('/:eventId/rsvp', authGuard, rsvpEventHandler);

