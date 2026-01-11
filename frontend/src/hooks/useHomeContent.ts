import useSWR from 'swr';

import { SWR_KEYS } from '../lib/swr';
import {
  sampleAnnouncements,
  sampleEvents,
  sampleFaqs,
  sampleMemberships,
  samplePackages,
  sampleTestimonials,
} from '../data/sampleData';
import type {
  Announcement,
  EventItem,
  FaqItem,
  MembershipPlan,
  PartyPackage,
  Testimonial,
} from '../data/types';

type FetchState<T> = {
  data: T;
  isLoading: boolean;
};

interface HomeContent {
  memberships: FetchState<MembershipPlan[]>;
  packages: FetchState<PartyPackage[]>;
  events: FetchState<EventItem[]>;
  testimonials: FetchState<Testimonial[]>;
  faqs: FetchState<FaqItem[]>;
  announcements: FetchState<Announcement[]>;
}

/**
 * Extract data from API response, handling both wrapped and unwrapped formats
 */
function extractData<T>(response: unknown, key: string): T[] {
  if (!response) return [];
  const obj = response as Record<string, unknown>;
  return (obj[key] ?? response) as T[];
}

/**
 * Hook to fetch all home page content with SWR caching
 *
 * Benefits:
 * - Instant page refresh: cached data shows immediately
 * - Automatic revalidation in background
 * - Request deduplication
 * - Focus/reconnect revalidation
 */
export function useHomeContent(): HomeContent {
  // Use SWR for each content type - requests are deduped and cached
  const { data: membershipRes, isLoading: membershipsLoading } = useSWR<{ memberships: MembershipPlan[] }>(
    SWR_KEYS.memberships,
    { fallbackData: { memberships: sampleMemberships } }
  );

  const { data: packageRes, isLoading: packagesLoading } = useSWR<{ packages: PartyPackage[] }>(
    SWR_KEYS.partyPackages,
    { fallbackData: { packages: samplePackages } }
  );

  const { data: eventRes, isLoading: eventsLoading } = useSWR<{ events: EventItem[] }>(
    SWR_KEYS.events,
    { fallbackData: { events: sampleEvents } }
  );

  const { data: testimonialRes, isLoading: testimonialsLoading } = useSWR<{ testimonials: Testimonial[] }>(
    SWR_KEYS.testimonials,
    { fallbackData: { testimonials: sampleTestimonials } }
  );

  const { data: faqRes, isLoading: faqsLoading } = useSWR<{ faqs: FaqItem[] }>(
    SWR_KEYS.faqs,
    { fallbackData: { faqs: sampleFaqs } }
  );

  const { data: announcementRes, isLoading: announcementsLoading } = useSWR<{ announcements: Announcement[] }>(
    SWR_KEYS.announcements,
    { fallbackData: { announcements: sampleAnnouncements } }
  );

  return {
    memberships: {
      data: extractData<MembershipPlan>(membershipRes, 'memberships'),
      isLoading: membershipsLoading,
    },
    packages: {
      data: extractData<PartyPackage>(packageRes, 'packages'),
      isLoading: packagesLoading,
    },
    events: {
      data: extractData<EventItem>(eventRes, 'events'),
      isLoading: eventsLoading,
    },
    testimonials: {
      data: extractData<Testimonial>(testimonialRes, 'testimonials'),
      isLoading: testimonialsLoading,
    },
    faqs: {
      data: extractData<FaqItem>(faqRes, 'faqs'),
      isLoading: faqsLoading,
    },
    announcements: {
      data: extractData<Announcement>(announcementRes, 'announcements'),
      isLoading: announcementsLoading,
    },
  };
}
