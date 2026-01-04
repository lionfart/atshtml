-- Migration: Add is_favorite, address, and urgency columns to file_cases
-- Run this in your Supabase SQL Editor

ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'Orta';

-- Comments
COMMENT ON COLUMN file_cases.is_favorite IS 'Dosya favori olarak işaretlendi mi';
COMMENT ON COLUMN file_cases.address IS 'Dosyaya ilişkin adres bilgisi';
COMMENT ON COLUMN file_cases.urgency IS 'Dosya önem derecesi: Düşük, Orta, Yüksek';
