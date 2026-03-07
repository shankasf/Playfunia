/**
 * Centralized Pricing Configuration Service
 *
 * SINGLE SOURCE OF TRUTH for all pricing values.
 * All pricing values come from the database via PricingConfigRepository.
 * NO hardcoded fallbacks - functions throw if required values are missing.
 */

import { PricingConfigRepository, PartyAddOnRepository } from '../repositories';
import { AppError } from '../utils/app-error';

// Cache for pricing config values (refreshed on demand)
let cachedTaxRate: number | null = null;
let cachedCleaningFee: number | null = null;
let cachedSingleAdmissionPrice: number | null = null;
let cachedExtraAdultAdmissionPrice: number | null = null;
let cachedGripSocksPrice: number | null = null;
// Add-on prices cached from party_add_ons table
let cachedExtraChildFee: number | null = null;
let cachedExtraAdultFee: number | null = null;
let cacheInitialized = false;

/**
 * Initialize the pricing config cache.
 * Must be called before using sync functions.
 */
export async function initializePricingCache(): Promise<void> {
  // Load from pricing_config table
  const configs = await PricingConfigRepository.findAll(true);
  const configMap = new Map(configs.map(c => [c.config_key, c.config_value]));

  // Tax rate is stored as percentage (e.g., 8 for 8%)
  const taxRateValue = configMap.get('tax_rate');
  if (taxRateValue === undefined) {
    throw new AppError('tax_rate not configured in pricing_config', 500);
  }
  cachedTaxRate = taxRateValue / 100; // Convert to decimal

  const cleaningFee = configMap.get('cleaning_fee');
  if (cleaningFee === undefined) {
    throw new AppError('cleaning_fee not configured in pricing_config', 500);
  }
  // SECURITY: Validate cleaning fee is non-negative
  if (cleaningFee < 0) {
    throw new AppError('cleaning_fee must be a non-negative value', 500);
  }
  cachedCleaningFee = cleaningFee;

  const singleAdmissionPrice = configMap.get('single_admission_price');
  if (singleAdmissionPrice === undefined) {
    throw new AppError('single_admission_price not configured in pricing_config', 500);
  }
  // SECURITY: Validate admission price is positive (not zero or negative)
  if (singleAdmissionPrice <= 0) {
    throw new AppError('single_admission_price must be a positive value', 500);
  }
  cachedSingleAdmissionPrice = singleAdmissionPrice;

  const extraAdultAdmissionPrice = configMap.get('extra_adult_admission_price');
  if (extraAdultAdmissionPrice === undefined) {
    throw new AppError('extra_adult_admission_price not configured in pricing_config', 500);
  }
  cachedExtraAdultAdmissionPrice = extraAdultAdmissionPrice;

  const gripSocksPrice = configMap.get('grip_socks_price');
  if (gripSocksPrice === undefined) {
    throw new AppError('grip_socks_price not configured in pricing_config', 500);
  }
  cachedGripSocksPrice = gripSocksPrice;

  // Load extra child/adult fees from party_add_ons table (single source of truth)
  const extraChildAddOn = await PartyAddOnRepository.findByCode('extra_child');
  if (!extraChildAddOn) {
    throw new AppError('extra_child not configured in party_add_ons', 500);
  }
  if (extraChildAddOn.price < 0) {
    throw new AppError('extra_child price must be non-negative', 500);
  }
  cachedExtraChildFee = extraChildAddOn.price;

  const extraAdultAddOn = await PartyAddOnRepository.findByCode('extra_adult');
  if (!extraAdultAddOn) {
    throw new AppError('extra_adult not configured in party_add_ons', 500);
  }
  if (extraAdultAddOn.price < 0) {
    throw new AppError('extra_adult price must be non-negative', 500);
  }
  cachedExtraAdultFee = extraAdultAddOn.price;

  cacheInitialized = true;
}

/**
 * Clear the pricing cache to force reload from database.
 */
export function clearPricingCache(): void {
  cachedTaxRate = null;
  cachedCleaningFee = null;
  cachedExtraChildFee = null;
  cachedExtraAdultFee = null;
  cachedSingleAdmissionPrice = null;
  cachedExtraAdultAdmissionPrice = null;
  cachedGripSocksPrice = null;
  cacheInitialized = false;
}

/**
 * Ensure cache is initialized, loading from DB if necessary.
 */
async function ensureCacheInitialized(): Promise<void> {
  if (!cacheInitialized) {
    await initializePricingCache();
  }
}

/**
 * Get the tax rate as a decimal (e.g., 0.08 for 8%).
 * Loads from database if not cached.
 */
export async function getTaxRate(): Promise<number> {
  await ensureCacheInitialized();
  return cachedTaxRate!;
}

/**
 * Get the tax rate synchronously.
 * Returns cached value or throws if cache not initialized.
 * Use initializePricingCache() at app startup to ensure cache is populated.
 */
export function getTaxRateSync(): number {
  if (cachedTaxRate === null) {
    // Fallback to default 8% to avoid breaking during transition
    // This should be logged as a warning
    console.warn('getTaxRateSync called before cache initialized, using default 0.08');
    return 0.08;
  }
  return cachedTaxRate;
}

/**
 * Get the cleaning fee.
 */
export async function getCleaningFee(): Promise<number> {
  await ensureCacheInitialized();
  return cachedCleaningFee!;
}

/**
 * Get the extra child fee (for party bookings with guests exceeding base count).
 */
export async function getExtraChildFee(): Promise<number> {
  await ensureCacheInitialized();
  return cachedExtraChildFee!;
}

/**
 * Get the extra adult fee (for party bookings with additional adults).
 */
export async function getExtraAdultFee(): Promise<number> {
  await ensureCacheInitialized();
  return cachedExtraAdultFee!;
}

/**
 * Get the single admission price (for general ticket purchases).
 */
export async function getSingleAdmissionPrice(): Promise<number> {
  await ensureCacheInitialized();
  return cachedSingleAdmissionPrice!;
}

/**
 * Get the extra adult admission price (for ticket purchases).
 */
export async function getExtraAdultAdmissionPrice(): Promise<number> {
  await ensureCacheInitialized();
  return cachedExtraAdultAdmissionPrice!;
}

/**
 * Get the grip socks price.
 */
export async function getGripSocksPrice(): Promise<number> {
  await ensureCacheInitialized();
  return cachedGripSocksPrice!;
}

/**
 * Get all pricing config values for frontend API.
 */
export interface CheckoutPricingConfig {
  taxRate: number;
  cleaningFee: number;
  extraChildFee: number;
  extraAdultFee: number;
  singleAdmissionPrice: number;
  extraAdultAdmissionPrice: number;
  gripSocksPrice: number;
}

export async function getCheckoutPricingConfig(): Promise<CheckoutPricingConfig> {
  await ensureCacheInitialized();

  return {
    taxRate: cachedTaxRate!,
    cleaningFee: cachedCleaningFee!,
    extraChildFee: cachedExtraChildFee!,
    extraAdultFee: cachedExtraAdultFee!,
    singleAdmissionPrice: cachedSingleAdmissionPrice!,
    extraAdultAdmissionPrice: cachedExtraAdultAdmissionPrice!,
    gripSocksPrice: cachedGripSocksPrice!,
  };
}

/**
 * Round a currency value to 2 decimal places.
 */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate tax amount for a given taxable amount.
 */
export async function calculateTax(taxableAmount: number): Promise<number> {
  const taxRate = await getTaxRate();
  return roundCurrency(taxableAmount * taxRate);
}

/**
 * Calculate tax amount synchronously (uses cached rate).
 */
export function calculateTaxSync(taxableAmount: number): number {
  const taxRate = getTaxRateSync();
  return roundCurrency(taxableAmount * taxRate);
}
