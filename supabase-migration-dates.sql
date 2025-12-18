-- Migration: Add Missing Date Columns
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS "next_hearing_date" date;
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS "deadline_date" date;

-- Optional: Add index for calendar queries
CREATE INDEX IF NOT EXISTS idx_file_cases_dates ON file_cases ("next_hearing_date", "deadline_date");
