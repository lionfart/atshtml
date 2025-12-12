-- ==========================================
-- Adalet Takip Sistemi - Supabase Database Schema (v2 - RLS Fixed)
-- ==========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- TABLES
-- ==========================================

CREATE TABLE IF NOT EXISTS lawyers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(20) DEFAULT 'LAWYER' CHECK (role IN ('ADMIN', 'LAWYER')),
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ON_LEAVE')),
    leave_return_date DATE,
    missed_assignments_count INTEGER DEFAULT 0,
    assigned_files_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS file_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_number VARCHAR(50) NOT NULL,
    plaintiff VARCHAR(500) NOT NULL,
    subject TEXT,
    lawyer_id UUID REFERENCES lawyers(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    latest_activity_type VARCHAR(100),
    latest_activity_date TIMESTAMP WITH TIME ZONE,
    latest_decision_result VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(500) NOT NULL,
    type VARCHAR(100),
    file_case_id UUID NOT NULL REFERENCES file_cases(id) ON DELETE CASCADE,
    storage_path VARCHAR(1000),
    public_url TEXT,
    analysis JSONB,
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

-- ==========================================
-- DEFAULT DATA
-- ==========================================

INSERT INTO system_settings (last_assignment_index, catchup_burst_limit, catchup_sequence_count, gemini_api_key)
SELECT -1, 2, 0, ''
WHERE NOT EXISTS (SELECT 1 FROM system_settings LIMIT 1);

-- ==========================================
-- SECURITY & PERMISSIONS (Correcting RLS)
-- ==========================================

-- 1. Enable RLS on all tables
ALTER TABLE lawyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 2. Grant Access Permissions to default roles
-- This is CRITICAL for preventing 'permission denied' errors
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- 3. Define Permissive Policies
-- (For this app, we allow public read/write since there is no login screen yet)

-- Drop existing policies first to avoid conflicts if re-running
DROP POLICY IF EXISTS "Public Access Lawyers" ON lawyers;
DROP POLICY IF EXISTS "Public Access File Cases" ON file_cases;
DROP POLICY IF EXISTS "Public Access Documents" ON documents;
DROP POLICY IF EXISTS "Public Access Notes" ON notes;
DROP POLICY IF EXISTS "Public Access Settings" ON system_settings;

-- Create new policies
CREATE POLICY "Public Access Lawyers" ON lawyers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access File Cases" ON file_cases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Documents" ON documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Notes" ON notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- STORAGE BUCKETS (Run via SQL Editor)
-- ==========================================
-- This part creates the storage bucket if it doesn't exist.
-- Note: 'storage' schema operations sometimes need to be done via UI or specialized API based on Supabase permissions.

INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies
-- We need to allow uploads to the storage bucket
DROP POLICY IF EXISTS "Public Storage Access" ON storage.objects;
CREATE POLICY "Public Storage Access" ON storage.objects FOR ALL USING ( bucket_id = 'documents' ) WITH CHECK ( bucket_id = 'documents' ); 
