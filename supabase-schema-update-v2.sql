-- Add summary column for tooltip
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS latest_activity_summary TEXT;
