import { useEffect, useState } from "react";

import { apiGet } from "../api/client";
import {
  sampleAnnouncements,
  sampleEvents,
  sampleFaqs,
  sampleMemberships,
  samplePackages,
  sampleTestimonials,
} from "../data/sampleData";
import type {
  Announcement,
  EventItem,
  FaqItem,
  MembershipPlan,
  PartyPackage,
  Testimonial,
} from "../data/types";

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

export function useHomeContent(): HomeContent {
  const [memberships, setMemberships] = useState<FetchState<MembershipPlan[]>>({
    data: sampleMemberships,
    isLoading: true,
  });
  const [packages, setPackages] = useState<FetchState<PartyPackage[]>>({
    data: samplePackages,
    isLoading: true,
  });
  const [events, setEvents] = useState<FetchState<EventItem[]>>({
    data: sampleEvents,
    isLoading: true,
  });
  const [testimonials, setTestimonials] = useState<FetchState<Testimonial[]>>({
    data: sampleTestimonials,
    isLoading: true,
  });
  const [faqs, setFaqs] = useState<FetchState<FaqItem[]>>({
    data: sampleFaqs,
    isLoading: true,
  });
  const [announcements, setAnnouncements] = useState<FetchState<Announcement[]>>({
    data: sampleAnnouncements,
    isLoading: true,
  });

  useEffect(() => {
    let isCancelled = false;

    async function fetchContent() {
      try {
        const [membershipRes, packageRes, eventRes, testimonialRes, faqRes, announcementRes] = await Promise.all([
          apiGet<{ memberships: MembershipPlan[] }>("/memberships"),
          apiGet<{ packages: PartyPackage[] }>("/party-packages"),
          apiGet<{ events: EventItem[] }>("/events"),
          apiGet<{ testimonials: Testimonial[] }>("/content/testimonials"),
          apiGet<{ faqs: FaqItem[] }>("/content/faqs"),
          apiGet<{ announcements: Announcement[] }>("/content/announcements"),
        ]);

        if (isCancelled) return;

        const membershipData =
          (membershipRes as { memberships?: MembershipPlan[] }).memberships ?? (membershipRes as unknown as MembershipPlan[]);
        const packageData =
          (packageRes as { packages?: PartyPackage[] }).packages ?? (packageRes as unknown as PartyPackage[]);
        const eventData = (eventRes as { events?: EventItem[] }).events ?? (eventRes as unknown as EventItem[]);
        const testimonialData =
          (testimonialRes as { testimonials?: Testimonial[] }).testimonials ?? (testimonialRes as unknown as Testimonial[]);
        const faqData = (faqRes as { faqs?: FaqItem[] }).faqs ?? (faqRes as unknown as FaqItem[]);
        const announcementData =
          (announcementRes as { announcements?: Announcement[] }).announcements ??
          (announcementRes as unknown as Announcement[]);

        setMemberships({ data: membershipData, isLoading: false });
        setPackages({ data: packageData, isLoading: false });
        setEvents({ data: eventData, isLoading: false });
        setTestimonials({ data: testimonialData, isLoading: false });
        setFaqs({ data: faqData, isLoading: false });
        setAnnouncements({ data: announcementData, isLoading: false });
      } catch (error) {
        console.warn("Falling back to sample content", error);
        if (!isCancelled) {
          setMemberships(prev => ({ ...prev, isLoading: false }));
          setPackages(prev => ({ ...prev, isLoading: false }));
          setEvents(prev => ({ ...prev, isLoading: false }));
          setTestimonials(prev => ({ ...prev, isLoading: false }));
          setFaqs(prev => ({ ...prev, isLoading: false }));
          setAnnouncements(prev => ({ ...prev, isLoading: false }));
        }
      }
    }

    fetchContent();

    return () => {
      isCancelled = true;
    };
  }, []);

  return {
    memberships,
    packages,
    events,
    testimonials,
    faqs,
    announcements,
  };
}
