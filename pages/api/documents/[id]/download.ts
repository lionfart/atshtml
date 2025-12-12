import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { getDb } from '../../../../src/lib/database';

export const config = {
    api: {
        responseLimit: false,
    },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { id } = req.query;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const db = await getDb();
        const doc = db.data!.documents.find(d => d.id === id);

        if (!doc || !doc.path || !fs.existsSync(doc.path)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const stat = fs.statSync(doc.path);

        // Determine content type
        let contentType = doc.type || 'application/octet-stream';
        // Force PDF inline view
        if (doc.name.toLowerCase().endsWith('.pdf')) contentType = 'application/pdf';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name)}"`);

        const readStream = fs.createReadStream(doc.path);
        readStream.pipe(res);

    } catch (error: any) {
        console.error("Download error:", error);
        res.status(500).json({ error: error.message });
    }
}
