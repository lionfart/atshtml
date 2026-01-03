-- Migration: Add court info columns to decisions table
-- Run this in your Supabase SQL Editor

ALTER TABLE decisions 
ADD COLUMN IF NOT EXISTS court_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS court_case_number VARCHAR(100);

-- Comment for clarity
COMMENT ON COLUMN decisions.court_name IS 'Mahkeme adı (örn: Ankara 2. İdare Mahkemesi)';
COMMENT ON COLUMN decisions.court_case_number IS 'Esas no (örn: 2024/1234)';
