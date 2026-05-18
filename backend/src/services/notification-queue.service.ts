/**
 * Notification Queue Service
 *
 * Database-based notification queue with:
 * - Reliable delivery (persisted to database)
 * - Exponential backoff retry (3 attempts)
 * - Support for email and SMS
 */

import { supabaseAny } from '../config/supabase';
import { logger } from '../utils/logger';
import {
  sendBookingConfirmation,
  sendOrderConfirmation,
  sendMembershipConfirmation,
  sendTicketConfirmation,
  sendAdminBookingNotification,
  sendAdminTicketNotification,
  sendAdminMembershipNotification,
  sendWaiverConfirmation,
  type BookingEmailData,
  type OrderConfirmationEmailData,
  type MembershipEmailData,
  type TicketEmailData,
  type AdminBookingNotificationData,
  type AdminTicketNotificationData,
  type AdminMembershipNotificationData,
  type WaiverConfirmationEmailData,
} from './email.service';
import {
  sendBookingConfirmationSms,
  sendOrderConfirmationSms,
  sendTicketConfirmationSms,
  sendWaiverConfirmationSms,
  sendBirthdayOfferSms,
  type BookingSmsData,
  type WaiverSmsData,
  type BirthdayOfferSmsData,
} from './sms.service';

export interface QueuedNotification {
  id: number;
  type: 'email' | 'sms';
  recipient: string;
  subject: string | null;
  template: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  reference_type: string | null;
  reference_id: number | null;
}

// Template types for type safety
export type NotificationTemplate =
  | 'booking_confirmation'
  | 'order_confirmation'
  | 'membership_confirmation'
  | 'ticket_confirmation'
  | 'waiver_confirmation'
  | 'admin_booking'
  | 'admin_ticket'
  | 'admin_membership'
  | 'booking_sms'
  | 'order_sms'
  | 'ticket_sms'
  | 'waiver_sms'
  | 'birthday_offer_sms';

/**
 * Queue an email notification for delivery.
 * Uses database queue for reliability.
 */
export async function queueEmailNotification(
  recipient: string,
  template: NotificationTemplate,
  subject: string,
  payload: Record<string, unknown>,
  reference?: { type: string; id: number }
): Promise<number | null> {
  try {
    const { data, error } = await supabaseAny
      .from('notification_queue')
      .insert({
        type: 'email',
        recipient,
        subject,
        template,
        payload,
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        next_attempt_at: new Date().toISOString(),
        reference_type: reference?.type ?? null,
        reference_id: reference?.id ?? null,
      })
      .select('id')
      .single();

    if (error) throw error;

    logger.info({
      id: data.id,
      template,
      recipient,
      reference,
    }, 'Email notification queued');

    return data.id;
  } catch (err) {
    logger.error({
      error: err,
      template,
      recipient,
    }, 'Failed to queue email notification');
    return null;
  }
}

/**
 * Queue an SMS notification for delivery.
 */
export async function queueSmsNotification(
  recipient: string,
  template: NotificationTemplate,
  payload: Record<string, unknown>,
  reference?: { type: string; id: number }
): Promise<number | null> {
  try {
    const { data, error } = await supabaseAny
      .from('notification_queue')
      .insert({
        type: 'sms',
        recipient,
        subject: null,
        template,
        payload,
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        next_attempt_at: new Date().toISOString(),
        reference_type: reference?.type ?? null,
        reference_id: reference?.id ?? null,
      })
      .select('id')
      .single();

    if (error) throw error;

    logger.info({
      id: data.id,
      template,
      recipient,
      reference,
    }, 'SMS notification queued');

    return data.id;
  } catch (err) {
    logger.error({
      error: err,
      template,
      recipient,
    }, 'Failed to queue SMS notification');
    return null;
  }
}

/**
 * Queue booking confirmation notifications (email + SMS).
 * Convenience function for the common booking confirmation use case.
 */
export async function queueBookingConfirmation(
  emailData: BookingEmailData,
  smsData?: BookingSmsData,
  bookingId?: number
): Promise<void> {
  const reference = bookingId ? { type: 'booking', id: bookingId } : undefined;

  // Queue email
  await queueEmailNotification(
    emailData.email,
    'booking_confirmation',
    `Party Booking Confirmed - ${emailData.reference}`,
    emailData as unknown as Record<string, unknown>,
    reference
  );

  // Queue SMS if phone provided
  if (smsData) {
    await queueSmsNotification(
      smsData.phone,
      'booking_sms',
      smsData as unknown as Record<string, unknown>,
      reference
    );
  }
}

/**
 * Queue order confirmation notifications.
 */
export async function queueOrderConfirmation(
  emailData: OrderConfirmationEmailData,
  smsPhone?: string,
  orderId?: number
): Promise<void> {
  const reference = orderId ? { type: 'order', id: orderId } : undefined;

  // Queue email
  await queueEmailNotification(
    emailData.email,
    'order_confirmation',
    `Order Confirmation - ${emailData.orderNumber}`,
    emailData as unknown as Record<string, unknown>,
    reference
  );

  // Queue SMS if phone provided
  if (smsPhone) {
    await queueSmsNotification(
      smsPhone,
      'order_sms',
      {
        phone: smsPhone,
        customerName: emailData.customerName,
        orderNumber: emailData.orderNumber,
        total: emailData.total,
        itemCount: emailData.items.length,
      },
      reference
    );
  }
}

/**
 * Queue waiver confirmation notifications (email + SMS).
 */
export async function queueWaiverConfirmation(
  emailData?: WaiverConfirmationEmailData,
  smsData?: WaiverSmsData,
  waiverId?: number
): Promise<void> {
  const reference = waiverId ? { type: 'waiver', id: waiverId } : undefined;

  // Queue email if data provided
  if (emailData) {
    await queueEmailNotification(
      emailData.email,
      'waiver_confirmation',
      `Waiver Confirmation - ${emailData.waiverCode}`,
      emailData as unknown as Record<string, unknown>,
      reference
    );
  }

  // Queue SMS if phone provided
  if (smsData) {
    await queueSmsNotification(
      smsData.phone,
      'waiver_sms',
      smsData as unknown as Record<string, unknown>,
      reference
    );
  }
}

/**
 * Queue the Playfunia Birthday Offer marketing SMS.
 * Fired after every waiver sign (new + returning) per business rules.
 */
export async function queueBirthdayOfferSms(
  data: BirthdayOfferSmsData,
  reference?: { type: string; id: number }
): Promise<number | null> {
  return queueSmsNotification(
    data.phone,
    'birthday_offer_sms',
    data as unknown as Record<string, unknown>,
    reference
  );
}

interface DirectSendResult {
  success: boolean;
  // Twilio MessageSid, only populated for SMS sends that reached Twilio.
  messageSid?: string;
}

/**
 * Send a notification immediately (bypasses queue).
 * Used when you need synchronous delivery confirmation.
 */
async function sendNotificationDirect(notification: QueuedNotification): Promise<DirectSendResult> {
  const { id, type, template, payload } = notification;

  try {
    if (type === 'email') {
      let success = false;
      switch (template) {
        case 'booking_confirmation':
          success = await sendBookingConfirmation(payload as unknown as BookingEmailData); break;
        case 'order_confirmation':
          success = await sendOrderConfirmation(payload as unknown as OrderConfirmationEmailData); break;
        case 'membership_confirmation':
          success = await sendMembershipConfirmation(payload as unknown as MembershipEmailData); break;
        case 'ticket_confirmation':
          success = await sendTicketConfirmation(payload as unknown as TicketEmailData); break;
        case 'admin_booking':
          success = await sendAdminBookingNotification(payload as unknown as AdminBookingNotificationData); break;
        case 'admin_ticket':
          success = await sendAdminTicketNotification(payload as unknown as AdminTicketNotificationData); break;
        case 'admin_membership':
          success = await sendAdminMembershipNotification(payload as unknown as AdminMembershipNotificationData); break;
        case 'waiver_confirmation':
          success = await sendWaiverConfirmation(payload as unknown as WaiverConfirmationEmailData); break;
        default:
          logger.warn({ template }, 'Unknown email template');
      }
      return { success };
    } else if (type === 'sms') {
      switch (template) {
        case 'booking_sms':
          return await sendBookingConfirmationSms(payload as unknown as BookingSmsData, id);
        case 'order_sms':
          return await sendOrderConfirmationSms({
            phone: payload.phone as string,
            customerName: payload.customerName as string,
            orderNumber: payload.orderNumber as string,
            total: payload.total as number,
            itemCount: payload.itemCount as number,
          }, id);
        case 'ticket_sms':
          return await sendTicketConfirmationSms({
            phone: payload.phone as string,
            customerName: payload.customerName as string,
            tickets: payload.tickets as Array<{
              label: string;
              quantity: number;
              codes: string[];
            }>,
            totalAmount: payload.totalAmount as number,
          }, id);
        case 'waiver_sms':
          return await sendWaiverConfirmationSms(payload as unknown as WaiverSmsData, id);
        case 'birthday_offer_sms':
          return await sendBirthdayOfferSms(payload as unknown as BirthdayOfferSmsData, id);
        default:
          logger.warn({ template }, 'Unknown SMS template');
          return { success: false };
      }
    }

    return { success: false };
  } catch (err) {
    logger.error({
      error: err,
      type,
      template,
      recipient: notification.recipient,
    }, 'Error sending notification');
    return { success: false };
  }
}

/**
 * Process pending notifications from the queue.
 * Should be called periodically (e.g., every 30 seconds via cron).
 *
 * @param batchSize - Number of notifications to process per batch
 * @returns Number of notifications sent successfully
 */
export async function processNotificationQueue(batchSize: number = 10): Promise<number> {
  try {
    // Fetch pending notifications ready for delivery
    const { data: notifications, error } = await supabaseAny
      .from('notification_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .lt('attempts', 3)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error || !notifications?.length) {
      return 0;
    }

    logger.info({ count: notifications.length }, 'Processing queued notifications');

    let successCount = 0;

    for (const notification of notifications as QueuedNotification[]) {
      try {
        const { success, messageSid } = await sendNotificationDirect(notification);

        if (success) {
          // Mark as sent. provider_message_sid lets the
          // /api/webhooks/twilio/status endpoint update delivery_status
          // when carriers acknowledge or reject the message.
          await supabaseAny
            .from('notification_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              ...(messageSid ? { provider_message_sid: messageSid } : {}),
            })
            .eq('id', notification.id);

          successCount++;
          logger.info({
            id: notification.id,
            type: notification.type,
            template: notification.template,
            recipient: notification.recipient,
            messageSid,
          }, 'Notification sent successfully');
        } else {
          // Increment attempts and schedule retry with exponential backoff
          const nextAttempt = calculateNextAttemptTime(notification.attempts + 1);
          const newStatus = notification.attempts + 1 >= 3 ? 'failed' : 'pending';

          await supabaseAny
            .from('notification_queue')
            .update({
              status: newStatus,
              attempts: notification.attempts + 1,
              next_attempt_at: nextAttempt.toISOString(),
              last_error: 'Send returned false',
            })
            .eq('id', notification.id);

          logger.warn({
            id: notification.id,
            attempts: notification.attempts + 1,
            status: newStatus,
            nextAttempt,
          }, 'Notification send returned false');
        }
      } catch (err) {
        // Handle send error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        const nextAttempt = calculateNextAttemptTime(notification.attempts + 1);
        const newStatus = notification.attempts + 1 >= 3 ? 'failed' : 'pending';

        await supabaseAny
          .from('notification_queue')
          .update({
            status: newStatus,
            attempts: notification.attempts + 1,
            next_attempt_at: nextAttempt.toISOString(),
            last_error: errorMessage,
          })
          .eq('id', notification.id);

        logger.error({
          id: notification.id,
          error: errorMessage,
          attempts: notification.attempts + 1,
          status: newStatus,
        }, 'Notification send failed');
      }
    }

    logger.info({ successCount, total: notifications.length }, 'Notification queue processing complete');
    return successCount;
  } catch (err) {
    logger.error({ error: err }, 'Error processing notification queue');
    return 0;
  }
}

/**
 * Calculate next retry time using exponential backoff.
 * Attempt 1: 1 minute
 * Attempt 2: 4 minutes (2^2)
 * Attempt 3: 9 minutes (3^2)
 */
function calculateNextAttemptTime(attemptNumber: number): Date {
  const delayMinutes = Math.pow(attemptNumber, 2);
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

/**
 * Get queue statistics.
 */
export async function getQueueStats(): Promise<{
  pending: number;
  sent: number;
  failed: number;
  total: number;
}> {
  try {
    const { count: pendingCount } = await supabaseAny
      .from('notification_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: sentCount } = await supabaseAny
      .from('notification_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent');

    const { count: failedCount } = await supabaseAny
      .from('notification_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed');

    return {
      pending: pendingCount ?? 0,
      sent: sentCount ?? 0,
      failed: failedCount ?? 0,
      total: (pendingCount ?? 0) + (sentCount ?? 0) + (failedCount ?? 0),
    };
  } catch (err) {
    logger.error({ error: err }, 'Error getting queue stats');
    return { pending: 0, sent: 0, failed: 0, total: 0 };
  }
}

/**
 * Clean up old sent notifications (older than 7 days).
 * Should be called periodically (e.g., daily).
 */
export async function cleanupOldNotifications(olderThanDays: number = 7): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { data, error } = await supabaseAny
      .from('notification_queue')
      .delete()
      .eq('status', 'sent')
      .lt('sent_at', cutoffDate.toISOString())
      .select('id');

    if (error) throw error;

    const count = data?.length ?? 0;
    if (count > 0) {
      logger.info({ count }, 'Cleaned up old sent notifications');
    }

    return count;
  } catch (err) {
    logger.error({ error: err }, 'Error cleaning up old notifications');
    return 0;
  }
}

/**
 * Retry a specific failed notification.
 */
export async function retryNotification(notificationId: number): Promise<boolean> {
  try {
    const { error } = await supabaseAny
      .from('notification_queue')
      .update({
        status: 'pending',
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', notificationId)
      .eq('status', 'failed');

    if (error) throw error;

    logger.info({ notificationId }, 'Notification reset for retry');
    return true;
  } catch (err) {
    logger.error({ error: err, notificationId }, 'Error retrying notification');
    return false;
  }
}
