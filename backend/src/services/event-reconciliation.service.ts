/**
 * Event Reconciliation Service
 *
 * Recovers missed webhook events by:
 * 1. Fetching recent events from Square Events API
 * 2. Comparing with webhook_events table
 * 3. Processing any missed events
 *
 * Runs on a schedule (daily) to ensure payment reconciliation.
 */

import { getSquareClient } from '../config/square';
import { supabaseAny } from '../config/supabase';
import { logger } from '../utils/logger';
import { processWebhookEvent, type SquareWebhookPayload } from './webhook.service';

// Scheduler state
let reconciliationInterval: NodeJS.Timeout | null = null;
let isRunning = false;

export interface ReconciliationResult {
  eventsChecked: number;
  eventsMissed: number;
  eventsProcessed: number;
  errors: Array<{ eventId: string; error: string }>;
  startedAt: string;
  completedAt: string;
}

/**
 * Event types we care about for reconciliation.
 * These are the payment-related events that affect our data.
 */
const RECONCILABLE_EVENT_TYPES = [
  'payment.completed',
  'payment.updated',
  'payment.canceled',
  'refund.created',
  'refund.updated',
  'order.created',
  'order.updated',
];

/**
 * Fetch recent events from Square Events API.
 * The Events API allows searching within a 28-day window.
 *
 * @param lookbackHours - How many hours back to search (max 672 = 28 days)
 */
async function fetchRecentSquareEvents(lookbackHours: number = 24): Promise<Array<{
  eventId: string;
  eventType: string;
  merchantId: string;
  createdAt: string;
  data: Record<string, unknown>;
}>> {
  const square = getSquareClient();
  const events: Array<{
    eventId: string;
    eventType: string;
    merchantId: string;
    createdAt: string;
    data: Record<string, unknown>;
  }> = [];

  // Calculate time range
  const now = new Date();
  const startTime = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

  // Clamp to 28 days max (Square's limit)
  const maxLookback = 28 * 24;
  if (lookbackHours > maxLookback) {
    logger.warn({ requested: lookbackHours, max: maxLookback }, 'Lookback hours clamped to 28 days');
  }

  try {
    let cursor: string | undefined;
    let pageCount = 0;
    const maxPages = 10; // Safety limit to prevent infinite loops

    do {
      const response = await square.events.searchEvents({
        cursor,
        limit: 100,
        query: {
          filter: {
            eventTypes: RECONCILABLE_EVENT_TYPES,
            createdAt: {
              startAt: startTime.toISOString(),
              endAt: now.toISOString(),
            },
          },
          sort: {
            field: 'DEFAULT',
            order: 'DESC',
          },
        },
      });

      if (response.events) {
        for (const event of response.events) {
          events.push({
            eventId: event.eventId ?? '',
            eventType: event.type ?? '', // Square uses 'type' not 'eventType'
            merchantId: event.merchantId ?? '',
            createdAt: event.createdAt ?? '',
            data: event.data as Record<string, unknown>,
          });
        }
      }

      cursor = response.cursor;
      pageCount++;
    } while (cursor && pageCount < maxPages);

    logger.info({
      eventsFound: events.length,
      lookbackHours,
      pagesFetched: pageCount,
    }, 'Fetched events from Square');

    return events;
  } catch (error) {
    logger.error({ error, lookbackHours }, 'Error fetching events from Square');
    return [];
  }
}

/**
 * Find events that exist in Square but not in our webhook_events table.
 */
async function findMissedEvents(
  squareEvents: Array<{
    eventId: string;
    eventType: string;
    merchantId: string;
    createdAt: string;
    data: Record<string, unknown>;
  }>
): Promise<Array<{
  eventId: string;
  eventType: string;
  merchantId: string;
  createdAt: string;
  data: Record<string, unknown>;
}>> {
  if (squareEvents.length === 0) {
    return [];
  }

  // Get all event IDs from Square
  const eventIds = squareEvents.map(e => e.eventId);

  // Query our database for these event IDs
  const { data: existingEvents, error } = await supabaseAny
    .from('webhook_events')
    .select('event_id')
    .in('event_id', eventIds);

  if (error) {
    logger.error({ error }, 'Error querying existing webhook events');
    return [];
  }

  // Create a set of existing event IDs for fast lookup
  const existingEventIds = new Set((existingEvents ?? []).map((e: { event_id: string }) => e.event_id));

  // Filter to events we don't have
  const missedEvents = squareEvents.filter(e => !existingEventIds.has(e.eventId));

  logger.info({
    totalSquareEvents: squareEvents.length,
    existingInDb: existingEventIds.size,
    missed: missedEvents.length,
  }, 'Identified missed events');

  return missedEvents;
}

/**
 * Process a missed event through the normal webhook flow.
 */
async function processMissedEvent(event: {
  eventId: string;
  eventType: string;
  merchantId: string;
  createdAt: string;
  data: Record<string, unknown>;
}): Promise<void> {
  // Convert to webhook payload format
  const payload: SquareWebhookPayload = {
    merchant_id: event.merchantId,
    type: event.eventType,
    event_id: event.eventId,
    created_at: event.createdAt,
    data: event.data as SquareWebhookPayload['data'],
  };

  // Store the event first
  const { error: storeError } = await supabaseAny
    .from('webhook_events')
    .upsert(
      {
        event_id: event.eventId,
        event_type: event.eventType,
        payload,
        status: 'processing',
      },
      { onConflict: 'event_id', ignoreDuplicates: true }
    );

  if (storeError) {
    // If it's a duplicate, that's fine - another process got to it
    if (storeError.code === '23505') {
      logger.debug({ eventId: event.eventId }, 'Event already being processed');
      return;
    }
    throw storeError;
  }

  // Process through normal webhook handler
  await processWebhookEvent(payload);
}

/**
 * Run the reconciliation process.
 *
 * @param lookbackHours - Hours to look back for events (default: 24)
 */
export async function runReconciliation(lookbackHours: number = 24): Promise<ReconciliationResult> {
  const startedAt = new Date().toISOString();
  const result: ReconciliationResult = {
    eventsChecked: 0,
    eventsMissed: 0,
    eventsProcessed: 0,
    errors: [],
    startedAt,
    completedAt: '',
  };

  if (isRunning) {
    logger.warn('Reconciliation already in progress, skipping');
    result.completedAt = new Date().toISOString();
    return result;
  }

  isRunning = true;

  try {
    logger.info({ lookbackHours }, 'Starting event reconciliation');

    // Fetch events from Square
    const squareEvents = await fetchRecentSquareEvents(lookbackHours);
    result.eventsChecked = squareEvents.length;

    // Find missed events
    const missedEvents = await findMissedEvents(squareEvents);
    result.eventsMissed = missedEvents.length;

    if (missedEvents.length === 0) {
      logger.info('No missed events found');
      result.completedAt = new Date().toISOString();
      return result;
    }

    // Process missed events
    for (const event of missedEvents) {
      try {
        await processMissedEvent(event);
        result.eventsProcessed++;
        logger.info({
          eventId: event.eventId,
          eventType: event.eventType,
        }, 'Processed missed event');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          eventId: event.eventId,
          error: errorMessage,
        });
        logger.error({
          error,
          eventId: event.eventId,
          eventType: event.eventType,
        }, 'Error processing missed event');
      }
    }

    logger.info({
      eventsChecked: result.eventsChecked,
      eventsMissed: result.eventsMissed,
      eventsProcessed: result.eventsProcessed,
      errors: result.errors.length,
    }, 'Event reconciliation completed');
  } finally {
    isRunning = false;
    result.completedAt = new Date().toISOString();
  }

  return result;
}

/**
 * Start the reconciliation scheduler.
 * Runs daily by default.
 *
 * @param intervalHours - Hours between reconciliation runs (default: 24)
 */
export function startReconciliationScheduler(intervalHours: number = 24): void {
  if (reconciliationInterval) {
    logger.warn('Reconciliation scheduler already running');
    return;
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;

  // Run immediately on startup
  runReconciliation(24).catch(error => {
    logger.error({ error }, 'Initial reconciliation failed');
  });

  // Schedule recurring runs
  reconciliationInterval = setInterval(() => {
    runReconciliation(intervalHours + 1) // Overlap by 1 hour for safety
      .catch(error => {
        logger.error({ error }, 'Scheduled reconciliation failed');
      });
  }, intervalMs);

  logger.info({ intervalHours }, 'Event reconciliation scheduler started');
}

/**
 * Stop the reconciliation scheduler.
 */
export function stopReconciliationScheduler(): void {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
    logger.info('Event reconciliation scheduler stopped');
  }
}

/**
 * Check if reconciliation is currently running.
 */
export function isReconciliationRunning(): boolean {
  return isRunning;
}

/**
 * Check if the scheduler is active.
 */
export function isSchedulerActive(): boolean {
  return reconciliationInterval !== null;
}
