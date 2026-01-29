-- Migration: Add Acontext integration fields
-- Run this SQL in your Supabase SQL Editor after the base schema

-- Add acontext_session_id to chat_sessions table
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS acontext_session_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chat_sessions_acontext_session_id 
ON chat_sessions(acontext_session_id) 
WHERE acontext_session_id IS NOT NULL;

-- Add acontext_space_id to chat_sessions table (optional: for knowledge space integration)
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS acontext_space_id TEXT;

-- Add index for space lookups
CREATE INDEX IF NOT EXISTS idx_chat_sessions_acontext_space_id 
ON chat_sessions(acontext_space_id) 
WHERE acontext_space_id IS NOT NULL;

