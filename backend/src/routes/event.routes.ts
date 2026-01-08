import { Router } from 'express';

import { getEventHandler, listEventsHandler, rsvpEventHandler } from '../controllers/event.controller';
import { supabaseAuthGuard } from '../middleware/supabase-auth.middleware';
import { cachePublic } from '../middleware/cache.middleware';

export const eventRouter = Router();

eventRouter.get('/', cachePublic(60), listEventsHandler);
eventRouter.get('/:eventId', cachePublic(60), getEventHandler);
eventRouter.post('/:eventId/rsvp', supabaseAuthGuard, rsvpEventHandler);

