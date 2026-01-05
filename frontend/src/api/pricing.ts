import { apiGet } from './client';

export interface TicketBundle {
  id: string;
  name: string;
  description: string | null;
  price: number;
  childCount: number;
  requiresWaiver: boolean;
  requiresGripSocks: boolean;
}

export interface PartyPackagePricing {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  maxGuests: number;
  duration: number;
  includesFood: boolean;
  includesDrinks: boolean;
  includesDecor: boolean;
}

export interface PartyAddOnPricing {
  id: string;
  code: string;
  label: string;
  description: string | null;
  price: number;
  priceType: 'flat' | 'perChild' | 'duration';
}

export interface MembershipPlanPricing {
  id: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  benefits: string[];
  maxChildren: number;
  visitsPerMonth: number | null;
  discountPercent: number;
  guestPassesPerMonth: number;
}

export interface PricingConfig {
  cleaningFee: number;
  gripSocksPrice: number;
  extraChildAdmission: number;
  depositPercentage: number;
  siblingDiscountRate: number;
}

export interface AllPricing {
  ticketBundles: TicketBundle[];
  partyPackages: PartyPackagePricing[];
  partyAddOns: PartyAddOnPricing[];
  membershipPlans: MembershipPlanPricing[];
  config: PricingConfig;
}

export interface CalculatedTicketPricing {
  total: number;
  unitPrice: number;
  label: string;
  description: string;
  bundleId: string | null;
}

/**
 * Fetch all pricing information
 */
export async function getAllPricing(): Promise<AllPricing> {
  return apiGet<AllPricing>('/pricing');
}

/**
 * Fetch ticket bundles only
 */
export async function getTicketBundles(): Promise<{ bundles: TicketBundle[] }> {
  return apiGet<{ bundles: TicketBundle[] }>('/pricing/tickets');
}

/**
 * Fetch party packages only
 */
export async function getPartyPackages(): Promise<{ packages: PartyPackagePricing[] }> {
  return apiGet<{ packages: PartyPackagePricing[] }>('/pricing/party-packages');
}

/**
 * Fetch party add-ons only
 */
export async function getPartyAddOns(): Promise<{ addOns: PartyAddOnPricing[] }> {
  return apiGet<{ addOns: PartyAddOnPricing[] }>('/pricing/party-add-ons');
}

/**
 * Fetch membership plans only
 */
export async function getMembershipPlans(): Promise<{ plans: MembershipPlanPricing[] }> {
  return apiGet<{ plans: MembershipPlanPricing[] }>('/pricing/memberships');
}

/**
 * Fetch pricing config only
 */
export async function getPricingConfig(): Promise<{ config: PricingConfig }> {
  return apiGet<{ config: PricingConfig }>('/pricing/config');
}

/**
 * Calculate ticket pricing for a quantity
 */
export async function calculateTicketPricing(quantity: number): Promise<CalculatedTicketPricing> {
  return apiGet<CalculatedTicketPricing>(`/pricing/calculate-tickets?quantity=${quantity}`);
}
