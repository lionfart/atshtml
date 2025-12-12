import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { prepareFileForAnalysis } from '../../src/lib/analysis';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const form = formidable();

    try {
        const [fields, files] = await form.parse(req);
        const uploadedFile = files.file?.[0];

        if (!uploadedFile) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        try {
            const analysisInput = await prepareFileForAnalysis({
                path: uploadedFile.filepath,
                mimeType: uploadedFile.mimetype || 'application/octet-stream',
                originalFilename: uploadedFile.originalFilename || 'unknown'
            });

            let text = "";
            if (analysisInput.text) {
                text = analysisInput.text;
            } else if (analysisInput.inlineData) {
                // Use Gemini for Transcription (OCR)
                const { GoogleGenerativeAI } = require('@google/generative-ai');
                const { getDb } = require('../../src/lib/database');

                const db = await getDb();
                const apiKey = db.data?.system_settings.gemini_api_key || process.env.GEMINI_API_KEY;

                if (apiKey) {
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                    const result = await model.generateContent([
                        "Bu belgedeki tüm metni olduğu gibi dışarı aktar (OCR). Yorum yapma, sadece metni ver.",
                        { inlineData: analysisInput.inlineData }
                    ]);
                    text = result.response.text();
                } else {
                    throw new Error("OCR için AI anahtarı veya yerel kütüphane bulunamadı.");
                }
            }

            // Cleanup upload temp file
            try { fs.unlinkSync(uploadedFile.filepath); } catch (e) { }

            return res.status(200).json({ text });

        } catch (e: any) {
            // Cleanup even if failed
            try { fs.unlinkSync(uploadedFile.filepath); } catch { }
            throw e;
        }

    } catch (error: any) {
        console.error('OCR API Error:', error);
        res.status(500).json({ error: error.message || 'Server Error' });
    }
}
