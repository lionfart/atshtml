import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb, Lawyer } from '../../src/lib/database';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const db = await getDb();
    if (!db.data) {
        return res.status(500).json({ error: 'Database not initialized' });
    }

    if (req.method === 'GET') {
        return res.status(200).json(db.data.lawyers);
    }

    if (req.method === 'POST') {
        const { name, username, password } = req.body;
        if (!name || !username || !password) {
            return res.status(400).json({ error: 'Name, Username, and Password are required' });
        }

        // Check uniqueness
        if (db.data.lawyers.some(l => l.username === username)) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const password_hash = await import('bcryptjs').then(m => m.hash(password, 10));

        const newLawyer: Lawyer = {
            id: uuidv4(),
            name,
            username,
            password_hash,
            role: 'LAWYER',
            status: 'ACTIVE',
            missed_assignments_count: 0,
            assigned_files_count: 0,
        };

        db.data.lawyers.push(newLawyer);
        await db.write();

        return res.status(201).json({ id: newLawyer.id, name: newLawyer.name, username: newLawyer.username });
    }

    if (req.method === 'PUT') {
        const { id, status } = req.body;
        const lawyer = db.data.lawyers.find((l) => l.id === id);

        if (!lawyer) {
            return res.status(404).json({ error: 'Lawyer not found' });
        }

        if (status) {
            if (status !== 'ACTIVE' && status !== 'ON_LEAVE') {
                return res.status(400).json({ error: 'Invalid status' });
            }
            lawyer.status = status;
        }

        const { leave_return_date } = req.body;
        if (leave_return_date !== undefined) {
            lawyer.leave_return_date = leave_return_date; // string or null
        }

        await db.write();
        return res.status(200).json(lawyer);
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
}
