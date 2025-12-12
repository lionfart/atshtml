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
    geminiModels: [
        'gemini-3.0-pro',
        'gemini-3.0-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.0-pro-exp',
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-8b',
        'gemini-1.0-pro'
    ],

    // Storage bucket name
    storageBucket: 'documents'
};
