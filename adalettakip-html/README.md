# Adalet Takip Sistemi - Vercel + Supabase

Modern, premium tasarımlı hukuk dosya takip sistemi. Saf HTML, CSS ve JavaScript ile geliştirilmiş, Vercel'de barındırma ve Supabase veritabanı için optimize edilmiştir.

## ✨ Özellikler

- **📁 Dosya Yönetimi**: Dava dosyalarını oluşturun, düzenleyin ve yönetin
- **👨‍⚖️ Avukat Takibi**: Avukat iş yükü ve durum takibi
- **🔄 Akıllı Atama**: Otomatik round-robin dosya dağıtımı catch-up algoritması ile
- **📄 Evrak Yönetimi**: Dosya yükleme ve görüntüleme (Supabase Storage)
- **🤖 AI Analiz**: Google Gemini ile OCR ve doküman analizi
- **📝 Not Sistemi**: Dosya bazlı not ve işlem geçmişi
- **🎨 Premium Tasarım**: Dark theme, glassmorphism, modern UI

## 🚀 Kurulum

### 1. Supabase Projesi Oluşturun

1. [supabase.com](https://supabase.com) adresine gidin
2. Yeni bir proje oluşturun
3. SQL Editor'e gidin
4. `supabase-schema.sql` dosyasındaki SQL'i çalıştırın
5. Storage bölümünden `documents` adında public bir bucket oluşturun

### 2. Supabase Bilgilerini Alın

Proje ayarlarından şu bilgileri alın:
- **Project URL**: `https://xxxxx.supabase.co`
- **Anon/Public Key**: API Keys bölümünden

### 3. Yapılandırmayı Güncelleyin

`js/config.js` dosyasını açın ve şu değerleri güncelleyin:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

### 4. Vercel'e Deploy Edin

#### Seçenek A: Vercel CLI

```bash
npm i -g vercel
vercel
```

#### Seçenek B: GitHub Entegrasyonu

1. Kodu GitHub'a yükleyin
2. Vercel'de "Import Project" seçin
3. Repository'yi bağlayın
4. Deploy edin

## 📁 Dosya Yapısı

```
adalettakip-html/
├── index.html          # Ana sayfa - Dashboard
├── files.html          # Dosya arşivi
├── file-detail.html    # Dosya detay sayfası
├── lawyer.html         # Avukat dashboard
├── css/
│   └── styles.css      # Tüm stiller
├── js/
│   ├── config.js       # Supabase yapılandırması
│   ├── supabase-client.js  # API fonksiyonları
│   ├── toast.js        # Bildirim sistemi
│   ├── utils.js        # Yardımcı fonksiyonlar
│   ├── app.js          # Ana sayfa JavaScript
│   ├── files.js        # Dosya listesi JavaScript
│   ├── file-detail.js  # Dosya detay JavaScript
│   └── lawyer.js       # Avukat sayfası JavaScript
├── supabase-schema.sql # Veritabanı şeması
├── vercel.json         # Vercel yapılandırması
└── README.md           # Bu dosya
```

## 🔧 Yapılandırma

### Google Gemini API (Opsiyonel)

AI analiz özelliği için:

1. [Google AI Studio](https://aistudio.google.com/) adresinden API anahtarı alın
2. Uygulamada "Sistem Ayarları" bölümüne gidin
3. API anahtarınızı kaydedin

### Catch-up Algoritması

Dosya dağıtımında adalet sağlamak için:

- **Nefes Alma Limiti**: Bir avukata üst üste kaç dosya atanabileceği
- İzinden dönen avukatlara borç telafisi sağlanır
- Round-robin rotasyonu ile eşit dağılım

## 🗄️ Veritabanı Tabloları

| Tablo | Açıklama |
|-------|----------|
| `lawyers` | Avukat bilgileri ve durumları |
| `file_cases` | Dava dosyaları |
| `documents` | Yüklenen evraklar |
| `notes` | Dosya notları |
| `system_settings` | Sistem ayarları |

## 🎨 Tasarım

- **Dark Theme**: Göz yormayan karanlık tema
- **Glassmorphism**: Modern cam efekti
- **Gradient Accents**: Premium görünüm için gradyan vurgular
- **Micro-animations**: Yumuşak geçişler
- **Responsive**: Mobil uyumlu

## 🔒 Güvenlik

- RLS (Row Level Security) politikaları
- XSS koruması
- CSRF koruması için güvenlik header'ları

**Not**: Production ortamı için RLS politikalarını authentication ile güçlendirin.

## 📝 Lisans

Bu proje MIT lisansı altında sunulmaktadır.

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing`)
5. Pull Request açın

---

**Adalet Takip Sistemi** © 2024
