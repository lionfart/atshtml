-- Add court and basis_number to decisions table
ALTER TABLE decisions 
ADD COLUMN IF NOT EXISTS court VARCHAR(255),
ADD COLUMN IF NOT EXISTS basis_number VARCHAR(100);

COMMENT ON COLUMN decisions.court IS 'Kararı veren mahkeme adı (örn: Ankara 1. Asliye Hukuk)';
COMMENT ON COLUMN decisions.basis_number IS 'Karar merci esas numarası (örn: 2024/123 E.)';
