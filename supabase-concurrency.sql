-- ================================================================
-- ADALET TAKİP SİSTEMİ V2 - VERİTABANI KURULUMU (ZORUNLU)
-- ================================================================
-- Bu kodu Supabase Dashboard -> SQL Editor kısmına yapıştırıp "RUN" butonuna basın.
-- Bu işlem:
-- 1. Dosya numaralarının çakışmasını önleyen atomik sayacı kurar.
-- 2. Avukatlara adil dosya dağıtımı yapan robotu (Round Robin) devreye alır.
-- 3. Gerekli izinleri verir.

-- 1. Güvenli Dosya Numarası Tablosu
CREATE TABLE IF NOT EXISTS case_counters (
    year INT PRIMARY KEY,
    last_count INT DEFAULT 0
);

-- 2. Sistem Ayarları Tablosunu Garantile
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gemini_api_key TEXT,
    last_assignment_index INT DEFAULT -1,
    catchup_burst_limit INT DEFAULT 2,
    catchup_sequence_count INT DEFAULT 0
);
-- Tek bir ayar satırı olduğundan emin ol
INSERT INTO system_settings (last_assignment_index) 
SELECT -1 WHERE NOT EXISTS (SELECT 1 FROM system_settings);

-- 3. Fonksiyon: Yeni Numara Al (Atomik)
CREATE OR REPLACE FUNCTION get_next_case_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    current_year INT;
    next_val INT;
    result TEXT;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW());
    
    -- Yıl kaydı yoksa oluştur
    INSERT INTO case_counters (year, last_count)
    VALUES (current_year, 0)
    ON CONFLICT (year) DO NOTHING;
    
    -- Kilitle ve Arttır
    UPDATE case_counters
    SET last_count = last_count + 1
    WHERE year = current_year
    RETURNING last_count INTO next_val;
    
    -- Format: 2024/0001
    result := current_year || '/' || LPAD(next_val::TEXT, 4, '0');
    
    RETURN result;
END;
$$;

-- 4. Fonksiyon: Adil Avukat Atama (Round Robin Atomic)
CREATE OR REPLACE FUNCTION assign_next_lawyer_round_robin(burst_limit INT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    next_lawyer_id INT;
    active_lawyers INT[];
    st_settings RECORD;
    new_index INT;
    arr_len INT;
BEGIN
    -- Aktif avukatları al
    SELECT ARRAY_AGG(id ORDER BY name ASC) INTO active_lawyers
    FROM lawyers
    WHERE status = 'ACTIVE';

    arr_len := ARRAY_LENGTH(active_lawyers, 1);
    IF arr_len IS NULL THEN RETURN NULL; END IF;

    -- Ayarları kilitle
    SELECT * INTO st_settings FROM system_settings LIMIT 1 FOR UPDATE;

    -- Sıradaki indeksi hesapla
    new_index := (COALESCE(st_settings.last_assignment_index, -1) + 1) % arr_len;

    -- Kaydet
    UPDATE system_settings SET last_assignment_index = new_index;

    -- Avukatı seç ve güncelle
    next_lawyer_id := active_lawyers[new_index + 1];
    
    UPDATE lawyers 
    SET assigned_files_count = COALESCE(assigned_files_count, 0) + 1 
    WHERE id = next_lawyer_id;

    RETURN next_lawyer_id;
END;
$$;

-- 5. İzinleri Aç (404 Hatasını Çözen Kısım)
GRANT EXECUTE ON FUNCTION get_next_case_number TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION assign_next_lawyer_round_robin TO anon, authenticated, service_role;
GRANT ALL ON TABLE case_counters TO anon, authenticated, service_role;
GRANT ALL ON TABLE system_settings TO anon, authenticated, service_role;
