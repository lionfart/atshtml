import { NextApiRequest, NextApiResponse } from 'next';
import { analyzeLegalText } from '../../src/lib/analysis';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });

    try {
        // Wrap simple text in the expected object structure
        const result = await analyzeLegalText({ text });
        return res.status(200).json(result);
    } catch (error: any) {
        console.error("AI Analysis API Error:", error);
        // Map specific error
        if (error.message === 'GEMINI_API_KEY_MISSING') {
            return res.status(500).json({ error: 'AI Service Not Configured (Missing API Key). Please add it in Settings.' });
        }
        return res.status(500).json({ error: error.message || 'AI Analysis failed' });
    }
}
