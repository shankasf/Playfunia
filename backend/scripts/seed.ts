import { DateTime } from 'luxon';
import { faker } from '@faker-js/faker';

import { connectDatabase } from '../src/config/database';
import { appConfig } from '../src/config/env';
import {
  AnnouncementModel,
  BookingModel,
  ChildModel,
  EventModel,
  FaqModel,
  MembershipModel,
  PartyPackageModel,
  TestimonialModel,
  TicketModel,
  UserModel,
} from '../src/models';
import { hashPassword } from '../src/utils/password';

async function seed() {
  await connectDatabase();

  console.info('Seeding database...');

  await BookingModel.deleteMany({});
  await ChildModel.deleteMany({});
  await FaqModel.deleteMany({});
  await TestimonialModel.deleteMany({});
  await AnnouncementModel.deleteMany({});
  await MembershipModel.deleteMany({});
  await EventModel.deleteMany({});
  await TicketModel.deleteMany({});
  await PartyPackageModel.deleteMany({});
  await UserModel.deleteMany({});

  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@playfunia.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'playfunia-admin';
  const adminHash = await hashPassword(adminPassword);

  const adminUser = await UserModel.create({
    firstName: 'Maya',
    lastName: 'Rivera',
    email: adminEmail,
    passwordHash: adminHash,
    roles: ['admin', 'staff'],
    phone: faker.phone.number(),
  });

  const passwordHash = await hashPassword('playfunia123');

  const guardian = await UserModel.create({
    firstName: 'Avery',
    lastName: 'Gardner',
    email: 'guardian@example.com',
    passwordHash,
    phone: faker.phone.number(),
    address: {
      line1: '123 Playground Ave',
      city: 'Funville',
      state: 'CA',
      postalCode: '90001',
    },
  });

  const children = await ChildModel.create([
    {
      firstName: 'Milo',
      lastName: 'Gardner',
      birthDate: faker.date.birthdate({ min: 4, max: 8, mode: 'age' }),
      guardian: guardian._id,
      membershipTier: 'silver',
    },
    {
      firstName: 'Luna',
      lastName: 'Gardner',
      birthDate: faker.date.birthdate({ min: 2, max: 6, mode: 'age' }),
      guardian: guardian._id,
      membershipTier: 'standard',
    },
  ]);

  guardian.children = children.map(child => child._id) as any;
  await guardian.save();

  const partyPackages = await PartyPackageModel.create([
    {
      name: 'MINI FUN',
      description:
        'Bring your own snacks/treats. Guests handle decorations, food, and party items. Up to 10 children included with exclusive private party room for 2 hours and unlimited all-day park access.',
      durationMinutes: 120,
      basePrice: 399,
      maxGuests: 10,
    },
    {
      name: 'SUPER FUN',
      description:
        'Party supplies included. Pizza (one slice of cheese) and drinks (water/juice) for every child. Snack tray (cookies and chips) to share. Up to 10 children with private party room for 2 hours and unlimited all-day park access.',
      durationMinutes: 120,
      basePrice: 599,
      maxGuests: 10,
    },
    {
      name: 'MEGA FUN',
      description:
        'Custom themed balloon decorations. Coordinated theme-matching tableware and extras. Pizza (one slice of cheese) and drinks (water/juice) for every child. Snack tray to share. Up to 10 children with private party room for 2 hours and unlimited all-day park access.',
      durationMinutes: 120,
      basePrice: 699,
      maxGuests: 10,
    },
  ]);

  await FaqModel.create([
    {
      question: 'Do I need to book in advance?',
      answer:
        'Walk-ins are welcome, but we recommend booking parties and special events in advance.',
      category: 'General',
      order: 1,
    },
    {
      question: 'Are grip socks required?',
      answer:
        'Yes, all guests must wear grip socks inside the play areas for safety. Grip socks (D-Socks) are available for purchase at $3.00.',
      category: 'Policies',
      order: 2,
    },
    {
      question: 'Can I bring my own decorations?',
      answer:
        'Yes, customers are welcome to bring their own decorations for private party rooms, but confetti or glitter are not allowed.',
      category: 'Policies',
      order: 3,
    },
    {
      question: 'How do I reschedule a party?',
      answer: 'Please contact us at least 48 hours in advance to reschedule a party.',
      category: 'Policies',
      order: 4,
    },
    {
      question: 'What are the additional costs for parties?',
      answer:
        'Each additional child beyond the base package is $40. Each additional adult guest is $10.',
      category: 'Parties',
      order: 5,
    },
    {
      question: 'What is your general admission pricing?',
      answer:
        'General admission (1 kid + 1 adult) is $20.00. Sibling discount is $35.00 for two siblings. Additional guests are $5.00.',
      category: 'General',
      order: 6,
    },
  ]);

  await TestimonialModel.create([
    {
      name: 'Meena P.',
      relationship: 'Parent',
      quote:
        'As a parent, I loved how safe and organized everything was. My kids just loved the slides and ball pit. 10/10 experience.',
      rating: 5,
      isFeatured: true,
    },
    {
      name: 'Adam W.',
      relationship: 'Parent',
      quote: 'Clean, cute & totally fun.',
      rating: 5,
      isFeatured: true,
    },
  ]);

  const memberships = await MembershipModel.create([
    {
      name: 'Silver',
      description: 'Great for light play families with weekday flexibility.',
      monthlyPrice: 79,
      benefits: ['8 visits / month', '5% off parties & camps', '1 guest pass each month'],
      maxChildren: 2,
      visitsPerMonth: 8,
      discountPercent: 5,
      guestPassesPerMonth: 1,
    },
    {
      name: 'Gold',
      description: 'Perfect for active families that come every week.',
      monthlyPrice: 119,
      benefits: ['12 visits / month', '10% off parties & camps', '2 guest passes each month'],
      maxChildren: 3,
      visitsPerMonth: 12,
      discountPercent: 10,
      guestPassesPerMonth: 2,
    },
    {
      name: 'Platinum',
      description: 'Frequent play plus VIP booking perks.',
      monthlyPrice: 159,
      benefits: ['16 visits / month', '15% off parties & camps', '3 guest passes each month'],
      maxChildren: 4,
      visitsPerMonth: 16,
      discountPercent: 15,
      guestPassesPerMonth: 3,
    },
    {
      name: 'VIP Platinum',
      description: 'Unlimited visits, early access events, and biggest perks.',
      monthlyPrice: 199,
      benefits: [
        'Unlimited visits',
        '20% off parties & camps',
        '4 guest passes each month',
        'Priority event access',
      ],
      maxChildren: 5,
      visitsPerMonth: null,
      discountPercent: 20,
      guestPassesPerMonth: 4,
    },
  ]);

  const membershipSelection = memberships[1];
  if (membershipSelection) {
    const membershipStart = DateTime.now();

    guardian.membership = {
      membershipId: membershipSelection._id as any,
      tierName: membershipSelection.name,
      startedAt: membershipStart.toJSDate(),
      expiresAt: membershipStart.plus({ months: 1 }).toJSDate(),
      autoRenew: true,
      visitsPerMonth: membershipSelection.visitsPerMonth ?? 0,
      visitsUsedThisPeriod: 0,
      visitPeriodStart: membershipStart.startOf('month').toJSDate(),
    };
    await guardian.save();
  }

  const upcomingDate = faker.date.soon({ days: 30 });
  upcomingDate.setHours(10, 0, 0, 0);

  const baseSubtotal = partyPackages[0]?.basePrice ?? 0;
  const cleaningFee = 50;
  const total = baseSubtotal + cleaningFee;
  const depositCents = Math.round((total * 100) / 2);
  const depositAmount = depositCents / 100;
  const balanceRemaining = total - depositAmount;

  await BookingModel.create({
    reference: `SEED-${Date.now()}`,
    guardian: guardian._id,
    children: children.map(child => child._id),
    partyPackage: partyPackages[0]?._id,
    location: 'Albany',
    eventDate: upcomingDate,
    startTime: '10:00',
    endTime: '12:00',
    guests: 12,
    notes: 'Allergy-friendly snacks only.',
    addOns: [],
    subtotal: baseSubtotal,
    cleaningFee,
    total,
    depositAmount,
    balanceRemaining,
    paymentStatus: 'deposit_paid',
    depositPaidAt: DateTime.now().minus({ days: 3 }).toJSDate(),
    status: 'confirmed',
  });

  const events = await EventModel.create([
    {
      title: 'Sensory Play Morning',
      description: 'A gentle sensory-friendly session for toddlers and parents.',
      startDate: DateTime.now().plus({ days: 7 }).set({ hour: 9, minute: 0 }).toJSDate(),
      endDate: DateTime.now().plus({ days: 7 }).set({ hour: 11, minute: 0 }).toJSDate(),
      location: 'Playfunia Main Hall',
      capacity: 25,
      ticketsRemaining: 25,
      price: 15,
      tags: ['sensory', 'toddlers'],
    },
    {
      title: 'STEM Explorer Workshop',
      description: 'Interactive STEM activities led by our Playfunia coaches.',
      startDate: DateTime.now().plus({ days: 14 }).set({ hour: 13, minute: 0 }).toJSDate(),
      endDate: DateTime.now().plus({ days: 14 }).set({ hour: 15, minute: 0 }).toJSDate(),
      location: 'Innovation Lab',
      capacity: 30,
      ticketsRemaining: 30,
      price: 25,
      tags: ['STEM', 'school-age'],
    },
    {
      title: 'Family Glow Party',
      description: 'Evening party with glow-in-the-dark games and music.',
      startDate: DateTime.now().plus({ days: 21 }).set({ hour: 18, minute: 0 }).toJSDate(),
      endDate: DateTime.now().plus({ days: 21 }).set({ hour: 20, minute: 0 }).toJSDate(),
      location: 'Playfunia Arena',
      capacity: 50,
      ticketsRemaining: 50,
      price: 35,
      tags: ['family', 'party'],
    },
  ]);

  await TicketModel.create({
    guardian: guardian._id,
    type: 'event',
    event: events[0]?._id,
    quantity: 2,
    price: 15,
    total: 30,
    codes: [
      { code: 'SEED-TICKET-001', status: 'unused' as const },
      { code: 'SEED-TICKET-002', status: 'unused' as const },
    ],
    status: 'paid',
  });

  if (events[0]) {
    events[0].ticketsRemaining -= 2;
    await events[0].save();
  }

  await AnnouncementModel.create([
    {
      title: 'Winter Camp Registration Open',
      body: 'Reserve your spot for our week-long winter camp packed with STEM fun and indoor adventures.',
      publishDate: DateTime.now().minus({ days: 2 }).toJSDate(),
      expiresAt: DateTime.now().plus({ weeks: 3 }).toJSDate(),
    },
    {
      title: 'New Toddler Zone Launched',
      body: 'We have expanded our toddler-friendly zone with soft play and sensory activities.',
      publishDate: DateTime.now().minus({ days: 10 }).toJSDate(),
      isActive: true,
    },
  ]);

  console.info('Seed data created successfully.');
}

seed()
  .then(() => {
    console.info('Seeding complete. You can log in with guardian@example.com / playfunia123');
    console.info(`Admin login available: ${adminUser.email} / ${adminPassword}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Seeding failed', error);
    process.exit(1);
  });
