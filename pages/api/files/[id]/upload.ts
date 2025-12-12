import type { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm, Fields, Files } from 'formidable';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../../../src/lib/database';
import { prepareFileForAnalysis, analyzeLegalText } from '../../../../src/lib/analysis';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { id } = req.query; // File ID
    const { scan } = req.query; // ?scan=true

    if (req.method !== 'POST') return res.status(405).end();

    // Ensure uploads directory exists
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const form = new IncomingForm({
        uploadDir: uploadDir,
        keepExtensions: true,
        maxFileSize: 20 * 1024 * 1024, // 20MB
    });

    try {
        const [fields, files] = await new Promise<[Fields, Files]>((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                resolve([fields, files]);
            });
        });

        const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
        if (!uploadedFile) return res.status(400).json({ error: "No file" });

        const db = await getDb();
        const docId = uuidv4();

        const newDoc = {
            id: docId,
            name: uploadedFile.originalFilename || "unknown_file",
            type: uploadedFile.mimetype || "application/octet-stream",
            upload_date: new Date().toISOString(),
            file_case_id: id as string,
            path: uploadedFile.filepath
        };

        db.data?.documents.push(newDoc);

        // --- Scanning Logic ---
        let aiNote = null;
        if (scan === 'true') {
            try {
                // 1. Prepare File
                const analysisInput = await prepareFileForAnalysis({
                    path: uploadedFile.filepath,
                    mimeType: uploadedFile.mimetype || 'application/octet-stream',
                    originalFilename: uploadedFile.originalFilename || 'unknown'
                });

                // 2. AI Analysis
                const analysisRef = await analyzeLegalText(analysisInput);

                // 3. Create Note & Update Document
                const docType = analysisRef.type || 'Gelen Evrak';
                const emojiMap: Record<string, string> = {
                    'Dava Dilekçesi': '📜',
                    'Cevap Dilekçesi': '🛡️',
                    'Savunma Dilekçesi': '🛡️',
                    'Bilirkişi Raporu': '🧐',
                    'Ara Karar': '⚖️',
                    'Gerekçeli Karar': '👨‍⚖️',
                    'Duruşma Zaptı': '🏛️',
                    'İstinaf Başvurusu': '📈',
                    'Temyiz Başvurusu': '🏛️'
                };
                const emoji = emojiMap[docType] || '📄';
                const summaryText = `Tür: ${docType}\nKonu: ${analysisRef.subject || 'Belirlenemedi'}\nTaraf: ${analysisRef.plaintiff || '-'}`;

                // Update the document object in DB (find it first or update variable)
                const docIndex = db.data?.documents.findIndex(d => d.id === docId);
                if (docIndex !== undefined && docIndex >= 0 && db.data) {
                    db.data.documents[docIndex].analysis = {
                        type: docType,
                        summary: summaryText,
                        subject: analysisRef.subject
                    };
                }

                const noteContent = `
**${emoji} ${docType} Yüklendi**
Evrak: ${newDoc.name}

🔎 **Özet/Analiz:**
- **Analiz Türü:** ${docType}
- **Konu:** ${analysisRef.subject || 'Belirlenemedi'}
- **İlgili Taraf:** ${analysisRef.plaintiff || '-'}
                `.trim();

                aiNote = {
                    id: uuidv4(),
                    file_case_id: id as string,
                    lawyer_id: null,
                    content: noteContent,
                    created_at: new Date().toISOString()
                };

                // Update FileCase Status
                const fileCase = db.data?.file_cases.find(f => f.id === id);
                if (fileCase) {
                    fileCase.latest_activity_type = docType;
                    fileCase.latest_activity_date = new Date().toISOString();

                    if (analysisRef.decision_result && analysisRef.decision_result !== 'KARAR YOK') {
                        fileCase.latest_decision_result = analysisRef.decision_result;
                    }
                }

                db.data?.notes.push(aiNote);

            } catch (err: any) {
                console.error("Scan during upload failed:", err);

                // Add error note
                db.data?.notes.push({
                    id: uuidv4(),
                    file_case_id: id as string,
                    lawyer_id: null,
                    content: `⚠️ Evrak analizi başarısız oldu: ${err.message || 'Hata'}`,
                    created_at: new Date().toISOString()
                });
            }
        } else {
            // Just a simple upload log
            const simpleNote = {
                id: uuidv4(),
                file_case_id: id as string,
                lawyer_id: null,
                content: `📤 Yeni evrak eklendi: ${newDoc.name}`,
                created_at: new Date().toISOString()
            };
            db.data?.notes.push(simpleNote);
        }

        await db.write();
        return res.status(201).json({ document: newDoc, note: aiNote });

    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
}
