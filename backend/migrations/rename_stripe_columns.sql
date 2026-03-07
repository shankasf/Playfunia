-- Migration: Rename legacy Stripe column names to provider-generic names
-- Date: 2026-02-08
-- Context: After migrating from Stripe to Square, several columns still have
--          "stripe_" naming but now store Square payment IDs. This migration
--          renames them to provider-generic names.
--
-- IMPORTANT: Run this migration during a maintenance window.
-- All renames preserve existing data.

BEGIN;

-- 1. party_bookings: latest_payment_intent_id -> latest_payment_id
--    This column stores Square payment IDs (not Stripe payment intents).
ALTER TABLE party_bookings
  RENAME COLUMN latest_payment_intent_id TO latest_payment_id;

-- 2. app_payments: stripe_payment_intent_id -> provider_payment_id
--    This column stores Square payment IDs for app-level payments.
ALTER TABLE app_payments
  RENAME COLUMN stripe_payment_intent_id TO provider_payment_id;

-- 3. ticket_purchases: stripe_payment_intent_id -> provider_payment_id
--    Dead column post-migration, but rename for consistency.
ALTER TABLE ticket_purchases
  RENAME COLUMN stripe_payment_intent_id TO provider_payment_id;

-- 4. memberships: Drop stripe_subscription_id
--    This column is no longer used (Square doesn't have subscriptions).
--    Keeping it would cause confusion. Historical data is not meaningful
--    since no Stripe subscriptions were ever created in production.
ALTER TABLE memberships
  DROP COLUMN IF EXISTS stripe_subscription_id;

COMMIT;
