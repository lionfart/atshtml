// ==========================================
// Adalet Takip Sistemi - Configuration
// ==========================================

// TODO: Replace with your actual Supabase project credentials
const SUPABASE_URL = 'https://sjjilkxxsnsaljmhddlh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2jdThnkkp2snAOG-7XMOZg_fpKkdumW';

// App Configuration
const APP_CONFIG = {
    // Maximum file size for uploads (20MB)
    maxFileSize: 20 * 1024 * 1024,

    // Supported file types for upload
    supportedFileTypes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],

    // Default settings
    defaultBurstLimit: 2,

    // Gemini Models (Fallback Priority List)
    // Updated based on user request and potential future releases
    // Gemini Models (Fallback Priority List)
    // Updated to currently available models
    // Gemini Models (Fallback Priority List)
    // using only stable versions to prevent 404s
    geminiModels: [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-2.0-flash-exp' // Keep one exp as backup/fast option if available
    ],

    // Storage bucket name
    storageBucket: 'documents',

    // Default API Key (User provided)
    DEFAULT_GEMINI_KEY: 'AIzaSyASPYTC-HPjDBEAkxUEkr5V94njQIqUqCw',

    // External Libraries
    libs: {
        jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        utif: 'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js',
        fullCalendarItems: [
            'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js'
        ],
        docx: 'https://unpkg.com/docx@7.1.0/build/index.js',
        fileSaver: 'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
        chartJs: 'https://cdn.jsdelivr.net/npm/chart.js'
    }
};
