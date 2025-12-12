# Adalet Takip Sistemi v2

AI destekli, çok kullanıcılı hukuk bürosu evrak yönetim ve dağıtım sistemi.

## 🚀 Özellikler
- **AI Analiz:** Google Gemini (1.5 Pro/Flash & 2.0 Exp) ile evrak OCR ve analizi.
- **Akıllı Eşleşme:** Esas numarası veya taraf isimlerinden mevcut dosyayı bulur.
- **Otomatik Dağıtım:** Avukatlara adil (Round Robin) iş dağıtımı yapar.
- **Canlı (Realtime):** Diğer kullanıcıların işlemleri anında ekrana düşer.

## 🛠 Kurulum ve 404 Hatası Çözümü

Eğer konsolda `POST .../rpc/get_next_case_number 404 (Not Found)` hatası görüyorsanız, veritabanı fonksiyonlarını kurmanız gerekir.

1. `supabase-concurrency.sql` dosyasının içeriğini kopyalayın.
2. [Supabase Dashboard](https://supabase.com/dashboard) adresine gidin.
3. Soldaki menüden **SQL Editor**'ü seçin.
4. Yeni bir sorgu oluşturup kodu yapıştırın ve **RUN** butonuna basın.

Bu işlem sonrası sistem "Fallback Modu"ndan çıkıp tam performanslı "Atomic Mod"a geçecektir.

## 📦 Dağıtım (Deploy)

Bu proje statik bir HTML/JS uygulamasıdır. Vercel, Netlify veya herhangi bir statik sunucuda çalışır.

1. GitHub'a pushlayın.
2. Vercel'de yeni proje oluşturup reponuzu seçin.
3. Framework Preset: **Other** seçin.
4. Output Directory: **.** (nokta / root) seçin.
