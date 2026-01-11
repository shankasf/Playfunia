import useSWR from 'swr';
import { SWR_KEYS } from '../lib/swr';
import type { AllPricing, PricingConfig, PartyAddOnPricing } from '../api/pricing';

/**
 * Hook to fetch all pricing data with SWR caching
 * Provides instant cached data on page refresh
 */
export function usePricing() {
  const { data, isLoading, error, mutate } = useSWR<AllPricing>(
    SWR_KEYS.pricing,
    {
      // Pricing data changes infrequently, cache for longer
      dedupingInterval: 30000, // 30 seconds
      revalidateOnFocus: false,
    }
  );

  return {
    pricing: data,
    isLoading,
    error,
    refresh: mutate,
  };
}

/**
 * Hook to fetch pricing config only
 */
export function usePricingConfig() {
  const { data, isLoading, error } = useSWR<{ config: PricingConfig }>(
    SWR_KEYS.pricingConfig,
    {
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    }
  );

  return {
    config: data?.config,
    isLoading,
    error,
  };
}

/**
 * Hook to fetch party add-ons only
 */
export function usePartyAddOns() {
  const { data, isLoading, error } = useSWR<{ addOns: PartyAddOnPricing[] }>(
    SWR_KEYS.partyAddOns,
    {
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    }
  );

  return {
    addOns: data?.addOns ?? [],
    isLoading,
    error,
  };
}
