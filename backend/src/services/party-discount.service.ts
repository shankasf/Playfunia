import { DateTime } from 'luxon';

import { PricingConfigRepository } from '../repositories';
import { roundCurrency } from './pricing-config.service';

// Weekday party discount: party packages booked for Monday-Friday get a
// percentage off the package base price. Add-ons, extra guests, cleaning fee
// and tax are not discounted. The percentage lives in pricing_config so it can
// be changed (or set to 0 to switch the promo off) without a deploy.
const ET_ZONE = 'America/New_York';
const WEEKDAY_DISCOUNT_CONFIG_KEY = 'weekday_party_discount_percent';
const DEFAULT_WEEKDAY_DISCOUNT_PERCENT = 50;

export interface PartyPackagePrice {
  originalPrice: number;
  price: number;
  discount: number;
  discountPercent: number;
  isWeekdayDiscount: boolean;
}

export async function getWeekdayPartyDiscountPercent(): Promise<number> {
  const value = Number(
    await PricingConfigRepository.getValue(WEEKDAY_DISCOUNT_CONFIG_KEY, DEFAULT_WEEKDAY_DISCOUNT_PERCENT)
  );
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * True when the party date falls Monday-Friday in Eastern Time.
 * Accepts a calendar date string (YYYY-MM-DD, anything after is ignored) or a
 * luxon DateTime. A bare date string is parsed as an ET calendar date, never
 * as UTC, so it cannot shift to the neighbouring day.
 */
export function isWeekdayPartyDate(eventDate: string | DateTime): boolean {
  const date = typeof eventDate === 'string'
    ? DateTime.fromISO(eventDate.slice(0, 10), { zone: ET_ZONE })
    : eventDate.setZone(ET_ZONE);
  if (!date.isValid) return false;
  return date.weekday >= 1 && date.weekday <= 5; // luxon: 1=Mon ... 7=Sun
}

/**
 * Package base price for a given party date. Without a date there is nothing
 * to decide on, so the regular price is returned.
 */
export async function getPartyPackagePrice(
  basePrice: number,
  eventDate?: string | DateTime | null
): Promise<PartyPackagePrice> {
  const originalPrice = Number(basePrice) || 0;
  const discountPercent = await getWeekdayPartyDiscountPercent();
  const applies = eventDate != null && discountPercent > 0 && isWeekdayPartyDate(eventDate);
  const discount = applies ? roundCurrency(originalPrice * (discountPercent / 100)) : 0;

  return {
    originalPrice,
    price: roundCurrency(originalPrice - discount),
    discount,
    discountPercent,
    isWeekdayDiscount: applies,
  };
}
