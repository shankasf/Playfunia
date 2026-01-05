import { Router } from 'express';

import {
  getAllPricingHandler,
  getTicketBundlesHandler,
  getPartyPackagesHandler,
  getPartyAddOnsHandler,
  getMembershipPlansHandler,
  getPricingConfigHandler,
  calculateTicketPricingHandler,
} from '../controllers/pricing.controller';

export const pricingRouter = Router();

// All pricing routes are public (no authentication required)

// Get all pricing in one call
pricingRouter.get('/', getAllPricingHandler);

// Individual pricing endpoints
pricingRouter.get('/tickets', getTicketBundlesHandler);
pricingRouter.get('/party-packages', getPartyPackagesHandler);
pricingRouter.get('/party-add-ons', getPartyAddOnsHandler);
pricingRouter.get('/memberships', getMembershipPlansHandler);
pricingRouter.get('/config', getPricingConfigHandler);

// Calculate ticket pricing for a quantity
pricingRouter.get('/calculate-tickets', calculateTicketPricingHandler);
