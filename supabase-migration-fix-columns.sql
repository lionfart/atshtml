-- CRITICAL MIGRATION: Run this to fix saving errors
-- This adds all potentially missing columns to the file_cases table

-- 1. Lawyer Name (Denormalized) - Fixes "lawyer_name column not found"
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS lawyer_name VARCHAR(255);

-- 2. Deadline & Hearing Dates - Fixes "Kesin Süre" saving errors
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS deadline_date DATE;
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS next_hearing_date DATE;

-- 3. Attorneys (Vekiller) - Fixes "Davacı/Davalı Vekili" saving errors
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS plaintiff_attorney TEXT;
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS defendant_attorney TEXT;

-- 4. Tags - Fixes Tagging logic
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS primary_tag TEXT;
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS tags TEXT[]; -- Ensure tags exists too

-- 5. Decision Result
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS latest_decision_result VARCHAR(100);
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS court_decision_number VARCHAR(100);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_file_cases_lawyer_name ON file_cases(lawyer_name);
CREATE INDEX IF NOT EXISTS idx_file_cases_dates ON file_cases(deadline_date, next_hearing_date);
