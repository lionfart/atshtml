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

    // OpenRouter Models (Text-only, Free tier priority)
    // Primary AI provider - all models use OpenRouter API
    openRouterModels: [
        'deepseek/deepseek-r1-0528:free',
        'meta-llama/llama-3.1-405b-instruct:free',
        'nousresearch/hermes-3-llama-3.1-405b:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'mistralai/mistral-small-3.1-24b-instruct:free',
        'qwen/qwen3-coder:free',
        'allenai/olmo-3.1-32b-think:free',
        'tngtech/deepseek-r1t-chimera:free',
        'tngtech/deepseek-r1t2-chimera:free',
        'tngtech/tng-r1t-chimera:free',
        'alibaba/tongyi-deepresearch-30b-a3b:free',
        'openai/gpt-oss-120b:free',
        'z-ai/glm-4.5-air:free',
        'nex-agi/deepseek-v3.1-nex-n1:free',
        'mistralai/devstral-2512:free',
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'xiaomi/mimo-v2-flash:free',
        'meta-llama/llama-3.2-3b-instruct:free'
    ],

    // Model Capabilities Mapping (Vision vs Text-only)
    modelCapabilities: {
        'google/gemini-2.0-flash-exp:free': ['text', 'vision'],
        'xiaomi/mimo-v2-flash:free': ['text', 'vision'], // Multimodal
        'meta-llama/llama-3.2-90b-vision-instruct:free': ['text', 'vision'], // If user adds it
        // Default to text-only for others
    },

    // OpenRouter Vision Models (for OCR)
    openRouterVisionModels: [
        'google/gemini-2.0-flash-exp:free',
        'qwen/qwen-2.5-vl-7b-instruct:free',
        'nvidia/nemotron-nano-12b-v2-vl:free'
    ],

    // Storage bucket name
    storageBucket: 'documents',

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
