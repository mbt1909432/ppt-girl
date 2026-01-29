-- Migration: Change chat_sessions.id from UUID to TEXT to support Acontext session IDs
-- Run this SQL in your Supabase SQL Editor
-- This allows using Acontext session IDs directly as primary keys
--
-- RLS policies on chat_messages reference chat_sessions.id / chat_messages.session_id.
-- PostgreSQL blocks ALTER COLUMN when policies depend on those columns. We drop
-- the policies first, alter columns, recreate FK, then recreate the policies.

-- 1) Drop RLS policies on chat_messages that depend on session_id / chat_sessions.id
ALTER TABLE chat_messages
  DROP POLICY IF EXISTS "Users can view messages from their own sessions";
ALTER TABLE chat_messages
  DROP POLICY IF EXISTS "Users can create messages in their own sessions";

-- 2) Drop foreign key that references chat_sessions.id
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_session_id_fkey;

-- 3) Alter chat_sessions.id from UUID to TEXT
ALTER TABLE chat_sessions
  ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE chat_sessions
  ALTER COLUMN id DROP DEFAULT;

-- 4) Alter chat_messages.session_id to TEXT (must match chat_sessions.id)
ALTER TABLE chat_messages
  ALTER COLUMN session_id TYPE TEXT USING session_id::TEXT;

-- 5) Recreate foreign key
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_session_id_fkey
  FOREIGN KEY (session_id)
  REFERENCES chat_sessions(id)
  ON DELETE CASCADE;

-- 6) Recreate RLS policies (same logic as schema.sql)
CREATE POLICY "Users can view messages from their own sessions"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their own sessions"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

-- 7) Optional: unique index on id (id is already PK; this is for clarity only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_id_unique
  ON chat_sessions(id);
