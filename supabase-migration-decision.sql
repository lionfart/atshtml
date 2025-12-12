-- ==========================================
-- Migration: Add Decision Number & Improve Matching
-- ==========================================

-- 1. Karar Numarası Sütunu Ekle ve Indexle
ALTER TABLE file_cases ADD COLUMN IF NOT EXISTS court_decision_number VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_file_cases_decision ON file_cases(court_decision_number);

-- 2. Mahkeme Adı için Index (Hızlı arama için)
CREATE INDEX IF NOT EXISTS idx_file_cases_court ON file_cases(court_name);
