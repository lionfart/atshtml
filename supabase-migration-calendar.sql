-- Migration: Create calendar_events table for manual calendar entries
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_date DATE NOT NULL,
    event_time TIME,
    lawyer_id UUID REFERENCES lawyers(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users (adjust as needed)
CREATE POLICY "Allow all for authenticated users" ON calendar_events
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Create index for faster date queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
