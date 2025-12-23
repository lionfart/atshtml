-- Add latest_decision_result column if it doesn't exist
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS latest_decision_result VARCHAR(50);
-- Index for faster filtering if we decide to filter by decision
CREATE INDEX IF NOT EXISTS idx_file_cases_decision_result ON file_cases(latest_decision_result);
