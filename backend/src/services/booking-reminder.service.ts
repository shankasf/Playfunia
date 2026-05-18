/**
 * Booking Reminder Service
 *
 * Sends automated reminder emails for upcoming confirmed party bookings:
 * - 7 days before event
 * - 2 days before event
 * - 1 day before event
 * - Day of event
 *
 * Runs once daily via setInterval (24-hour interval).
 * Idempotency guaranteed by UNIQUE(booking_id, reminder_type) constraint.
 */

import { PartyBookingRepository, BookingReminderRepository } from '../repositories/index';
import { sendBookingReminder } from './email.service';
import { sendBookingReminderSms } from './sms.service';
import { logger } from '../utils/logger';

// Scheduler state
let reminderInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

// Reminder type to days-before mapping
const REMINDER_SCHEDULE: Array<{ type: string; daysBefore: number }> = [
  { type: 'seven_days', daysBefore: 7 },
  { type: 'two_days', daysBefore: 2 },
  { type: 'one_day', daysBefore: 1 },
  { type: 'day_of', daysBefore: 0 },
];

/**
 * Get today's date in America/New_York as YYYY-MM-DD.
 */
function getTodayET(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  });
  return formatter.format(new Date()); // en-CA gives YYYY-MM-DD format
}

/**
 * Add days to a YYYY-MM-DD date string.
 */
function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Compute the 4 target event dates based on today in ET.
 * Returns a map: eventDate -> { reminderType, daysUntil }.
 */
function getTargetDates(): Map<string, { reminderType: string; daysUntil: number }> {
  const todayET = getTodayET();
  const map = new Map<string, { reminderType: string; daysUntil: number }>();

  for (const { type, daysBefore } of REMINDER_SCHEDULE) {
    const eventDate = addDays(todayET, daysBefore);
    map.set(eventDate, { reminderType: type, daysUntil: daysBefore });
  }

  return map;
}

/**
 * Format a YYYY-MM-DD date for display in emails.
 * Anchored to noon UTC and formatted in America/New_York so the displayed
 * calendar day always matches the ET-based scheduling logic, independent
 * of the server's local timezone.
 */
function formatEventDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a time string (HH:MM:SS or HH:MM) to display format.
 */
function formatTime(time: string | null): string {
  if (!time) return '';
  const match = time.match(/^(\d{2}):(\d{2})/);
  if (!match || !match[1] || !match[2]) return time;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

/**
 * Main processing function. Finds confirmed bookings for the target dates
 * and sends reminder emails (and SMS when phone is available).
 */
export async function processBookingReminders(): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  const result = { processed: 0, skipped: 0, errors: 0 };

  if (isProcessing) {
    logger.warn('Booking reminders already processing, skipping');
    return result;
  }

  isProcessing = true;

  try {
    const targetDates = getTargetDates();
    const eventDates = Array.from(targetDates.keys());

    logger.info({ eventDates }, 'Processing booking reminders for target dates');

    // Fetch confirmed bookings matching any target date
    const bookings = await PartyBookingRepository.findUpcomingConfirmed(eventDates);

    if (bookings.length === 0) {
      logger.info('No confirmed bookings found for reminder dates');
      return result;
    }

    logger.info({ bookingCount: bookings.length }, 'Found bookings for reminders');

    for (const booking of bookings) {
      const eventDate = booking.event_date;
      if (!eventDate) continue;

      const target = targetDates.get(eventDate);
      if (!target) continue;

      const { reminderType, daysUntil } = target;

      try {
        // Check if reminder already sent
        const existing = await BookingReminderRepository.findByBookingAndType(
          booking.booking_id,
          reminderType
        );

        if (existing) {
          result.skipped++;
          continue;
        }

        // Resolve guest name and email (prefer customer, fall back to guest fields)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customer = (booking as any).customers;
        const guestName = customer?.full_name || booking.guest_name || 'Party Host';
        const email = customer?.email || booking.guest_email;
        const phone = customer?.phone || booking.guest_phone;

        if (!email) {
          logger.warn({ bookingId: booking.booking_id, reference: booking.reference }, 'No email found for booking, skipping reminder');
          result.skipped++;
          continue;
        }

        // Resolve package name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pkg = (booking as any).party_packages;
        const packageName = pkg?.name || 'Party Package';

        // Send email
        const emailSent = await sendBookingReminder({
          email,
          guestName,
          reference: booking.reference || '',
          packageName,
          eventDate: formatEventDate(eventDate),
          startTime: formatTime(booking.start_time),
          location: booking.location_name || 'Playfunia',
          guestCount: booking.guests || 0,
          balanceRemaining: booking.balance_remaining || 0,
          daysUntil,
          reminderType: reminderType as 'day_of' | 'one_day' | 'two_days' | 'seven_days',
        });

        // Send SMS if phone available
        let smsSent = false;
        if (phone) {
          try {
            smsSent = (await sendBookingReminderSms({
              phone,
              guestName,
              reference: booking.reference || '',
              eventDate: formatEventDate(eventDate),
              startTime: formatTime(booking.start_time),
              location: booking.location_name || 'Playfunia',
              daysUntil,
            })).success;
          } catch (smsErr) {
            logger.error({ err: smsErr, bookingId: booking.booking_id }, 'SMS reminder failed');
          }
        }

        // Record the reminder
        const notificationMethod = emailSent && smsSent ? 'both' : emailSent ? 'email' : smsSent ? 'sms' : 'none';
        await BookingReminderRepository.record({
          bookingId: booking.booking_id,
          reminderType,
          notificationMethod,
          status: emailSent || smsSent ? 'sent' : 'failed',
          errorMessage: !emailSent && !smsSent ? 'Both email and SMS failed' : undefined,
        });

        result.processed++;
        logger.info({
          bookingId: booking.booking_id,
          reference: booking.reference,
          reminderType,
          email: emailSent,
          sms: smsSent,
        }, 'Booking reminder sent');
      } catch (err) {
        result.errors++;
        logger.error({
          err,
          bookingId: booking.booking_id,
          reminderType,
        }, 'Error processing booking reminder');

        // Record the failure
        try {
          await BookingReminderRepository.record({
            bookingId: booking.booking_id,
            reminderType,
            notificationMethod: 'email',
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
          });
        } catch (recordErr) {
          logger.error({ err: recordErr }, 'Failed to record reminder error');
        }
      }
    }

    logger.info(result, 'Booking reminders processing completed');
  } finally {
    isProcessing = false;
  }

  return result;
}

/**
 * Start the booking reminder scheduler.
 * Runs once daily + immediate run on startup.
 */
export function startBookingReminderScheduler(): void {
  if (reminderInterval) {
    logger.warn('Booking reminder scheduler already running');
    return;
  }

  // Run immediately on startup
  processBookingReminders().catch(error => {
    logger.error({ error }, 'Initial booking reminder processing failed');
  });

  // Schedule recurring runs every 24 hours
  const intervalMs = 24 * 60 * 60 * 1000;
  reminderInterval = setInterval(() => {
    processBookingReminders().catch(error => {
      logger.error({ error }, 'Scheduled booking reminder processing failed');
    });
  }, intervalMs);

  logger.info('Booking reminder scheduler started (daily)');
}

/**
 * Stop the booking reminder scheduler.
 */
export function stopBookingReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    logger.info('Booking reminder scheduler stopped');
  }
}
