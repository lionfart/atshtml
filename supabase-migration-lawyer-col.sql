-- ADD assigned_lawyer_id to file_cases table
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS assigned_lawyer_id UUID REFERENCES lawyers(id);

-- Optional: Create index for performance
CREATE INDEX IF NOT EXISTS idx_file_cases_assigned_lawyer ON file_cases(assigned_lawyer_id);

-- Optional: Backfill if possible (This is tricky without logic, but leave explicit nulls)
-- UPDATE file_cases SET assigned_lawyer_id = ... WHERE ...
