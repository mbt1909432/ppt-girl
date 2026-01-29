-- Migration: Per-user default Acontext Space mapping
-- Run this SQL in your Supabase SQL Editor
-- This table ensures each user has a long-lived Space that all sessions can attach to.

CREATE TABLE IF NOT EXISTS user_acontext_spaces (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index to quickly look up by space_id if needed (optional, but useful for debugging)
CREATE INDEX IF NOT EXISTS idx_user_acontext_spaces_space_id
  ON user_acontext_spaces(space_id);


