import type { SWRConfiguration } from 'swr';
import { apiGet } from '../api/client';

/**
 * SWR fetcher using our API client
 * Supports both simple paths and paths with response extraction
 */
export async function swrFetcher<T>(path: string): Promise<T> {
  return apiGet<T>(path);
}

/**
 * Default SWR configuration for optimal performance
 * - revalidateOnFocus: refresh data when tab regains focus
 * - revalidateOnReconnect: refresh when network reconnects
 * - dedupingInterval: dedupe requests within 2 seconds
 * - focusThrottleInterval: throttle focus revalidation to 5 seconds
 */
export const swrConfig: SWRConfiguration = {
  fetcher: swrFetcher,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 2000,
  focusThrottleInterval: 5000,
  // Keep previous data while revalidating for instant UI
  keepPreviousData: true,
  // Error retry configuration
  errorRetryCount: 3,
  errorRetryInterval: 1000,
};

/**
 * Cache keys for SWR - centralized for consistency
 */
export const SWR_KEYS = {
  memberships: '/memberships',
  partyPackages: '/party-packages',
  events: '/events',
  testimonials: '/content/testimonials',
  faqs: '/content/faqs',
  announcements: '/content/announcements',
  instagram: '/content/instagram',
  pricing: '/pricing',
  pricingConfig: '/pricing/config',
  partyAddOns: '/pricing/party-add-ons',
  ticketBundles: '/pricing/tickets',
} as const;
