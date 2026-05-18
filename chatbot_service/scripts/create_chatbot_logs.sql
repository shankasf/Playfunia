-- Chatbot query log table + a write-only role for the agent to insert into it.
-- The chatbot_readonly role intentionally cannot write anywhere, so logging
-- goes through a separate, narrowly-scoped chatbot_logger role.
--
-- Run with:  psql ... -v logger_password='<pw>' -f create_chatbot_logs.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.chatbot_query_logs (
    log_id        BIGSERIAL PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_message  TEXT        NOT NULL,
    final_reply   TEXT,
    tool_names    TEXT[]      NOT NULL DEFAULT '{}',  -- denormalised for analytics
    tool_calls    JSONB       NOT NULL DEFAULT '[]',  -- full trace: tool, args, preview
    turn_count    INTEGER     NOT NULL DEFAULT 0,
    latency_ms    INTEGER,
    error         TEXT,
    model         TEXT
);

CREATE INDEX IF NOT EXISTS chatbot_query_logs_created_idx
    ON public.chatbot_query_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS chatbot_query_logs_tools_gin
    ON public.chatbot_query_logs USING GIN (tool_names);

COMMIT;

-- Create / rotate the logger role
SELECT format('CREATE ROLE chatbot_logger WITH LOGIN PASSWORD %L', :'logger_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='chatbot_logger')
\gexec
SELECT format('ALTER ROLE chatbot_logger WITH PASSWORD %L', :'logger_password')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='chatbot_logger')
\gexec

-- Strip any inherited grants then grant the narrowest needful set.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM chatbot_logger;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM chatbot_logger;
GRANT  CONNECT ON DATABASE postgres TO chatbot_logger;
GRANT  USAGE   ON SCHEMA public      TO chatbot_logger;

-- INSERT + SELECT only on the logs table itself. Sequence USAGE so the
-- SERIAL primary key can advance. No access to anything else.
GRANT INSERT, SELECT ON public.chatbot_query_logs TO chatbot_logger;
GRANT USAGE, SELECT  ON SEQUENCE public.chatbot_query_logs_log_id_seq TO chatbot_logger;

ALTER ROLE chatbot_logger SET statement_timeout = '5s';
ALTER ROLE chatbot_logger BYPASSRLS;

\echo Logger role grants:
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee='chatbot_logger' ORDER BY table_name;
