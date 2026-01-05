import { Router } from 'express';

import { lookupHandler, loginHandler } from '../controllers/waiver-auth.controller';

export const waiverAuthRouter = Router();

// POST /waiver-auth/lookup - check if email/phone exists
waiverAuthRouter.post('/lookup', lookupHandler);

// POST /waiver-auth/login - login or register waiver user
waiverAuthRouter.post('/login', loginHandler);
