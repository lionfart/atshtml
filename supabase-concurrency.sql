-- Add leave_return_date to lawyers
ALTER TABLE public.lawyers 
ADD COLUMN IF NOT EXISTS leave_return_date DATE DEFAULT NULL;

-- Function to automatically activate lawyers whose leave has ended
CREATE OR REPLACE FUNCTION public.check_and_update_lawyer_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update status to ACTIVE and clear return date for lawyers whose return date has passed or is today
  UPDATE public.lawyers
  SET status = 'ACTIVE', leave_return_date = NULL
  WHERE status = 'ON_LEAVE' 
  AND leave_return_date IS NOT NULL 
  AND leave_return_date <= CURRENT_DATE;
END;
$$;

-- Enhanced Round Robin Assignment
CREATE OR REPLACE FUNCTION public.assign_lawyer_round_robin()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    selected_lawyer_id uuid;
BEGIN
    -- 1. First, wake up any lawyers whose vacation has ended
    PERFORM public.check_and_update_lawyer_status();

    -- 2. Select next available lawyer
    -- Must be ACTIVE and (either no return date or return date is past)
    SELECT id INTO selected_lawyer_id
    FROM public.lawyers
    WHERE status = 'ACTIVE'
    ORDER BY last_assignment_at ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- 3. Update their assignment time
    IF selected_lawyer_id IS NOT NULL THEN
        UPDATE public.lawyers
        SET last_assignment_at = NOW()
        WHERE id = selected_lawyer_id;
    END IF;

    RETURN selected_lawyer_id;
END;
$$;
