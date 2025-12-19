-- Add primary_tag column to file_cases table
ALTER TABLE file_cases 
ADD COLUMN IF NOT EXISTS primary_tag TEXT;

-- Migrate existing tags to primary_tag
-- Priority: Çevre > Şehircilik > İmar > İdare > Ceza
UPDATE file_cases
SET primary_tag = 'Çevre'
WHERE 'Çevre' = ANY(tags) AND primary_tag IS NULL;

UPDATE file_cases
SET primary_tag = 'Şehircilik'
WHERE 'Şehircilik' = ANY(tags) AND primary_tag IS NULL;

UPDATE file_cases
SET primary_tag = 'İmar'
WHERE 'İmar' = ANY(tags) AND primary_tag IS NULL;

UPDATE file_cases
SET primary_tag = 'İdare'
WHERE 'İdare' = ANY(tags) AND primary_tag IS NULL;

UPDATE file_cases
SET primary_tag = 'Ceza'
WHERE 'Ceza' = ANY(tags) AND primary_tag IS NULL;

-- Remove the primary tags from the tags array (cleanup) to avoid duplication
-- Note: This is a bit complex in standard SQL without array_remove, 
-- but for now we will keep them in both or just verify primary_tag is set.
-- Only running the ADD COLUMN and categorization is safest for the user to run.

-- (Optional) If you want to enforce check constraints
-- ALTER TABLE file_cases ADD CONSTRAINT check_primary_tag 
-- CHECK (primary_tag IN ('Çevre', 'Şehircilik', 'İmar', 'İdare', 'Ceza', 'Diğer'));
