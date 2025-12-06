import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from 'lib/database'; // Changed to absolute import

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = await getDb(); // Get the Lowdb instance

    if (req.method === 'GET') {
      // Handle GET requests to fetch examples
      // Access data directly from db.data
      const examples = db.data?.examples || [];
      return res.status(200).json(examples);
    } else if (req.method === 'POST') {
      // Handle POST requests to create a new example
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: 'Name is required' });
      }

      // Generate a simple ID (lowdb doesn't auto-increment like SQL dbs)
      const examples = db.data?.examples || [];
      const newId = examples.length > 0 ? Math.max(...examples.map(e => e.id)) + 1 : 1;

      const newExample = {
        id: newId,
        name,
        createdAt: new Date().toISOString(),
      };

      // Add the new example to the array
      db.data?.examples.push(newExample);

      // Write changes to the JSON file
      await db.write();

      return res.status(201).json(newExample);
    } else {
      // Method Not Allowed for other HTTP methods
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error('Database operation failed:', error.message || error);
    return res.status(500).json({ message: 'Internal server error', error: error.message || 'Unknown error' });
  }
}
