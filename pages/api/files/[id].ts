import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../src/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { id } = req.query;

    if (typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid ID' });
    }

    const db = await getDb();
    if (!db.data) return res.status(500).json({ error: 'DB Error' });

    // --- GET: Details ---
    if (req.method === 'GET') {
        const file = db.data.file_cases.find(f => f.id === id);
        if (!file) return res.status(404).json({ error: 'File not found' });

        // Get related documents
        const documents = db.data.documents.filter(d => d.file_case_id === id);

        // Get lawyer info
        const lawyer = db.data.lawyers.find(l => l.id === file.lawyer_id);

        return res.status(200).json({
            ...file,
            lawyer_name: lawyer ? lawyer.name : null,
            documents
        });
    }

    // --- PUT: Update ---
    if (req.method === 'PUT') {
        const fileIndex = db.data.file_cases.findIndex(f => f.id === id);
        if (fileIndex === -1) return res.status(404).json({ error: 'File not found' });

        const { plaintiff, subject, registration_number, status } = req.body;

        // Update fields if provided
        if (plaintiff !== undefined) db.data.file_cases[fileIndex].plaintiff = plaintiff;
        if (subject !== undefined) db.data.file_cases[fileIndex].subject = subject;
        if (registration_number !== undefined) db.data.file_cases[fileIndex].registration_number = registration_number;
        if (status !== undefined) db.data.file_cases[fileIndex].status = status;

        await db.write();
        return res.status(200).json(db.data.file_cases[fileIndex]);
    }

    // --- DELETE: Hard Delete ---
    if (req.method === 'DELETE') {
        const fileIndex = db.data.file_cases.findIndex(f => f.id === id);
        if (fileIndex === -1) return res.status(404).json({ error: 'File not found' });

        // 1. Delete the file case
        db.data.file_cases.splice(fileIndex, 1);

        // 2. Delete associated documents (metadata only, physical files remain for safety/simplicity or can be cleaned up later)
        // Ideally we should delete physical files too, but let's stick to DB for now.
        const docsToRemove = db.data.documents.filter(d => d.file_case_id === id);
        if (docsToRemove.length > 0) {
            // Remove them from array
            db.data.documents = db.data.documents.filter(d => d.file_case_id !== id);
        }

        await db.write();
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
}
