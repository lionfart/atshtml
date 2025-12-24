-- Migration: Create legal_opinions table for Hukuki Mütalaa (Legal Opinions) module
-- Run this in Supabase SQL Editor

-- Create legal_opinions table
CREATE TABLE IF NOT EXISTS legal_opinions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_number TEXT UNIQUE NOT NULL,
    requesting_institution TEXT,
    subject TEXT,
    urgency TEXT DEFAULT 'MEDIUM',
    lawyer_id UUID REFERENCES lawyers(id),
    lawyer_name TEXT,
    ai_suggestion TEXT,
    summary TEXT,
    status TEXT DEFAULT 'OPEN',
    deadline_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create opinion_documents table for storing documents
CREATE TABLE IF NOT EXISTS opinion_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opinion_id UUID REFERENCES legal_opinions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT,
    storage_path TEXT,
    public_url TEXT,
    analysis JSONB,
    upload_date TIMESTAMPTZ DEFAULT NOW()
);

-- Add opinions_assignment_index to system_settings for separate lawyer queue
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS opinions_assignment_index INTEGER DEFAULT 0;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_opinions_status ON legal_opinions(status);
CREATE INDEX IF NOT EXISTS idx_opinions_lawyer ON legal_opinions(lawyer_id);
