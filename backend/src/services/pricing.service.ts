/**
 * Pricing Service
 * Fetches all pricing information from the database
 */

import {
  TicketTypeRepository,
  PartyPackageRepository,
  MembershipPlanRepository,
  PartyAddOnRepository,
  PricingConfigRepository,
} from '../repositories';

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

export interface PricingConfigValues {
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
  config: PricingConfigValues;
}

/**
 * Get all ticket bundles/types with pricing
 */
export async function getTicketBundles(): Promise<TicketBundle[]> {
  const ticketTypes = await TicketTypeRepository.findAll(true);

  return ticketTypes.map(t => ({
    id: String(t.ticket_type_id),
    name: t.name,
    description: t.description,
    price: t.base_price_usd ?? 0,
    childCount: t.child_count ?? 1,
    requiresWaiver: t.requires_waiver ?? true,
    requiresGripSocks: t.requires_grip_socks ?? true,
  }));
}

/**
 * Get all party packages with pricing
 */
export async function getPartyPackages(): Promise<PartyPackagePricing[]> {
  const packages = await PartyPackageRepository.findAll(true);

  return packages.map(p => ({
    id: String(p.package_id),
    name: p.name,
    description: (p as unknown as { description?: string }).description ?? null,
    basePrice: p.price_usd,
    maxGuests: p.base_children,
    duration: p.base_room_hours * 60, // Convert hours to minutes
    includesFood: p.includes_food ?? false,
    includesDrinks: p.includes_drinks ?? false,
    includesDecor: p.includes_decor ?? false,
  }));
}

/**
 * Get all party add-ons with pricing
 */
export async function getPartyAddOns(): Promise<PartyAddOnPricing[]> {
  const addOns = await PartyAddOnRepository.findAll(true);

  return addOns.map(a => ({
    id: String(a.add_on_id),
    code: a.code,
    label: a.label,
    description: a.description,
    price: a.price,
    priceType: a.price_type,
  }));
}

/**
 * Get all membership plans with pricing
 */
export async function getMembershipPlans(): Promise<MembershipPlanPricing[]> {
  const plans = await MembershipPlanRepository.findAll(true);

  return plans.map(p => ({
    id: String(p.plan_id),
    name: p.name,
    description: p.description,
    monthlyPrice: p.monthly_price,
    benefits: p.benefits ?? [],
    maxChildren: p.max_children ?? 1,
    visitsPerMonth: p.visits_per_month,
    discountPercent: p.discount_percent ?? 0,
    guestPassesPerMonth: p.guest_passes_per_month ?? 0,
  }));
}

/**
 * Get pricing configuration values
 */
export async function getPricingConfig(): Promise<PricingConfigValues> {
  const configs = await PricingConfigRepository.findAll(true);
  const configMap = new Map(configs.map(c => [c.config_key, c.config_value]));

  return {
    cleaningFee: configMap.get('cleaning_fee') ?? 50,
    gripSocksPrice: configMap.get('grip_socks_price') ?? 3,
    extraChildAdmission: configMap.get('extra_child_admission') ?? 15,
    depositPercentage: configMap.get('deposit_percentage') ?? 50,
    siblingDiscountRate: configMap.get('sibling_discount_rate') ?? 5,
  };
}

/**
 * Get all pricing information in one call
 */
export async function getAllPricing(): Promise<AllPricing> {
  const [ticketBundles, partyPackages, partyAddOns, membershipPlans, config] = await Promise.all([
    getTicketBundles(),
    getPartyPackages(),
    getPartyAddOns(),
    getMembershipPlans(),
    getPricingConfig(),
  ]);

  return {
    ticketBundles,
    partyPackages,
    partyAddOns,
    membershipPlans,
    config,
  };
}

/**
 * Calculate ticket pricing based on quantity
 * This uses the database ticket_types to determine bundle pricing
 */
export async function calculateTicketPricing(quantity: number): Promise<{
  total: number;
  unitPrice: number;
  label: string;
  description: string;
  bundleId: string | null;
}> {
  const bundles = await getTicketBundles();
  const config = await getPricingConfig();

  // Find exact match first
  const exactMatch = bundles.find(b => b.childCount === quantity);
  if (exactMatch) {
    return {
      total: exactMatch.price,
      unitPrice: exactMatch.price / quantity,
      label: exactMatch.name,
      description: exactMatch.description ?? '',
      bundleId: exactMatch.id,
    };
  }

  // If quantity > largest bundle, use largest bundle + extra children
  const sortedBundles = [...bundles]
    .filter(b => b.childCount > 0 && !b.name.toLowerCase().includes('additional'))
    .sort((a, b) => b.childCount - a.childCount);

  const largestBundle = sortedBundles[0];
  if (largestBundle && quantity > largestBundle.childCount) {
    const extraChildren = quantity - largestBundle.childCount;
    const extraTotal = extraChildren * config.extraChildAdmission;
    const total = largestBundle.price + extraTotal;

    return {
      total,
      unitPrice: total / quantity,
      label: `${largestBundle.name} + ${extraChildren} extra`,
      description: `Save with the bundle; additional kids are $${config.extraChildAdmission} each.`,
      bundleId: largestBundle.id,
    };
  }

  // Fallback: single admission
  const singleAdmission = bundles.find(b => b.childCount === 1);
  const singlePrice = singleAdmission?.price ?? 20;

  return {
    total: singlePrice * quantity,
    unitPrice: singlePrice,
    label: `${quantity} play pass${quantity > 1 ? 'es' : ''}`,
    description: '',
    bundleId: singleAdmission?.id ?? null,
  };
}
