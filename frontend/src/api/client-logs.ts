/**
 * Client-side error telemetry.
 *
 * The backend records everything that reaches it (orders, payments, receipts,
 * payment_logs, request logs). It cannot record what stops a customer *before*
 * submission — an expired checkout timer, a payment SDK that fails to load, a
 * component crash. Those failures are invisible in every server-side table,
 * which is exactly the case where a customer says "it keeps giving me an error"
 * and support has nothing to look at.
 *
 * This module ships those events to POST /api/client-logs. It is deliberately
 * fire-and-forget: telemetry must never throw, block, or surface an error to a
 * customer who is already stuck.
 */

import { API_BASE_URL, getAuthToken } from './client';

export type ClientLogSeverity = 'error' | 'warn' | 'info';

export interface ClientLogEvent {
  severity?: ClientLogSeverity;
  /** Where in the app this came from, e.g. 'checkout', 'error_boundary'. */
  source: string;
  message: string;
  errorName?: string;
  stack?: string;
  componentStack?: string;
  /** Arbitrary structured detail — cart totals, reservation id, timer state. */
  context?: Record<string, unknown>;
}

/** Stable id for one browser tab session, so related events can be grouped. */
const sessionId = (() => {
  try {
    const existing = sessionStorage.getItem('pf_session_id');
    if (existing) return existing;
    const generated = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('pf_session_id', generated);
    return generated;
  } catch {
    // Private mode / storage disabled — telemetry still works, just ungrouped.
    return undefined;
  }
})();

/**
 * Identical errors can fire on every render or every tick of an interval.
 * Collapse repeats so one stuck page can't emit thousands of rows.
 */
const recentlySent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;

function shouldSend(key: string): boolean {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow without bound.
  recentlySent.forEach((at, k) => {
    if (now - at > DEDUPE_WINDOW_MS) recentlySent.delete(k);
  });

  const lastSent = recentlySent.get(key);
  if (lastSent !== undefined && now - lastSent < DEDUPE_WINDOW_MS) return false;

  recentlySent.set(key, now);
  return true;
}

export function logClientEvent(event: ClientLogEvent): void {
  try {
    if (!API_BASE_URL) return;

    const dedupeKey = `${event.source}|${event.message}`;
    if (!shouldSend(dedupeKey)) return;

    const payload = {
      severity: event.severity ?? 'error',
      source: event.source,
      message: event.message.slice(0, 2000),
      errorName: event.errorName,
      stack: event.stack?.slice(0, 8000),
      componentStack: event.componentStack?.slice(0, 8000),
      path: window.location.pathname,
      appVersion: process.env.REACT_APP_VERSION,
      sessionId,
      context: event.context,
      occurredAt: new Date().toISOString(),
    };

    const url = `${API_BASE_URL}/api/client-logs`;
    const token = getAuthToken();

    // sendBeacon survives navigation/unload, which matters because customers
    // often close or reload the tab the moment something breaks. It can't carry
    // an Authorization header though, so use fetch when we have a token and
    // want the event attributed to a known user.
    if (!token && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }

    void fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* Telemetry failing is not the customer's problem. */
    });
  } catch {
    /* Never let logging break the app. */
  }
}

/** Convenience wrapper for a caught Error. */
export function logClientError(
  source: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const err = error instanceof Error ? error : undefined;
  logClientEvent({
    severity: 'error',
    source,
    message: err?.message ?? String(error),
    errorName: err?.name,
    stack: err?.stack,
    context,
  });
}

/**
 * Catches errors that escape React entirely — async failures, third-party SDK
 * errors (Square's payment iframe), and unhandled promise rejections.
 * Call once at app startup.
 */
export function installGlobalErrorLogging(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', event => {
    logClientEvent({
      source: 'window_error',
      message: event.message || 'Uncaught error',
      errorName: event.error instanceof Error ? event.error.name : undefined,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    logClientEvent({
      source: 'unhandled_rejection',
      message: reason instanceof Error ? reason.message : String(reason),
      errorName: reason instanceof Error ? reason.name : undefined,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
