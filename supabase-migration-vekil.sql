-- Migration: Add attorney/representative columns
-- Run this in your Supabase SQL Editor

ALTER TABLE file_cases
ADD COLUMN IF NOT EXISTS plaintiff_attorney TEXT,
ADD COLUMN IF NOT EXISTS defendant_attorney TEXT;

-- Add comment for clarity
COMMENT ON COLUMN file_cases.plaintiff_attorney IS 'Davacı Vekili';
COMMENT ON COLUMN file_cases.defendant_attorney IS 'Davalı Vekili';
