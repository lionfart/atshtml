import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../../src/lib/database';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { id } = req.query; // File ID

    if (typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid ID' });
    }

    const db = await getDb();
    if (!db.data) return res.status(500).json({ error: 'DB Error' });

    if (req.method === 'GET') {
        const notes = (db.data.notes || []).filter(n => n.file_case_id === id);

        // Enrich with lawyer Author name
        const enrichedNotes = notes.map(n => {
            const author = db.data?.lawyers.find(l => l.id === n.lawyer_id);
            return {
                ...n,
                author_name: author ? author.name : "Sistem"
            };
        });

        // Sort: Newest first
        enrichedNotes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return res.status(200).json(enrichedNotes);
    }

    if (req.method === 'POST') {
        const { content, lawyer_id } = req.body;

        if (!content) return res.status(400).json({ error: "Content required" });

        const newNote = {
            id: uuidv4(),
            file_case_id: id,
            lawyer_id: lawyer_id || null, // null = System
            content: content,
            created_at: new Date().toISOString()
        };

        if (!db.data.notes) db.data.notes = [];
        db.data.notes.push(newNote);
        await db.write();

        return res.status(201).json(newNote);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
}
