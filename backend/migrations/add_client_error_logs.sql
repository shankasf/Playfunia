-- Client-side error telemetry.
--
-- Backend logging (payment_logs, orders, payments, receipts, pino request logs)
-- only records what actually reaches the server. Errors that stop a customer
-- BEFORE submission — an expired checkout timer, a Square SDK load failure, a
-- render crash — leave no trace at all, so support has nothing to look at when
-- a customer reports "it keeps giving me an error message".
--
-- This table is written by POST /api/client-logs.

CREATE TABLE IF NOT EXISTS client_error_logs (
  client_error_id BIGSERIAL PRIMARY KEY,

  -- What happened
  severity       TEXT NOT NULL DEFAULT 'error',  -- 'error' | 'warn' | 'info'
  source         TEXT NOT NULL,                  -- 'error_boundary' | 'window_error' | 'unhandled_rejection' | 'checkout' | ...
  message        TEXT NOT NULL,
  error_name     TEXT,
  stack          TEXT,
  component_stack TEXT,

  -- Where it happened
  path           TEXT,                           -- window.location.pathname
  app_version    TEXT,

  -- Who it happened to (best effort; may be a guest)
  user_id        BIGINT,
  session_id     TEXT,

  -- Free-form structured detail (cart totals, reservation id, timer state, ...)
  context        JSONB,

  -- Request-derived
  user_agent     TEXT,
  ip_address     TEXT,

  occurred_at    TIMESTAMPTZ,                    -- client clock
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- server clock (authoritative)
);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_created_at
  ON client_error_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_source
  ON client_error_logs(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_user
  ON client_error_logs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
