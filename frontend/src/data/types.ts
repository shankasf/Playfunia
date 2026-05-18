export interface MembershipPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  originalPrice?: number;
  promoLabel?: string;
  promoNote?: string;
  promoEndsAt?: string;
  promoSpotsLeft?: number;
  benefits: string[];
  maxChildren: number;
  visitsPerMonth?: number;
}

export interface PartyPackage {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  basePrice: number;
  maxGuests: number;
}

export interface EventItem {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  imageUrl?: string;
  hasMedia?: boolean;
}

export interface EventPhoto {
  id: number;
  url: string;
  caption: string | null;
  mediaType: 'image' | 'video';
}

export interface Testimonial {
  id: string;
  name: string;
  relationship?: string;
  quote: string;
  rating?: number;
  isFeatured?: boolean;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  publishDate: string;
  linkLabel?: string;
  linkHref?: string;
}

export interface SocialPost {
  id: string;
  imageUrl: string;
  caption: string;
  link: string;
}

export interface PastEventHighlight {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  date: string;
}

