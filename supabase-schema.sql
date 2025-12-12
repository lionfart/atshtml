-- ==========================================
-- Adalet Takip Sistemi - Schema Update v3 (Smart Matching)
-- ==========================================
-- Lütfen bu kodun tamamını Supabase SQL Editor'e yapıştırıp çalıştırın.

-- Core Tables (Existing structure maintained)
CREATE TABLE IF NOT EXISTS lawyers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(20) DEFAULT 'LAWYER',
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    leave_return_date DATE,
    missed_assignments_count INTEGER DEFAULT 0,
    assigned_files_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS file_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_number VARCHAR(50) NOT NULL, -- Sistem No (Örn: 2024/0001)
    
    -- New Smart Fields
    court_name VARCHAR(255), -- Mahkeme Adı (İstanbul 1. Asliye Hukuk vb.)
    court_case_number VARCHAR(100), -- Esas No (2024/123 E.)
    plaintiff VARCHAR(500) NOT NULL, -- Davacı
    defendant VARCHAR(500), -- Davalı
    claim_amount VARCHAR(100), -- Dava Değeri
    
    subject TEXT,
    lawyer_id UUID REFERENCES lawyers(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    latest_activity_type VARCHAR(100),
    latest_activity_date TIMESTAMP WITH TIME ZONE,
    latest_decision_result VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Belge Tablosu
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(500) NOT NULL,
    type VARCHAR(100),
    file_case_id UUID NOT NULL REFERENCES file_cases(id) ON DELETE CASCADE,
    storage_path VARCHAR(1000),
    public_url TEXT,
    analysis JSONB, -- AI Analiz Sonuçları (Full JSON) here
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_case_id UUID NOT NULL REFERENCES file_cases(id) ON DELETE CASCADE,
    lawyer_id UUID REFERENCES lawyers(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    last_assignment_index INTEGER DEFAULT -1,
    catchup_burst_limit INTEGER DEFAULT 2,
    catchup_sequence_count INTEGER DEFAULT 0,
    gemini_api_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disable RLS for Public Access (Fixes permission issues)
ALTER TABLE lawyers DISABLE ROW LEVEL SECURITY;
ALTER TABLE file_cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Indexes for Smart Matching
CREATE INDEX IF NOT EXISTS idx_file_cases_esaso ON file_cases(court_case_number);
CREATE INDEX IF NOT EXISTS idx_file_cases_parties ON file_cases(plaintiff, defendant);

-- Storage Setup
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Storage Access" ON storage.objects;
CREATE POLICY "Public Storage Access" ON storage.objects FOR ALL USING ( bucket_id = 'documents' ) WITH CHECK ( bucket_id = 'documents' );
