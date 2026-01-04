-- Migration: Add is_favorite and address columns to file_cases
-- Run this in your Supabase SQL Editor

ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS address TEXT;

-- Comments
COMMENT ON COLUMN file_cases.is_favorite IS 'Dosya favori olarak işaretlendi mi';
COMMENT ON COLUMN file_cases.address IS 'Dosyaya ilişkin adres bilgisi';
