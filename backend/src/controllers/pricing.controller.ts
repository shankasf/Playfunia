import { Request, Response, NextFunction } from 'express';

import {
  getAllPricing,
  getTicketBundles,
  getPartyPackages,
  getPartyAddOns,
  getMembershipPlans,
  getPricingConfig,
  calculateTicketPricing,
} from '../services/pricing.service';

/**
 * Get all pricing information
 * Public endpoint - no authentication required
 */
export async function getAllPricingHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const pricing = await getAllPricing();
    res.json(pricing);
  } catch (error) {
    next(error);
  }
}

/**
 * Get ticket bundles only
 */
export async function getTicketBundlesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const bundles = await getTicketBundles();
    res.json({ bundles });
  } catch (error) {
    next(error);
  }
}

/**
 * Get party packages only
 */
export async function getPartyPackagesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const packages = await getPartyPackages();
    res.json({ packages });
  } catch (error) {
    next(error);
  }
}

/**
 * Get party add-ons only
 */
export async function getPartyAddOnsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const addOns = await getPartyAddOns();
    res.json({ addOns });
  } catch (error) {
    next(error);
  }
}

/**
 * Get membership plans only
 */
export async function getMembershipPlansHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const plans = await getMembershipPlans();
    res.json({ plans });
  } catch (error) {
    next(error);
  }
}

/**
 * Get pricing config only
 */
export async function getPricingConfigHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const config = await getPricingConfig();
    res.json({ config });
  } catch (error) {
    next(error);
  }
}

/**
 * Calculate ticket pricing for a given quantity
 */
export async function calculateTicketPricingHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const quantity = parseInt(req.query.quantity as string, 10);
    if (isNaN(quantity) || quantity < 1 || quantity > 100) {
      res.status(400).json({ message: 'Quantity must be between 1 and 100' });
      return;
    }

    const pricing = await calculateTicketPricing(quantity);
    res.json(pricing);
  } catch (error) {
    next(error);
  }
}
