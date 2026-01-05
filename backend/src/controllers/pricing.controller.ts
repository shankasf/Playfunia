import { Request, Response } from 'express';

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
export async function getAllPricingHandler(_req: Request, res: Response) {
  try {
    const pricing = await getAllPricing();
    res.json(pricing);
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({ message: 'Failed to fetch pricing' });
  }
}

/**
 * Get ticket bundles only
 */
export async function getTicketBundlesHandler(_req: Request, res: Response) {
  try {
    const bundles = await getTicketBundles();
    res.json({ bundles });
  } catch (error) {
    console.error('Error fetching ticket bundles:', error);
    res.status(500).json({ message: 'Failed to fetch ticket bundles' });
  }
}

/**
 * Get party packages only
 */
export async function getPartyPackagesHandler(_req: Request, res: Response) {
  try {
    const packages = await getPartyPackages();
    res.json({ packages });
  } catch (error) {
    console.error('Error fetching party packages:', error);
    res.status(500).json({ message: 'Failed to fetch party packages' });
  }
}

/**
 * Get party add-ons only
 */
export async function getPartyAddOnsHandler(_req: Request, res: Response) {
  try {
    const addOns = await getPartyAddOns();
    res.json({ addOns });
  } catch (error) {
    console.error('Error fetching party add-ons:', error);
    res.status(500).json({ message: 'Failed to fetch party add-ons' });
  }
}

/**
 * Get membership plans only
 */
export async function getMembershipPlansHandler(_req: Request, res: Response) {
  try {
    const plans = await getMembershipPlans();
    res.json({ plans });
  } catch (error) {
    console.error('Error fetching membership plans:', error);
    res.status(500).json({ message: 'Failed to fetch membership plans' });
  }
}

/**
 * Get pricing config only
 */
export async function getPricingConfigHandler(_req: Request, res: Response) {
  try {
    const config = await getPricingConfig();
    res.json({ config });
  } catch (error) {
    console.error('Error fetching pricing config:', error);
    res.status(500).json({ message: 'Failed to fetch pricing config' });
  }
}

/**
 * Calculate ticket pricing for a given quantity
 */
export async function calculateTicketPricingHandler(req: Request, res: Response) {
  try {
    const quantity = parseInt(req.query.quantity as string, 10);
    if (isNaN(quantity) || quantity < 1) {
      res.status(400).json({ message: 'Invalid quantity' });
      return;
    }

    const pricing = await calculateTicketPricing(quantity);
    res.json(pricing);
  } catch (error) {
    console.error('Error calculating ticket pricing:', error);
    res.status(500).json({ message: 'Failed to calculate pricing' });
  }
}
