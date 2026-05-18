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
  StoreHoursRepository,
  ProductPromotionRepository,
} from '../repositories';
import { getCheckoutPricingConfig, type CheckoutPricingConfig } from './pricing-config.service';
import { roundCurrency } from '../utils/currency';

export interface TicketBundle {
  id: string;
  name: string;
  description: string | null;
  price: number;
  childCount: number;
  requiresWaiver: boolean;
  requiresGripSocks: boolean;
}

export interface AdditionalTerm {
  title: string;
  description: string;
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
  features: string[];
  additionalTerms: AdditionalTerm[];
  extraAdultPrice: number;
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
  originalPrice?: number;
  promoLabel?: string;
  promoNote?: string;
  promoEndsAt?: string;
  promoSpotsLeft?: number;
  benefits: string[];
  maxChildren: number;
  visitsPerMonth: number | null;
  discountPercent: number;
  guestPassesPerMonth: number;
}

export interface StoreHours {
  day: string;
  dayIndex: number;
  open: string;
  close: string;
}

export interface PricingConfigValues {
  taxRate: number;
  cleaningFee: number;
  gripSocksPrice: number;
  extraChildAdmission: number;
  extraAdultAdmission: number;
  singleAdmissionPrice: number;
  depositPercentage: number;
  siblingDiscountRate: number;
  storeHours: StoreHours[];
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

  return packages.map(p => {
    const pkg = p as unknown as {
      description?: string;
      features?: string[];
      additional_terms?: AdditionalTerm[];
      extra_adult_price?: number;
    };
    return {
      id: String(p.package_id),
      name: p.name,
      description: pkg.description ?? null,
      basePrice: p.price_usd,
      maxGuests: p.base_children,
      duration: p.base_room_hours * 60, // Convert hours to minutes
      includesFood: p.includes_food ?? false,
      includesDrinks: p.includes_drinks ?? false,
      includesDecor: p.includes_decor ?? false,
      features: pkg.features ?? [],
      additionalTerms: pkg.additional_terms ?? [],
      extraAdultPrice: pkg.extra_adult_price ?? 10,
    };
  });
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
    priceType: a.price_type as 'flat' | 'perChild' | 'duration',
  }));
}

/**
 * Get all membership plans with pricing (includes active promo if any)
 */
export async function getMembershipPlans(): Promise<MembershipPlanPricing[]> {
  const [plans, activePromos] = await Promise.all([
    MembershipPlanRepository.findAll(true),
    ProductPromotionRepository.findAllActive('membership'),
  ]);

  // Exclude promo-specific plans from regular listing (they appear via promo offers)
  const regularPlans = plans.filter(p => !p.name.startsWith('Promo - '));

  return regularPlans.map(p => {
    const promo =
      activePromos.find(pr => pr.product_id === p.plan_id) ??
      activePromos.find(pr => pr.product_id === null) ??
      null;

    let effectivePrice = p.monthly_price;
    if (promo) {
      effectivePrice = promo.discount_type === 'percent'
        ? Math.round(p.monthly_price * (1 - promo.discount_value / 100) * 100) / 100
        : promo.discount_value;
    }

    return {
      id: String(p.plan_id),
      name: p.name,
      description: p.description,
      monthlyPrice: effectivePrice,
      originalPrice: promo ? p.monthly_price : undefined,
      promoLabel: promo?.promo_label ?? undefined,
      promoNote: promo?.promo_note ?? undefined,
      promoEndsAt: promo?.ends_at ?? undefined,
      promoSpotsLeft: promo?.max_redemptions != null
        ? Math.max(0, promo.max_redemptions - promo.redemptions)
        : undefined,
      benefits: p.benefits ?? [],
      maxChildren: p.max_children ?? 1,
      visitsPerMonth: p.visits_per_month,
      discountPercent: p.discount_percent ?? 0,
      guestPassesPerMonth: p.guest_passes_per_month ?? 0,
    };
  });
}

// Fallback store hours (used only if database is unavailable)
const DEFAULT_STORE_HOURS: Record<number, { open: string; close: string }> = {
  0: { open: '11:00', close: '18:00' }, // Sunday: 11am - 6pm
  1: { open: '10:00', close: '19:00' }, // Monday: 10am - 7pm
  2: { open: '10:00', close: '19:00' }, // Tuesday: 10am - 7pm
  3: { open: '10:00', close: '19:00' }, // Wednesday: 10am - 7pm
  4: { open: '10:00', close: '19:00' }, // Thursday: 10am - 7pm
  5: { open: '10:00', close: '20:00' }, // Friday: 10am - 8pm
  6: { open: '10:00', close: '20:00' }, // Saturday: 10am - 8pm
};

const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/**
 * Get store hours as an array - fetches from database
 */
export async function getStoreHours(location: string = 'Albany'): Promise<StoreHours[]> {
  try {
    const dbHours = await StoreHoursRepository.findByLocation(location);

    if (dbHours && dbHours.length > 0) {
      return dbHours.map(h => ({
        day: DAY_NAMES[h.day_of_week] ?? 'Unknown',
        dayIndex: h.day_of_week,
        open: h.open_time.slice(0, 5),
        close: h.close_time.slice(0, 5),
      }));
    }
  } catch (error) {
    console.error('Failed to fetch store hours from database:', error);
  }

  // Fallback to default hours
  return Object.entries(DEFAULT_STORE_HOURS).map(([dayIndex, hours]) => {
    const idx = Number(dayIndex);
    return {
      day: DAY_NAMES[idx] ?? 'Unknown',
      dayIndex: idx,
      open: hours.open,
      close: hours.close,
    };
  });
}

/**
 * Get pricing configuration values
 */
export async function getPricingConfig(): Promise<PricingConfigValues> {
  // Get checkout-specific pricing from centralized service
  const checkoutConfig = await getCheckoutPricingConfig();

  // Get additional config values from repository
  const configs = await PricingConfigRepository.findAll(true);
  const configMap = new Map(configs.map(c => [c.config_key, c.config_value]));

  const storeHours = await getStoreHours();

  return {
    taxRate: checkoutConfig.taxRate,
    cleaningFee: checkoutConfig.cleaningFee,
    gripSocksPrice: checkoutConfig.gripSocksPrice,
    extraChildAdmission: checkoutConfig.extraChildFee,
    extraAdultAdmission: checkoutConfig.extraAdultAdmissionPrice,
    singleAdmissionPrice: checkoutConfig.singleAdmissionPrice,
    depositPercentage: configMap.get('deposit_percentage') ?? 50,
    siblingDiscountRate: configMap.get('sibling_discount_rate') ?? 5,
    storeHours,
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
      // Bug fix #10b: Round unit price to avoid floating-point display issues
      unitPrice: roundCurrency(exactMatch.price / quantity),
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
      unitPrice: roundCurrency(total / quantity),
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
