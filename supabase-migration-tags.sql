-- Migration: Add Tags to File Cases
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}';

-- Optional: Create index for faster tag filtering if using pgvector later
CREATE INDEX IF NOT EXISTS idx_file_cases_tags ON file_cases USING GIN ("tags");
