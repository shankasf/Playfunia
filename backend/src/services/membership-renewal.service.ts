/**
 * Membership Renewal & Reminder Service
 *
 * Sends automated reminder emails for expiring memberships:
 * - 3 days before expiration
 * - 1 day before expiration
 * - On expiration day (with renewal instructions if auto_renew enabled)
 *
 * Handles grace period and expiration:
 * - Sets grace_period_end = end_date + 2 days for auto-renew memberships
 * - Marks memberships as expired after grace period
 * - Activates queued (pending) memberships when current one expires
 *
 * Runs once daily via setInterval (24-hour interval).
 * Idempotency: appends date to reminder_type (e.g., three_days_2026-04-15).
 */

import { DateTime } from 'luxon';
import { MembershipRepository, MembershipPlanRepository } from '../repositories';
import { supabase, supabaseAny } from '../config/supabase';
import { sendMembershipExpirationReminder, sendMembershipExpiredNotice } from './email.service';
import { sendMembershipExpiryReminderSms } from './sms.service';
import { logger } from '../utils/logger';

const BUSINESS_TZ = 'America/New_York';

// Scheduler state
let reminderInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

// Tier name mapping (same as membership.service.ts)
const REVERSE_TIER_MAP: Record<string, string[]> = {
  'mini': ['Mini Plan'],
  'super': ['Super Plan'],
  'mega': ['Mega Plan'],
  'explorer': ['Silver'],
  'adventurer': ['Gold'],
  'champion': ['Platinum', 'VIP Platinum'],
  'promo_1kid': ['Promo - 1 Kid + 1 Adult'],
  'promo_2kids': ['Promo - 2 Kids + 2 Adults'],
  'promo_3kids': ['Promo - 3 Kids + 3 Adults'],
};

function getTodayET(): string {
  return DateTime.now().setZone(BUSINESS_TZ).toISODate()!;
}

function addDaysToDate(dateStr: string, days: number): string {
  return DateTime.fromISO(dateStr).plus({ days }).toISODate()!;
}

async function getPlanNameForTier(tier: string): Promise<string> {
  const plans = await MembershipPlanRepository.findAll(true);
  const planNames = REVERSE_TIER_MAP[tier] ?? [];
  const plan = plans.find(p => planNames.includes(p.name));
  return plan?.name ?? tier;
}

/**
 * Check if a reminder was already sent for a specific membership + type + date combo.
 */
async function reminderAlreadySent(membershipId: number, reminderKey: string): Promise<boolean> {
  const { data } = await supabase
    .from('membership_reminders')
    .select('reminder_id')
    .eq('membership_id', membershipId)
    .eq('reminder_type', reminderKey)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * Record a reminder as sent.
 */
async function recordReminder(membershipId: number, reminderKey: string, method: string, status: string, errorMessage?: string) {
  await supabase
    .from('membership_reminders')
    .insert({
      membership_id: membershipId,
      reminder_type: reminderKey,
      notification_method: method,
      status,
      error_message: errorMessage ?? null,
    });
}

/**
 * Main processing function.
 */
export async function processMembershipRenewals(): Promise<{
  reminders: number;
  expired: number;
  activated: number;
  errors: number;
}> {
  const result = { reminders: 0, expired: 0, activated: 0, errors: 0 };

  if (isProcessing) {
    logger.warn('Membership renewals already processing, skipping');
    return result;
  }

  isProcessing = true;

  try {
    const today = getTodayET();
    const threeDaysFromNow = addDaysToDate(today, 3);
    const oneDayFromNow = addDaysToDate(today, 1);

    // 1. Send 3-day reminders
    const threeDayExpiring = await MembershipRepository.findExpiringBetween(threeDaysFromNow, threeDaysFromNow);
    for (const m of threeDayExpiring) {
      const key = `three_days_${threeDaysFromNow}`;
      try {
        if (await reminderAlreadySent(m.membership_id, key)) continue;
        const customer = (m as unknown as { customers?: { full_name?: string; email?: string; phone?: string } }).customers;
        if (!customer?.email) continue;

        const tierName = await getPlanNameForTier(m.tier);
        const endDateET = DateTime.fromISO(m.end_date!).setZone(BUSINESS_TZ).toLocaleString(DateTime.DATE_FULL);
        const customerName = customer.full_name?.split(' ')[0] ?? 'Member';

        await sendMembershipExpirationReminder({
          email: customer.email,
          customerName,
          tierName,
          expirationDate: endDateET,
          daysRemaining: 3,
          autoRenew: m.auto_renew ?? false,
          displayId: m.display_id ?? undefined,
        });

        let smsSent = false;
        if (customer.phone) {
          smsSent = await sendMembershipExpiryReminderSms({
            phone: customer.phone,
            customerName,
            tierName,
            expiryDate: endDateET,
            daysRemaining: 3,
          }).then(r => r.success).catch(() => false);
        }

        await recordReminder(m.membership_id, key, smsSent ? 'both' : 'email', 'sent');
        result.reminders++;
      } catch (err) {
        result.errors++;
        logger.error({ err, membershipId: m.membership_id }, '3-day reminder failed');
        await recordReminder(m.membership_id, key, 'email', 'failed', (err as Error).message).catch(() => {});
      }
    }

    // 2. Send 1-day reminders
    const oneDayExpiring = await MembershipRepository.findExpiringBetween(oneDayFromNow, oneDayFromNow);
    for (const m of oneDayExpiring) {
      const key = `one_day_${oneDayFromNow}`;
      try {
        if (await reminderAlreadySent(m.membership_id, key)) continue;
        const customer = (m as unknown as { customers?: { full_name?: string; email?: string; phone?: string } }).customers;
        if (!customer?.email) continue;

        const tierName = await getPlanNameForTier(m.tier);
        const endDateET = DateTime.fromISO(m.end_date!).setZone(BUSINESS_TZ).toLocaleString(DateTime.DATE_FULL);
        const customerName = customer.full_name?.split(' ')[0] ?? 'Member';

        await sendMembershipExpirationReminder({
          email: customer.email,
          customerName,
          tierName,
          expirationDate: endDateET,
          daysRemaining: 1,
          autoRenew: m.auto_renew ?? false,
          displayId: m.display_id ?? undefined,
        });

        let smsSent = false;
        if (customer.phone) {
          smsSent = await sendMembershipExpiryReminderSms({
            phone: customer.phone,
            customerName,
            tierName,
            expiryDate: endDateET,
            daysRemaining: 1,
          }).then(r => r.success).catch(() => false);
        }

        await recordReminder(m.membership_id, key, smsSent ? 'both' : 'email', 'sent');
        result.reminders++;
      } catch (err) {
        result.errors++;
        logger.error({ err, membershipId: m.membership_id }, '1-day reminder failed');
        await recordReminder(m.membership_id, key, 'email', 'failed', (err as Error).message).catch(() => {});
      }
    }

    // 3. Handle memberships expiring today - set grace period
    const expiringToday = await MembershipRepository.findExpiringBetween(today, today);
    for (const m of expiringToday) {
      try {
        if (m.auto_renew) {
          // Set grace period (2 days after expiration)
          const gracePeriodEnd = addDaysToDate(today, 2);
          await MembershipRepository.update(m.membership_id, {
            grace_period_end: gracePeriodEnd,
          });

          const key = `expiration_day_${today}`;
          if (!(await reminderAlreadySent(m.membership_id, key))) {
            const customer = (m as unknown as { customers?: { full_name?: string; email?: string } }).customers;
            if (customer?.email) {
              const tierName = await getPlanNameForTier(m.tier);
              const endDateET = DateTime.fromISO(m.end_date!).setZone(BUSINESS_TZ).toLocaleString(DateTime.DATE_FULL);

              await sendMembershipExpirationReminder({
                email: customer.email,
                customerName: customer.full_name?.split(' ')[0] ?? 'Member',
                tierName,
                expirationDate: endDateET,
                daysRemaining: 0,
                autoRenew: true,
                displayId: m.display_id ?? undefined,
              });
              await recordReminder(m.membership_id, key, 'email', 'sent');
              result.reminders++;
            }
          }
        }
      } catch (err) {
        result.errors++;
        logger.error({ err, membershipId: m.membership_id }, 'Expiration day processing failed');
      }
    }

    // 4. Expire memberships past grace period
    const pastGrace = await MembershipRepository.findPastGracePeriod(today);
    for (const m of pastGrace) {
      try {
        await MembershipRepository.update(m.membership_id, { status: 'expired' });

        const customer = (m as unknown as { customers?: { full_name?: string; email?: string } }).customers;
        if (customer?.email) {
          const tierName = await getPlanNameForTier(m.tier);
          await sendMembershipExpiredNotice({
            email: customer.email,
            customerName: customer.full_name?.split(' ')[0] ?? 'Member',
            tierName,
            displayId: m.display_id ?? undefined,
          });
        }

        result.expired++;
        logger.info({ membershipId: m.membership_id }, 'Membership expired after grace period');
      } catch (err) {
        result.errors++;
        logger.error({ err, membershipId: m.membership_id }, 'Failed to expire membership');
      }
    }

    // 5. Also expire memberships that are past end_date with no auto_renew and no grace period
    const { data: pastEndNoGrace } = await supabaseAny
      .from('memberships')
      .select('membership_id')
      .eq('status', 'active')
      .is('grace_period_end', null)
      .lt('end_date', today)
      .eq('auto_renew', false);

    for (const m of (pastEndNoGrace ?? [])) {
      try {
        await MembershipRepository.update(m.membership_id, { status: 'expired' });
        result.expired++;
      } catch (err) {
        result.errors++;
        logger.error({ err, membershipId: m.membership_id }, 'Failed to expire non-autorenew membership');
      }
    }

    // 6. Activate queued (pending) memberships whose start_date has arrived
    const { data: pendingMemberships } = await supabaseAny
      .from('memberships')
      .select('*')
      .eq('status', 'pending')
      .lte('start_date', today);

    for (const m of (pendingMemberships ?? [])) {
      try {
        await MembershipRepository.update(m.membership_id, { status: 'active' });
        result.activated++;
        logger.info({ membershipId: m.membership_id }, 'Queued membership activated');
      } catch (err) {
        result.errors++;
        logger.error({ err, membershipId: m.membership_id }, 'Failed to activate queued membership');
      }
    }

    logger.info(result, 'Membership renewal processing completed');
  } finally {
    isProcessing = false;
  }

  return result;
}

/**
 * Start the membership renewal scheduler.
 * Runs once daily + immediate run on startup.
 */
export function startMembershipRenewalScheduler(): void {
  if (reminderInterval) {
    logger.warn('Membership renewal scheduler already running');
    return;
  }

  // Run immediately on startup
  processMembershipRenewals().catch(error => {
    logger.error({ error }, 'Initial membership renewal processing failed');
  });

  // Schedule recurring runs every 24 hours
  const intervalMs = 24 * 60 * 60 * 1000;
  reminderInterval = setInterval(() => {
    processMembershipRenewals().catch(error => {
      logger.error({ error }, 'Scheduled membership renewal processing failed');
    });
  }, intervalMs);

  logger.info('Membership renewal scheduler started (daily)');
}

/**
 * Stop the membership renewal scheduler.
 */
export function stopMembershipRenewalScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    logger.info('Membership renewal scheduler stopped');
  }
}
