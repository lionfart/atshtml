import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../src/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { id } = req.query;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const db = await getDb();
        const lawyer = db.data?.lawyers.find(l => l.id === id);

        if (!lawyer) {
            return res.status(404).json({ error: 'Lawyer not found' });
        }

        // Calculate Stats
        const files = db.data?.file_cases.filter(f => f.lawyer_id === id) || [];
        const totalFiles = files.length;
        const openFiles = files.filter(f => f.status === 'OPEN').length;
        const closedFiles = files.filter(f => f.status === 'CLOSED').length;

        // Recent Files
        const recentFiles = [...files]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5);

        // Decision Stats
        const decisions: Record<string, number> = {};
        files.forEach(f => {
            if (f.latest_decision_result) {
                const res = f.latest_decision_result.toUpperCase();
                // Simple normalization if needed, or raw grouping
                decisions[res] = (decisions[res] || 0) + 1;
            }
        });

        return res.status(200).json({
            lawyer,
            stats: {
                totalFiles,
                openFiles,
                closedFiles,
                decisions
            },
            recentFiles
        });

    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
}
