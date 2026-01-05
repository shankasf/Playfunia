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
    id: 'silver',
    name: 'Silver Play Pass',
    description: 'Perfect for little adventurers who visit a couple of times each month.',
    monthlyPrice: 45,
    benefits: [
      '2 weekday visits each month',
      'Playtime for one child and one grown-up',
      '5% off grip socks and cafe purchases',
      'Automatic waiver reminders before expiration',
    ],
    maxChildren: 1,
    visitsPerMonth: 2,
  },
  {
    id: 'gold',
    name: 'Gold Family Membership',
    description: 'Great for siblings who love to bounce, climb, and create together.',
    monthlyPrice: 65,
    benefits: [
      '4 anytime visits each month',
      'Includes up to two children',
      '10% off party add-ons and camps',
      'Two guest play passes every quarter',
    ],
    maxChildren: 2,
    visitsPerMonth: 4,
  },
  {
    id: 'platinum',
    name: 'Platinum Adventure Club',
    description: 'Unlimited weekday play with bonus perks for busy families.',
    monthlyPrice: 95,
    benefits: [
      'Unlimited weekday visits',
      'Priority booking for parties and events',
      'Complimentary grip socks for members',
      'Invite a buddy once per month for free',
    ],
    maxChildren: 3,
    visitsPerMonth: 12,
  },
  {
    id: 'vip-platinum',
    name: 'VIP Platinum All-Access',
    description: 'Best value for families who practically live at Playfunia.',
    monthlyPrice: 135,
    benefits: [
      'Unlimited visits any day of the week',
      'Monthly character meet-and-greet included',
      '15% off parties, camps, and merch',
      'Dedicated concierge for event planning',
    ],
    maxChildren: 4,
    visitsPerMonth: undefined,
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
    location: 'Playfunia - Poughkeepsie, NY',
    price: 20,
    tags: ['sensory', 'inclusive'],
  },
  {
    id: 'glow-party',
    title: 'Glow Party Friday',
    description: 'Neon games, black lights, and a live DJ to kick off the weekend in Deptford.',
    startDate: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 5,
      18,
      0,
      0
    ).toISOString(),
    endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 20, 0, 0).toISOString(),
    location: 'Playfunia - Deptford, NJ',
    price: 25,
    tags: ['party', 'family'],
  },
  {
    id: 'character-day',
    title: 'Character Meet & Greet',
    description: 'Snap photos in the party room and enjoy themed crafts with surprise guests.',
    startDate: new Date(now.getFullYear(), now.getMonth() + 1, 3, 13, 0, 0).toISOString(),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 3, 15, 0, 0).toISOString(),
    location: 'Playfunia - Poughkeepsie, NY',
    price: 18,
    tags: ['character', 'photo-op'],
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
