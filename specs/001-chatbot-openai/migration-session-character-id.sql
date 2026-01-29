-- Migration: Add character_id to chat_sessions
-- Run this SQL in your Supabase SQL Editor
-- This allows storing which character is locked for each session

-- Add character_id column to chat_sessions table
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS character_id TEXT;

-- Add index for querying sessions by character
CREATE INDEX IF NOT EXISTS idx_chat_sessions_character_id
  ON chat_sessions(character_id);

-- Note: character_id can be NULL for backward compatibility with existing sessions
-- Valid values: "character1", "character2", ..., "character8"
-- NULL means the session was created before this feature and uses global character selection
