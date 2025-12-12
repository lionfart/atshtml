import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../src/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const db = await getDb();
    if (!db.data) return res.status(500).json({ error: 'DB not initialized' });

    if (req.method === 'GET') {
        res.status(200).json(db.data.system_settings);
    } else if (req.method === 'PUT') {
        const { catchup_burst_limit, gemini_api_key } = req.body;

        let changed = false;
        if (typeof catchup_burst_limit === 'number') {
            db.data.system_settings.catchup_burst_limit = catchup_burst_limit;
            changed = true;
        }

        if (typeof gemini_api_key === 'string') {
            // Basic validation
            db.data.system_settings.gemini_api_key = gemini_api_key.trim();
            changed = true;
        }

        if (changed) {
            await db.write();
        }

        res.status(200).json(db.data.system_settings);
    } else {
        res.status(405).json({ error: 'Method Not Allowed' });
    }
}
