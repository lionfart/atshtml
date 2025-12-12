import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../src/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const db = await getDb();
        if (!db.data) {
            return res.status(500).json({ error: 'Database not initialized' });
        }

        const { q, lawyerId, status } = req.query;

        let files = db.data.file_cases;

        // 1. Search (Case-insensitive)
        if (typeof q === 'string' && q.trim().length > 0) {
            const query = q.toLowerCase();
            files = files.filter(f =>
                (f.plaintiff && f.plaintiff.toLowerCase().includes(query)) ||
                (f.subject && f.subject.toLowerCase().includes(query)) ||
                (f.registration_number && f.registration_number.toLowerCase().includes(query))
            );
        }

        // 2. Filter by Lawyer
        if (typeof lawyerId === 'string' && lawyerId.trim().length > 0) {
            files = files.filter(f => f.lawyer_id === lawyerId);
        }

        // 3. Filter by Status
        if (typeof status === 'string' && status.trim().length > 0) {
            files = files.filter(f => f.status === status);
        }

        // 4. Sort by Date (Desc - Newest first)
        files.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Enrich with Lawyer Name
        const enrichedFiles = files.map(f => {
            const lawyer = db.data?.lawyers.find(l => l.id === f.lawyer_id);
            return {
                ...f,
                lawyer_name: lawyer ? lawyer.name : "Atanmamış" // Add lawyer name for UI convenience
            };
        });

        res.status(200).json(enrichedFiles);

    } catch (error) {
        console.error("File List API Error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
