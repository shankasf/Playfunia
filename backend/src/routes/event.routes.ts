import { Router } from 'express';

import { getEventHandler, listEventsHandler, getEventPhotosPublicHandler } from '../controllers/event.controller';
import { cachePublic } from '../middleware/cache.middleware';

export const eventRouter = Router();

eventRouter.get('/', cachePublic(60), listEventsHandler);
eventRouter.get('/:eventId', cachePublic(60), getEventHandler);
eventRouter.get('/:eventId/photos', cachePublic(60), getEventPhotosPublicHandler);
