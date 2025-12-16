-- AI Enhanced Automation Migration

-- 1. Add columns to FILE_CASES for workflow management
ALTER TABLE public.file_cases 
ADD COLUMN IF NOT EXISTS next_hearing_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS case_status_notes TEXT DEFAULT NULL;

-- 2. Add columns to DOCUMENTS for AI analysis results
-- Note: 'documents' table might represent the uploaded files metadata in storage or a separate table.
-- Assuming we store analysis result in 'file_cases' or we need a 'documents' table if not exists.
-- For this app, we mostly used 'file_cases' directly. Let's add fields to 'file_cases' for the LAST document info,
-- OR create a 'case_documents' table if we want to track multiple documents per case.

-- Let's stick to 'file_cases' for simplicity as the "Latest Action", 
-- but ideally we should have a 'activities' or 'documents' table.
-- Given the current scope, let's create a separate table for AI extracted actions to keep it clean.

CREATE TABLE IF NOT EXISTS public.case_actions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id UUID REFERENCES public.file_cases(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    action_type TEXT, -- 'HEARING', 'DEADLINE', 'TASK'
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    urgency TEXT DEFAULT 'MEDIUM', -- 'HIGH', 'MEDIUM', 'LOW'
    is_completed BOOLEAN DEFAULT FALSE,
    ai_suggested BOOLEAN DEFAULT TRUE
);

-- Enable RLS
ALTER TABLE public.case_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for anon" ON public.case_actions
FOR ALL USING (true) WITH CHECK (true);
