-- Migration: Create decisions table for multiple decisions per file case
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_case_id UUID NOT NULL REFERENCES file_cases(id) ON DELETE CASCADE,
    decision_type VARCHAR(50) NOT NULL, -- 'ILK_DERECE', 'ISTINAF', 'TEMYIZ'
    decision_result VARCHAR(100),       -- 'Kabul', 'Red', 'Kısmen Kabul', 'Onama', 'Bozma', etc.
    decision_date DATE,
    decision_number VARCHAR(100),       -- Karar No
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast queries by file
CREATE INDEX IF NOT EXISTS idx_decisions_file ON decisions(file_case_id);
CREATE INDEX IF NOT EXISTS idx_decisions_date ON decisions(decision_date);

-- Disable RLS for simplicity
ALTER TABLE decisions DISABLE ROW LEVEL SECURITY;

-- Grants
GRANT ALL ON decisions TO anon, authenticated;

-- Comments
COMMENT ON COLUMN decisions.decision_type IS 'ILK_DERECE = İlk Derece, ISTINAF = İstinaf, TEMYIZ = Temyiz';
