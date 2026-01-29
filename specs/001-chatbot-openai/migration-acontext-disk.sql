-- Migration: Add Acontext Disk ID to chat_sessions table
-- Run this SQL in your Supabase SQL Editor
-- This enables each session to have its own dedicated Disk for file isolation

-- Add acontext_disk_id to chat_sessions table
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS acontext_disk_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chat_sessions_acontext_disk_id 
ON chat_sessions(acontext_disk_id) 
WHERE acontext_disk_id IS NOT NULL;

