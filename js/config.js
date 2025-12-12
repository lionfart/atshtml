// ==========================================
// Supabase Configuration
// ==========================================

// TODO: Replace with your actual Supabase project credentials
// You can find these in your Supabase project settings -> API

const SUPABASE_URL = 'https://sjjilkxxsnsaljmhddlh.supabase.co'; // e.g., 'https://xxxxx.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_2jdThnkkp2snAOG-7XMOZg_fpKkdumW'; // Your anon/public key

// Gemini API Key (optional - can also be stored in system_settings table)
const DEFAULT_GEMINI_API_KEY = '';

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
    geminiModels: [
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro',
        'gemini-pro',
        'gemini-1.0-pro'
    ],

    // Storage bucket name
    storageBucket: 'documents'
};
