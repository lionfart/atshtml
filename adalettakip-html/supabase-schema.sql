-- ==========================================
-- Adalet Takip Sistemi - Supabase Database Schema
-- ==========================================
-- Run this SQL in Supabase SQL Editor to create the required tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- LAWYERS TABLE
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

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_lawyers_status ON lawyers(status);

-- ==========================================
-- FILE_CASES TABLE
-- ==========================================
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

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_file_cases_lawyer ON file_cases(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_file_cases_status ON file_cases(status);
CREATE INDEX IF NOT EXISTS idx_file_cases_created ON file_cases(created_at DESC);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_file_cases_search ON file_cases USING gin(
    to_tsvector('simple', coalesce(plaintiff, '') || ' ' || coalesce(subject, '') || ' ' || coalesce(registration_number, ''))
);

-- ==========================================
-- DOCUMENTS TABLE
-- ==========================================
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

-- Index for file case lookup
CREATE INDEX IF NOT EXISTS idx_documents_file_case ON documents(file_case_id);

-- ==========================================
-- NOTES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_case_id UUID NOT NULL REFERENCES file_cases(id) ON DELETE CASCADE,
    lawyer_id UUID REFERENCES lawyers(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for file case notes
CREATE INDEX IF NOT EXISTS idx_notes_file_case ON notes(file_case_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);

-- ==========================================
-- SYSTEM_SETTINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    last_assignment_index INTEGER DEFAULT -1,
    catchup_burst_limit INTEGER DEFAULT 2,
    catchup_sequence_count INTEGER DEFAULT 0,
    gemini_api_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings if not exists
INSERT INTO system_settings (last_assignment_index, catchup_burst_limit, catchup_sequence_count, gemini_api_key)
SELECT -1, 2, 0, ''
WHERE NOT EXISTS (SELECT 1 FROM system_settings LIMIT 1);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE lawyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- For development/demo: Allow all operations with anon key
-- In production, you should implement proper authentication policies

-- Lawyers policies
CREATE POLICY "Allow all operations on lawyers" ON lawyers
    FOR ALL USING (true) WITH CHECK (true);

-- File cases policies
CREATE POLICY "Allow all operations on file_cases" ON file_cases
    FOR ALL USING (true) WITH CHECK (true);

-- Documents policies
CREATE POLICY "Allow all operations on documents" ON documents
    FOR ALL USING (true) WITH CHECK (true);

-- Notes policies
CREATE POLICY "Allow all operations on notes" ON notes
    FOR ALL USING (true) WITH CHECK (true);

-- System settings policies
CREATE POLICY "Allow all operations on system_settings" ON system_settings
    FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- UPDATED_AT TRIGGER FUNCTION
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_lawyers_updated_at
    BEFORE UPDATE ON lawyers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_file_cases_updated_at
    BEFORE UPDATE ON file_cases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- STORAGE BUCKET SETUP
-- ==========================================
-- Run this in Storage section or via API:
-- Create a bucket called 'documents' with public access

-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('documents', 'documents', true)
-- ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- SAMPLE DATA (Optional)
-- ==========================================
-- Uncomment to insert sample lawyers for testing

-- INSERT INTO lawyers (name, username, password_hash, role, status) VALUES
-- ('Av. Ahmet Yılmaz', 'ahmet', 'demo_hash', 'LAWYER', 'ACTIVE'),
-- ('Av. Ayşe Demir', 'ayse', 'demo_hash', 'LAWYER', 'ACTIVE'),
-- ('Av. Mehmet Öz', 'mehmet', 'demo_hash', 'LAWYER', 'ACTIVE');
