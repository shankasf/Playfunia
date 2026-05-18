-- Seed the public.faqs and public.announcements tables.
-- Source: frontend/src/data/sampleData.ts (the hardcoded fallback the website
-- has been showing because the DB tables were empty), expanded with a few
-- common-sense FAQs that cover gaps the sample didn't address (socks, age,
-- payment, group bookings).

-- Idempotent: deletes any existing rows for the seeded categories so this
-- script can be re-run safely.

BEGIN;

DELETE FROM public.faqs WHERE category IN ('general','party','admission','membership');

INSERT INTO public.faqs (question, answer, category, display_order, is_active) VALUES
  -- From sampleFaqs
  ('Do we need to sign a waiver?',
   'Yes. Every participant must have a signed waiver before entering the play areas. Waivers can be completed online ahead of time or at check-in, and parents/guardians sign on behalf of minors.',
   'admission', 10, TRUE),

  ('Can we bring our own decorations?',
   'Absolutely. Private party rooms are yours to personalize. Please skip confetti and glitter — they are very difficult to clean up and can damage the play equipment.',
   'party', 10, TRUE),

  ('What is the rescheduling policy?',
   'Contact us at least 48 hours before your party and we will gladly help you move the celebration to another available date. Deposits transfer to the rescheduled date.',
   'party', 20, TRUE),

  ('Are outside food and drinks allowed?',
   'Outside food is welcome with the Mini Fun package or when arranged in advance. The Super Fun and Mega Fun packages include pizza and drinks for every child. Please let us know about allergies when booking.',
   'party', 30, TRUE),

  -- Gap-fill additions
  ('Are grip socks required?',
   'Yes — grip socks are required for everyone entering the play areas, children and adults alike. You may bring your own or purchase a pair at the front desk for $3.',
   'admission', 20, TRUE),

  ('What is the age range for kids at Playfunia?',
   'Playfunia is designed for children aged 1 to 13. Younger toddlers and older kids alike will find areas suited to them. Adult supervision is required for children under 5 at all times.',
   'admission', 30, TRUE),

  ('Do parents and adults need to pay admission?',
   'One adult is included free with each paid child admission. Additional adults are $5 each. Membership plans cover a set number of adults — see plan details for specifics.',
   'admission', 40, TRUE),

  ('How far in advance should we book a party?',
   'We recommend booking at least 3–4 weeks ahead, especially for weekend slots. Popular dates around school breaks and holidays book even further out.',
   'party', 40, TRUE),

  ('Is there a deposit required to book a party?',
   'Yes. A 50% deposit is required at the time of booking to reserve the party room. The remaining balance is due on the day of the event.',
   'party', 50, TRUE),

  ('What forms of payment do you accept?',
   'We accept all major credit cards (Visa, Mastercard, American Express, Discover) for both online bookings and on-site purchases.',
   'general', 10, TRUE),

  ('Can I cancel my membership at any time?',
   'Memberships are month-to-month and can be cancelled before the next billing cycle. There are no long-term commitments or cancellation fees.',
   'membership', 10, TRUE),

  ('Do you offer group rates or school field trips?',
   'Yes, we host group visits and school field trips. For groups of 10 or more, please contact us directly to arrange custom pricing and scheduling.',
   'general', 20, TRUE);

DELETE FROM public.announcements WHERE title IN
  ('Sensory-Friendly Sundays','Birthday Week Bonus','Teacher Tuesdays');

INSERT INTO public.announcements (title, body, publish_date, expires_at, is_active) VALUES
  ('Sensory-Friendly Sundays',
   'Reserve limited-capacity sessions with softer lighting, calming music, and extra staff support. A welcoming environment for children who prefer a quieter play experience.',
   now() - INTERVAL '2 days',
   NULL,
   TRUE),

  ('Birthday Week Bonus',
   'Book a birthday party this month and receive complimentary grip socks for up to 10 guests.',
   now() - INTERVAL '7 days',
   now() + INTERVAL '30 days',
   TRUE),

  ('Teacher Tuesdays',
   'Educators play for free with any paid child admission every Tuesday. Just show your school ID at the front desk.',
   now() - INTERVAL '10 days',
   NULL,
   TRUE);

COMMIT;

\echo Seeded counts:
SELECT 'faqs' AS table_name, count(*) AS rows FROM public.faqs
UNION ALL
SELECT 'announcements', count(*) FROM public.announcements;
