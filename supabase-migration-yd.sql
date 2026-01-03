-- Migration: Add yd_result column to file_cases table
-- For Ara Karar documents with Yürütmenin Durdurulması (YD) decisions
-- Run this in your Supabase SQL Editor

ALTER TABLE file_cases 
ADD COLUMN IF NOT EXISTS yd_result VARCHAR(50);

-- Comment for clarity
COMMENT ON COLUMN file_cases.yd_result IS 'Yürütmenin Durdurulması sonucu (YD Kabul / YD Red) - Sadece Ara Karar için';
