-- Migration: Add attachment support to documents table
-- Run this in your Supabase SQL Editor

-- Add columns to track main document vs attachments
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS parent_document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Index for faster parent lookups
CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_document_id);
CREATE INDEX IF NOT EXISTS idx_documents_is_main ON documents(is_main);

-- Comments
COMMENT ON COLUMN documents.is_main IS 'True if this is the main document, false if attachment';
COMMENT ON COLUMN documents.parent_document_id IS 'For attachments, references the main document';
COMMENT ON COLUMN documents.sort_order IS 'Display order for attachments';
