import { Router } from 'express';

import { listPartyPackagesHandler } from '../controllers/party-package.controller';
import { cachePublic } from '../middleware/cache.middleware';

export const partyPackageRouter = Router();

partyPackageRouter.get('/', cachePublic(300), listPartyPackagesHandler);

