-- Migration: Add deadline_type column for distinguishing deadline types
-- Run this in your Supabase SQL Editor

ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS deadline_type VARCHAR(50);
-- Values: 'ISLEM_SURESI' (Processing Deadline - Red) | 'KESIF_DURUSMA' (Hearing/Inspection - Yellow) | null

COMMENT ON COLUMN file_cases.deadline_type IS 'Type of deadline: ISLEM_SURESI or KESIF_DURUSMA';
