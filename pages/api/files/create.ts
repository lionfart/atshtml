import type { NextApiRequest, NextApiResponse } from 'next';
import { assignLawyerToFile } from '../../../src/lib/services/file-assignment';
import { IncomingForm, File as FormidableFile, Fields, Files } from 'formidable';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../../src/lib/database';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    // Ensure uploads directory exists
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const form = new IncomingForm({
        uploadDir: uploadDir,
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
    });

    try {
        const [fields, files] = await new Promise<[Fields, Files]>((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                resolve([fields, files]);
            });
        });

        const plaintiff = Array.isArray(fields.plaintiff) ? fields.plaintiff[0] : fields.plaintiff;
        const subject = Array.isArray(fields.subject) ? fields.subject[0] : fields.subject;

        if (!plaintiff || !subject) {
            return res.status(400).json({ error: 'Plaintiff and Subject are required' });
        }

        // 1. Create File Case & Assign Lawyer
        const newFile = await assignLawyerToFile({ plaintiff, subject });

        // 2. Handle Attached File (if any)
        const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
        if (uploadedFile) {
            const db = await getDb();
            const docId = uuidv4();

            // Move file to a permanent location logically? 
            // Formidable already puts it in 'uploads/'. We just need to track the path.
            // We'll rename it to be clearer if needed, but keeping the formidable generated name is safer for collisions 
            // OR we rename to `docId-originalName`.

            // Let's keep it simple for now, verify path exists.
            const stats = fs.statSync(uploadedFile.filepath);

            const newDoc = {
                id: docId,
                name: uploadedFile.originalFilename || "unknown_file",
                type: uploadedFile.mimetype || "application/octet-stream",
                upload_date: new Date().toISOString(),
                file_case_id: newFile.id,
                path: uploadedFile.filepath // Store absolute path
            };

            db.data.documents.push(newDoc);
            await db.write();

            // Append to response
            (newFile as any).documents = [newDoc];
        }

        return res.status(201).json(newFile);

    } catch (error: any) {
        console.error('File creation error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
