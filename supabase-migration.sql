-- ==========================================
-- Migration: Add Missing Columns to file_cases
-- ==========================================

-- 1. Tabloya eksik sütunları ekle
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS court_name VARCHAR(255);
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS court_case_number VARCHAR(100);
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS defendant VARCHAR(500);
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS claim_amount VARCHAR(100);

-- 2. Yeni sütunlar için index oluştur
CREATE INDEX IF NOT EXISTS idx_file_cases_esaso ON file_cases(court_case_number);
CREATE INDEX IF NOT EXISTS idx_file_cases_parties ON file_cases(plaintiff, defendant);

-- 3. Documents tablosunu güncelle (Analysis JSON için)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS analysis JSONB;

-- 4. RLS'yi tekrar garantiye al (Disable)
ALTER TABLE lawyers DISABLE ROW LEVEL SECURITY;
ALTER TABLE file_cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- 5. İzinleri tazele
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
