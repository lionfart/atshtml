import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import { getDb } from '../../../src/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { id } = req.query;

    try {
        if (req.method === 'PUT') {
            const { name } = req.body;
            if (!name) return res.status(400).json({ error: 'Name is required' });

            const db = await getDb();
            const doc = db.data!.documents.find(d => d.id === id);

            if (!doc) return res.status(404).json({ error: 'Document not found' });

            doc.name = name;
            await db.write();

            return res.status(200).json(doc);
        }

        if (req.method === 'DELETE') {
            const db = await getDb();
            const docIndex = db.data!.documents.findIndex(d => d.id === id);

            if (docIndex === -1) {
                return res.status(404).json({ error: 'Document not found' });
            }

            const doc = db.data!.documents[docIndex];

            // Delete from Disk
            if (doc.path && fs.existsSync(doc.path)) {
                try {
                    fs.unlinkSync(doc.path);
                } catch (err) {
                    console.error("Failed to delete file from disk:", err);
                    // Continue to delete metadata
                }
            }

            // Delete from DB
            db.data!.documents.splice(docIndex, 1);
            await db.write();

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error: any) {
        console.error("API error:", error);
        return res.status(500).json({ error: error.message });
    }
}
