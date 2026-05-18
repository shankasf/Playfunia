import {
  Announcement,
  EventItem,
  FaqItem,
  MembershipPlan,
  PartyPackage,
  PastEventHighlight,
  SocialPost,
  Testimonial,
} from './types';

export const sampleMemberships: MembershipPlan[] = [
  {
    id: 'mini',
    name: 'Mini Plan',
    description: 'Includes 1 Kid + 1 Adult',
    monthlyPrice: 125,
    originalPrice: 250,
    promoLabel: 'LIMITED TIME - 50% OFF',
    benefits: [
      'Unlimited open play visits',
      '1 Kid + 1 Adult included',
      'Grip socks included',
      'Access to all play areas',
    ],
    maxChildren: 1,
  },
  {
    id: 'super',
    name: 'Super Plan',
    description: 'Includes 2 Kids + 2 Adults',
    monthlyPrice: 220,
    originalPrice: 440,
    promoLabel: 'LIMITED TIME - 50% OFF',
    benefits: [
      'Unlimited open play visits',
      '2 Kids + 2 Adults included',
      'Grip socks included',
      'Access to all play areas',
      'Priority event access',
    ],
    maxChildren: 2,
  },
  {
    id: 'mega',
    name: 'Mega Plan',
    description: 'Includes 3 Kids + 3 Adults',
    monthlyPrice: 315,
    originalPrice: 630,
    promoLabel: 'LIMITED TIME - 50% OFF',
    benefits: [
      'Unlimited open play visits',
      '3 Kids + 3 Adults included',
      'Grip socks included',
      'Access to all play areas',
      'Priority event access',
      'VIP party discounts',
    ],
    maxChildren: 3,
  },
];

export const samplePackages: PartyPackage[] = [
  {
    id: 'mini-fun',
    name: 'Mini Fun',
    description:
      'Bring your own snacks and party treats. We provide the room, the hosts, and the clean-up so you can celebrate.',
    durationMinutes: 120,
    basePrice: 399,
    maxGuests: 10,
  },
  {
    id: 'super-fun',
    name: 'Super Fun (Popular)',
    description:
      'Party supplies, cheese pizza, drinks, and a snack tray are ready when you arrive. Our hosts take care of every detail.',
    durationMinutes: 120,
    basePrice: 599,
    maxGuests: 10,
  },
  {
    id: 'mega-fun',
    name: 'Mega Fun (Exclusive)',
    description:
      'Custom themed balloons, matching tableware, pizza, drinks, and snacks for every child. Maximum wow factor with zero stress.',
    durationMinutes: 120,
    basePrice: 699,
    maxGuests: 10,
  },
];

const now = new Date();

export const sampleEvents: EventItem[] = [
  {
    id: 'sensory-sunday',
    title: 'Sensory-Friendly Sunday',
    description:
      'Lower lights, calming music, and extra staffing for guests who prefer a gentler atmosphere.',
    startDate: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 2,
      9,
      0,
      0
    ).toISOString(),
    endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 11, 0, 0).toISOString(),
  },
  {
    id: 'glow-party',
    title: 'Glow Party Friday',
    description: 'Neon games, black lights, and a live DJ to kick off the weekend at PlayFunia.',
    startDate: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 5,
      18,
      0,
      0
    ).toISOString(),
    endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 20, 0, 0).toISOString(),
  },
  {
    id: 'character-day',
    title: 'Character Meet & Greet',
    description: 'Snap photos in the party room and enjoy themed crafts with surprise guests.',
    startDate: new Date(now.getFullYear(), now.getMonth() + 1, 3, 13, 0, 0).toISOString(),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 3, 15, 0, 0).toISOString(),
  },
];

export const sampleTestimonials: Testimonial[] = [
  {
    id: 'testimonial-meena',
    name: 'Meena P.',
    relationship: 'Parent',
    quote:
      'As a parent, I loved how safe and organized everything was. My kids just loved the slides and ball pit.',
    rating: 5,
    isFeatured: true,
  },
  {
    id: 'testimonial-adam',
    name: 'Adam W.',
    relationship: 'Family Member',
    quote: 'Clean, cute, and totally fun. The Playfunia team made our birthday party stress-free.',
    rating: 5,
  },
  {
    id: 'testimonial-sasha',
    name: 'Sasha R.',
    relationship: 'Teacher',
    quote:
      'We hosted a class field trip and the staff handled every detail from check-in to clean-up.',
    rating: 5,
  },
];

export const sampleFaqs: FaqItem[] = [
  {
    id: 'faq-waiver',
    question: 'Do we need to sign a waiver?',
    answer: 'Yes. Every participant must have a signed waiver before entering the play areas.',
  },
  {
    id: 'faq-decor',
    question: 'Can we bring our own decorations?',
    answer:
      'Absolutely! Private party rooms are yours to personalize. Please skip confetti and glitter.',
  },
  {
    id: 'faq-reschedule',
    question: 'What is the rescheduling policy?',
    answer:
      'Contact us at least 48 hours before your party and we will gladly help you move the celebration.',
  },
  {
    id: 'faq-food',
    question: 'Are outside food and drinks allowed?',
    answer:
      'Outside food is welcome with the Mini Fun package or when noted in advance. Every party includes water and juice.',
  },
];

export const sampleAnnouncements: Announcement[] = [
  {
    id: 'announcement-sensory',
    title: 'Sensory-Friendly Sundays',
    body: 'Reserve limited-capacity sessions with softer lighting, calming music, and extra staff support.',
    publishDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).toISOString(),
    linkLabel: 'Reserve your spot',
    linkHref: '/events',
  },
  {
    id: 'announcement-cleaning',
    title: 'Birthday Week Bonus',
    body: 'Book a party this month and receive complimentary grip socks for up to 10 guests.',
    publishDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString(),
    linkLabel: 'Book a party',
    linkHref: '/book-party',
  },
  {
    id: 'announcement-teacher',
    title: 'Teacher Tuesdays',
    body: 'Educators play for free with any paid child admission every Tuesday at both locations.',
    publishDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10).toISOString(),
  },
];

export const sampleSocialPosts: SocialPost[] = [
  {
    id: 'social-glow',
    imageUrl:
      'https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=600&q=80',
    caption: "Sneak peek of tonight's Glow Party setup!",
    link: 'https://instagram.com',
  },
  {
    id: 'social-stem',
    imageUrl:
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80',
    caption: 'STEM explorers testing their coding critters in the toddler zone.',
    link: 'https://instagram.com',
  },
  {
    id: 'social-sensory',
    imageUrl:
      'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=600&q=80',
    caption: 'Sensory-friendly mornings mean big smiles for every kiddo.',
    link: 'https://instagram.com',
  },
];

export const samplePastEvents: PastEventHighlight[] = [
  {
    id: 'past-superhero',
    title: 'Superhero Training Camp',
    description: 'Kids mastered obstacle courses and earned hero badges in the trampoline arena.',
    imageUrl:
      'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=700&q=80',
    date: 'June 2025',
  },
  {
    id: 'past-stem',
    title: 'STEM Discovery Day',
    description:
      'Families explored circuits, slime chemistry, and rocket launches in our STEM corner.',
    imageUrl:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=700&q=80',
    date: 'May 2025',
  },
  {
    id: 'past-winter',
    title: 'Winter Wonderland Bash',
    description: 'A snowy indoor party with character visits, snowball games, and a hot cocoa bar.',
    imageUrl:
      'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=700&q=80',
    date: 'December 2024',
  },
];
