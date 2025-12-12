-- ==========================================
-- Concurrency & Atomic Operations Setup
-- ==========================================

-- 1. Güvenli Dosya Numarası Üretimi (Sequence Table)
CREATE TABLE IF NOT EXISTS case_counters (
    year INT PRIMARY KEY,
    last_count INT DEFAULT 0
);

-- Fonksiyon: Yeni Numara Al (Atomik)
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
    
    -- Yıl kaydı yoksa oluştur, varsa kilitleyip arttır (UPSERT with Locking)
    INSERT INTO case_counters (year, last_count)
    VALUES (current_year, 0)
    ON CONFLICT (year) DO NOTHING;
    
    -- Atomic Increment
    UPDATE case_counters
    SET last_count = last_count + 1
    WHERE year = current_year
    RETURNING last_count INTO next_val;
    
    -- Format: 2024/0001
    result := current_year || '/' || LPAD(next_val::TEXT, 4, '0');
    
    RETURN result;
END;
$$;

-- 2. Güvenli Avukat Atama (Round Robin Atomic)
CREATE OR REPLACE FUNCTION assign_next_lawyer_round_robin(burst_limit INT)
RETURNS INT -- Returns Lawyer ID
LANGUAGE plpgsql
AS $$
DECLARE
    next_lawyer_id INT;
    active_lawyers INT[];
    st_settings RECORD;
    new_index INT;
    arr_len INT;
BEGIN
    -- 1. Aktif avukatların ID'lerini al (İsme göre sıralı, sabit sıra için)
    SELECT ARRAY_AGG(id ORDER BY name ASC) INTO active_lawyers
    FROM lawyers
    WHERE status = 'ACTIVE';

    arr_len := ARRAY_LENGTH(active_lawyers, 1);
    
    -- Avukat yoksa NULL dön
    IF arr_len IS NULL THEN
        RETURN NULL;
    END IF;

    -- 2. Sistem ayarlarını kilitleyip oku (FOR UPDATE)
    SELECT * INTO st_settings FROM system_settings LIMIT 1 FOR UPDATE;

    -- Ayar yoksa oluştur
    IF NOT FOUND THEN
        INSERT INTO system_settings (last_assignment_index) VALUES (-1) RETURNING * INTO st_settings;
    END IF;

    -- 3. İndeksi hesapla
    new_index := (COALESCE(st_settings.last_assignment_index, -1) + 1) % arr_len;

    -- 4. Ayarı güncelle
    UPDATE system_settings SET last_assignment_index = new_index;

    -- 5. Seçilen Avukatın ID'sini bul
    next_lawyer_id := active_lawyers[new_index + 1]; -- PostgreSQL arrays are 1-based

    -- 6. Avukatın dosya sayısını arttır
    UPDATE lawyers 
    SET assigned_files_count = COALESCE(assigned_files_count, 0) + 1 
    WHERE id = next_lawyer_id;

    RETURN next_lawyer_id;
END;
$$;

-- İzinleri Ayarla
GRANT EXECUTE ON FUNCTION get_next_case_number TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION assign_next_lawyer_round_robin TO anon, authenticated, service_role;
GRANT ALL ON TABLE case_counters TO anon, authenticated, service_role;
