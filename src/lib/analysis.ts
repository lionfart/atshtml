import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from './database';
import mammoth from 'mammoth';

// Helper to load pdf-parse (it's a CommonJS module)
const pdf = require('pdf-parse');

export interface FileData {
    path: string;
    mimeType: string;
    originalFilename: string;
}

/**
 * Prepares file content for analysis.
 * - For Text/Word: Extracts text locally.
 * - For PDF/Image: Returns the file buffer for AI Multimodal processing.
 */
export async function prepareFileForAnalysis(file: FileData): Promise<{ text?: string, inlineData?: { mimeType: string, data: string } }> {
    console.log(`[Analysis] Preparing file: ${file.originalFilename} (${file.mimeType})`);

    // 1. Text Files
    if (file.mimeType === 'text/plain' || file.originalFilename.toLowerCase().endsWith('.txt')) {
        const text = fs.readFileSync(file.path, 'utf-8');
        return { text };
    }

    // 2. Word Files (.docx)
    if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.originalFilename.toLowerCase().endsWith('.docx')) {
        try {
            const buffer = fs.readFileSync(file.path);
            const result = await mammoth.extractRawText({ buffer });
            return { text: result.value };
        } catch (e: any) {
            console.error('[Analysis] Mammoth Error:', e);
            throw new Error('Word dosyası okunamadı. Dosya bozuk veya şifreli olabilir.');
        }
    }

    // 3. PDF and Images (Multimodal)
    const isPdf = file.mimeType === 'application/pdf' || file.originalFilename.toLowerCase().endsWith('.pdf');
    const isImage = file.mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.originalFilename);

    if (isPdf || isImage) {
        // Read file as base64
        const fileBuffer = fs.readFileSync(file.path);
        const base64Data = fileBuffer.toString('base64');

        // Ensure accurate mime type assignment
        let mimeType = file.mimeType;
        if (file.originalFilename.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
        if (file.originalFilename.toLowerCase().endsWith('.jpg')) mimeType = 'image/jpeg';
        if (file.originalFilename.toLowerCase().endsWith('.png')) mimeType = 'image/png';

        return {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };
    }

    throw new Error('Desteklenmeyen dosya formatı. (Sadece PDF, Word, Resim ve Metin dosyaları desteklenir)');
}

export interface AnalysisResult {
    type?: string;
    plaintiff?: string;
    subject?: string;
    decision_result?: string;
    raw_ai_response?: any;
    text_content?: string; // Optional return of extracted text if useful
}

export async function analyzeLegalText(input: { text?: string, inlineData?: { mimeType: string, data: string } }): Promise<AnalysisResult> {
    // 1. Get API Key
    const db = await getDb();
    const apiKey = db.data?.system_settings.gemini_api_key || process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY_MISSING");
    }

    // 2. Init AI
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash as per discovery, fallback to 1.5-flash if needed.
    // Multimodal inputs are supported in both.
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const promptText = `
        Sen uzman bir hukuk asistanısın. Sunulan belgeyi dikkatlice incele.
        
        GÖREV:
        1. "Evrak Türü"nü sınıflandır. Seçenekler:
           - "Dava Dilekçesi"
           - "Cevap Dilekçesi"
           - "Savunma Dilekçesi"
           - "Bilirkişi Raporu"
           - "Ara Karar"
           - "Gerekçeli Karar" (İlam)
           - "Duruşma Zaptı"
           - "İstinaf Başvurusu"
           - "Temyiz Başvurusu"
           - "Diğer"
        2. "Davacı" (Plaintiff) ismini bul.
        3. "Dava Konusu"nu (Subject) özetle (kısa ve öz).
        4. EĞER evrak türü bir "Karar" (Gerekçeli Karar, Ara Karar vs.) ise, kararın SONUCUNU şu etiketlerden biriyle ifade et ("decision_result" alanına yaz):
           - "DAVA KABUL"
           - "DAVA RED"
           - "DAVA KISMEN KABUL"
           - "TAZMİNAT KABUL"
           - "TAZMİNAT RED"
           - "TAZMİNAT KISMEN KABUL"
           - "GÖREVSİZLİK"
           - "YETKİSİZLİK"
           - "DOSYA İŞLEMDEN KALDIRILDI"
           - "KARAR YOK" (Eğer karar evrakı değilse veya sonuç yoksa)

        YANIT (JSON):
        {
          "type": "Evrak Türü",
          "plaintiff": "...",
          "subject": "...",
          "decision_result": "..." 
        }
    `;

    try {
        let result;
        if (input.inlineData) {
            // Multimodal Request
            result = await model.generateContent([promptText, { inlineData: input.inlineData }]);
        } else if (input.text) {
            // Text Request
            result = await model.generateContent([
                promptText,
                `BELGE METNİ:\n"""\n${input.text.slice(0, 30000)}\n"""` // Limit text just in case
            ]);
        } else {
            throw new Error('Analiz için veri sağlanamadı.');
        }

        const response = await result.response;
        let jsonStr = response.text();

        // Cleanup Markdown
        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(jsonStr);
        return parsed;

    } catch (e: any) {
        console.error("[Analysis] AI Error:", e);
        // Better error mapping
        if (e.message?.includes('400')) throw new Error('Yapay zeka dosyayı okuyamadı (Format veya boyut hatası).');
        if (e.message?.includes('403')) throw new Error('API anahtarı yetkisiz veya kota aşıldı.');

        throw new Error("Yapay zeka analizi başarısız oldu. Lütfen tekrar deneyin.");
    }
}
