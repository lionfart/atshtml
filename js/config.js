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
    // Gemini Models (Fallback Priority List)
    // Updated as strictly requested by user (v3.0 first)
    geminiModels: [
        'gemini-3.0-pro',
        'gemini-3.0-flash',
        'gemini-2.0-pro-exp',
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-1.5-pro-002',
        'gemini-1.5-flash-002',
        'gemini-1.5-flash-8b',
        'gemini-1.0-pro',
        'gemini-pro'
    ],

    // Storage bucket name
    storageBucket: 'documents',

    // Default API Key (User provided)
    DEFAULT_GEMINI_KEY: 'AIzaSyASPYTC-HPjDBEAkxUEkr5V94njQIqUqCw',

    // OpenRouter Configuration (DO NOT HARDCODE KEYS HERE - they will be deleted by OpenRouter)
    OPENROUTER_API_KEY: '',
    openRouterModels: [
        'google/gemini-2.0-flash-exp:free',
        'google/gemma-3-27b-it:free',
        'google/gemma-3-12b-it:free',
        'mistralai/mistral-small-3.1-24b-instruct:free',
        'qwen/qwen-2.5-vl-7b-instruct:free',
        'nvidia/nemotron-nano-12b-v2-vl:free',
        'sourceful/riverflow-v2-max-preview',
        'sourceful/riverflow-v2-standard-preview',
        'sourceful/riverflow-v2-fast-preview',
        'allenai/olmo-3.1-32b-think:free',
        'xiaomi/mimo-v2-flash:free',
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'mistralai/devstral-2512:free',
        'nex-agi/deepseek-v3.1-nex-n1:free'
    ],

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
