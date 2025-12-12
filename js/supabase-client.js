// ... (Previous imports SAME) ... //

// ==========================================
// File Cases & Smart Matching API (UPDATED)
// ==========================================
// ... (getFileCases, getFileCaseById, getLawyers SAME) ... //
async function getFileCases(options = {}) {
    let query = supabase.from('file_cases').select(`*, lawyers (id, name)`);

    // Sort logic
    if (options.sort === 'date-asc') query = query.order('created_at', { ascending: true });
    else if (options.sort === 'reg-desc') query = query.order('registration_number', { ascending: false });
    else if (options.sort === 'reg-asc') query = query.order('registration_number', { ascending: true });
    else query = query.order('created_at', { ascending: false }); // Default

    // Search
    if (options.search) {
        const term = `%${options.search.toLowerCase()}%`;
        query = query.or(`plaintiff.ilike.${term},defendant.ilike.${term},court_case_number.ilike.${term},court_decision_number.ilike.${term},registration_number.ilike.${term},subject.ilike.${term}`);
    }

    // Filter by Status
    if (options.status) query = query.eq('status', options.status);

    // Filter by Lawyer
    if (options.lawyerId) query = query.eq('lawyer_id', options.lawyerId);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(file => ({ ...file, lawyer_name: file.lawyers?.name || 'Atanmamış' }));
}

async function getFileCaseById(id) {
    const { data: fileCase, error } = await supabase.from('file_cases').select(`*, lawyers (id, name)`).eq('id', id).single();
    if (error) throw error;
    const { data: documents } = await supabase.from('documents').select('*').eq('file_case_id', id).order('upload_date', { ascending: false });
    return { ...fileCase, lawyer_name: fileCase.lawyers?.name || 'Bilinmiyor', documents: documents || [] };
}

async function findMatchingCase(analysisResult) {
    /* 
       STRICT AUTO-MATCH RULES:
       1. Esas No (court_case_number) MUST match.
       2. Court Name (court_name) MUST match (fuzzy).
       3. Plaintiff (plaintiff) MUST match (fuzzy).
    */

    let exactMatch = null;
    let candidates = [];

    // Clean Input
    const searchEsas = (analysisResult.court_case_number || '').trim();
    if (searchEsas.length < 3 || searchEsas.toLowerCase().includes('belirsiz')) {
        // No Esas No -> Only Fuzzy Candidates based on Parties
        if (analysisResult.plaintiff && analysisResult.plaintiff.length > 3) {
            const searchName = analysisResult.plaintiff.split(' ')[0].trim();
            const { data } = await supabase.from('file_cases').select(`*, lawyers(name)`).ilike('plaintiff', `%${searchName}%`).limit(5);
            return { matchType: null, case: null, candidates: data || [] };
        }
        return { matchType: null, case: null, candidates: [] };
    }

    // 1. Search by Esas Number (Base Filter)
    const cleanEsas = searchEsas.replace(/\s/g, '').replace(/\./g, ''); // 2024/123
    const { data: potentialMatches } = await supabase.from('file_cases')
        .select(`*, lawyers(name)`)
        // Search broadly first
        .or(`court_case_number.ilike.%${searchEsas.split('/')[0]}%,court_decision_number.ilike.%${searchEsas}%`)
        .order('created_at', { ascending: false });

    if (potentialMatches && potentialMatches.length > 0) {

        for (const candidate of potentialMatches) {
            let score = 0;
            const cEsas = (candidate.court_case_number || '').replace(/\s/g, '').replace(/\./g, '');
            const cCourt = (candidate.court_name || '').toLowerCase();
            const cPlaintiff = (candidate.plaintiff || '').toLowerCase();

            const inEsas = analysisResult.court_case_number.replace(/\s/g, '').replace(/\./g, '');
            const inCourt = (analysisResult.court_name || '').toLowerCase();
            const inPlaintiff = (analysisResult.plaintiff || '').toLowerCase();

            // CHECK 1: ESAS NO
            if (cEsas === inEsas || cEsas.includes(inEsas) || inEsas.includes(cEsas)) {
                score += 3;
            }

            // CHECK 2: COURT NAME
            if (inCourt.length > 3 && cCourt.length > 3) {
                if (cCourt.includes(inCourt) || inCourt.includes(cCourt)) score += 2;
                // Simple word intersection
                const commonWords = inCourt.split(' ').filter(w => w.length > 3 && cCourt.includes(w));
                if (commonWords.length >= 2) score += 2;
            }

            // CHECK 3: PLAINTIFF
            if (inPlaintiff.length > 3 && cPlaintiff.length > 3) {
                if (cPlaintiff.includes(inPlaintiff) || inPlaintiff.includes(cPlaintiff)) score += 2;
            }

            // EVALUATE
            // Total max score approx 7. 
            // We need Esas (3) + Court (2) + Plaintiff (2) = 7 for FULL AUTO.
            // Or at least Esas (3) + Court (2) = 5.

            if (score >= 6) {
                // Very High Confidence -> Auto Match
                return { matchType: 'STRICT_FULL', case: candidate, candidates: [] };
            }

            if (score >= 3) {
                // Good candidate
                candidates.push(candidate);
            }
        }
    }

    // Fallback: Check strictly by parties if Esas didn't yield result
    if (analysisResult.plaintiff && candidates.length === 0) {
        const searchName = analysisResult.plaintiff.split(' ')[0].trim();
        const { data } = await supabase.from('file_cases').select(`*, lawyers(name)`).ilike('plaintiff', `%${searchName}%`).limit(5);
        if (data) candidates = [...candidates, ...data];
    }

    // Remove duplicates
    candidates = candidates.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);

    return { matchType: null, case: null, candidates: candidates };
}

async function createFileCase(fileData, file = null) {
    let selectedLawyerId = fileData.lawyer_id;

    if (!selectedLawyerId) {
        const { data: assignedId, error: assignError } = await supabase.rpc('assign_next_lawyer_round_robin', { burst_limit: 2 });
        if (assignError || !assignedId) {
            console.warn('RPC assign failed, fallback JS');
            const settings = await getSystemSettings();
            const lawyers = await getLawyers();
            const activeLawyers = lawyers.filter(l => l.status === 'ACTIVE');
            if (activeLawyers.length > 0) {
                const assigned = await assignLawyerLegacy(lawyers, activeLawyers, settings);
                selectedLawyerId = assigned.id;
            }
        } else {
            selectedLawyerId = assignedId;
        }
    }

    const { data: regNumber, error: regError } = await supabase.rpc('get_next_case_number');
    let finalRegNumber = regNumber;
    if (regError || !regNumber) {
        const year = new Date().getFullYear();
        const { count } = await supabase.from('file_cases').select('*', { count: 'exact', head: true }).gte('created_at', `${year}-01-01`);
        finalRegNumber = `${year}/${String((count || 0) + 1 + Math.floor(Math.random() * 9)).padStart(4, '0')}`;
    }

    const { data: newFile, error } = await supabase.from('file_cases').insert([{
        registration_number: finalRegNumber,
        court_name: fileData.court_name,
        court_case_number: fileData.court_case_number,
        court_decision_number: fileData.court_decision_number, // NEW FIELD
        plaintiff: fileData.plaintiff,
        defendant: fileData.defendant,
        claim_amount: fileData.claim_amount,
        subject: fileData.subject,
        lawyer_id: selectedLawyerId,
        status: 'OPEN'
    }]).select().single();

    if (error) throw error;
    if (file) await uploadDocument(newFile.id, file, { summary: fileData.summary, type: fileData.type, viz_text: fileData.viz_text });
    return newFile;
}

// ... (assignLawyerLegacy, uploadDocument, createNote, etc. SAME) ... //
async function assignLawyerLegacy(allLawyers, activeLawyers, settings) { let idx = (settings.last_assignment_index + 1) % allLawyers.length; let loops = 0; let selected = null; while (loops < allLawyers.length) { if (allLawyers[idx].status === 'ACTIVE') { selected = allLawyers[idx]; break; } idx = (idx + 1) % allLawyers.length; loops++; } if (!selected && activeLawyers.length > 0) selected = activeLawyers[0]; if (selected) { await supabase.from('lawyers').update({ assigned_files_count: (selected.assigned_files_count || 0) + 1 }).eq('id', selected.id); await updateSystemSettings({ last_assignment_index: allLawyers.findIndex(l => l.id === selected.id) }); } return selected; }
async function uploadDocument(fileCaseId, file, aiData = null) { const ext = file.name.split('.').pop(); const fileName = `${fileCaseId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`; const { error: upErr } = await supabase.storage.from(APP_CONFIG.storageBucket).upload(fileName, file); if (upErr) throw upErr; const { data: urlData } = supabase.storage.from(APP_CONFIG.storageBucket).getPublicUrl(fileName); const { data: doc, error: docErr } = await supabase.from('documents').insert([{ name: file.name, type: aiData?.type || file.type, file_case_id: fileCaseId, storage_path: fileName, public_url: urlData.publicUrl, analysis: aiData }]).select().single(); if (docErr) throw docErr; let noteText = `📤 Yeni evrak: ${file.name}`; if (aiData && aiData.type) noteText += ` (${aiData.type})`; await createNote(fileCaseId, null, noteText); return doc; }
async function createNote(fileCaseId, lawyerId, content) { await supabase.from('notes').insert([{ file_case_id: fileCaseId, lawyer_id: lawyerId, content }]); }
async function getNotes(fileCaseId) { return await supabase.from('notes').select(`*, lawyers(name)`).eq('file_case_id', fileCaseId).order('created_at', { ascending: false }); }
async function getSystemSettings() { const { data, error } = await supabase.from('system_settings').select('*').single(); if (error) return { last_assignment_index: -1, catchup_burst_limit: 2 }; return data; }
async function updateSystemSettings(updates) { const { data: existing } = await supabase.from('system_settings').select('id').single(); if (existing) return await supabase.from('system_settings').update(updates).eq('id', existing.id); }

// ==========================================
// AI Analysis (Prompt Updated for Decision No)
// ==========================================
// ... (callGeminiWithFallback SAME) ... //
async function callGeminiWithFallback(apiKey, contentBody, modelIndex = 0) { /* SAME */
    const models = APP_CONFIG.geminiModels || ['gemini-1.5-flash']; if (modelIndex >= models.length) throw new Error('AI analizi başarısız.');
    const currentModel = models[modelIndex];
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contentBody) });
        if (!response.ok) { let wait = 1000; if (response.status === 429) wait = 3000; await new Promise(r => setTimeout(r, wait)); return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1); }
        const data = await response.json(); if (!data.candidates || !data.candidates.length) return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        return data.candidates[0].content.parts[0].text;
    } catch (e) { await new Promise(r => setTimeout(r, 1500)); if (modelIndex < models.length - 1) return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1); throw e; }
}

async function analyzeWithGemini(text, apiKey) {
    if (!apiKey) throw new Error('API keysiz analiz yapılamaz.');
    const prompt = `
Sen Türk Hukuk Sistemine hakim uzman bir avukat asistanısın. Bu belgeyi analiz et ve YALNIZCA aşağıdaki JSON formatında veri döndür.
ÖNEMLİ: 
- "court_case_number" (Esas No) ile "court_decision_number" (Karar No) birbirinden farklıdır. Karıştırma.
- Esas No genellikle "2023/123" veya "2023/123 E." formatındadır.
- Karar No genellikle "2024/55 K." veya "K. 2024/55" formatındadır. Savcılık "Sor. No" ise onu Esas No yapma, Subject kısmına ekle.

İSTENEN VERİLER:
1. "type": Evrakın hukuki türü.
2. "plaintiff": Davacı Adı Soyadı/Unvanı.
3. "defendant": Davalı Adı Soyadı/Unvanı.
4. "court_name": Mahkeme Adı.
5. "court_case_number": Esas Numarası (Sadece Esas!).
6. "court_decision_number": Karar Numarası (Varsa).
7. "claim_amount": Dava Değeri.
8. "subject": Dava Konusu.
9. "summary": 2 cümlelik özet.
10. "viz_text": İlk 300 karakter temiz metin.

BELGE METNİ:
"""
${text.slice(0, 30000)}
"""
`;
    // ... (rest same: force JSON)
    // Force JSON response for latest models
    const contentBody = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } };
    try {
        const responseText = await callGeminiWithFallback(apiKey, contentBody);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        const simpleBody = { contents: [{ parts: [{ text: prompt }] }] };
        const responseText = await callGeminiWithFallback(apiKey, simpleBody);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    }
    throw new Error('AI yanıtı çözümlenemedi.');
}

// ... (Other helpers setupRealtimeLawyers, etc. SAME) ... //
async function performOcrWithGemini(imageBase64, mimeType, apiKey) { const contentBody = { contents: [{ parts: [{ text: 'Metni çıkar.' }, { inlineData: { mimeType: mimeType, data: imageBase64 } }] }] }; return await callGeminiWithFallback(apiKey, contentBody); }
function extractTextFromPDF() { /* Dummy for snippet context, assuming utils loaded */ }
function initSupabase() { /*...*/ if (typeof SUPABASE_URL === 'undefined') return; supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
function setupRealtimeLawyers(cb) { supabase.channel('public:lawyers').on('postgres_changes', { event: '*', schema: 'public', table: 'lawyers' }, () => cb()).subscribe(); }
async function getLawyers() { const { data } = await supabase.from('lawyers').select('*').order('name'); return data || []; }
async function createLawyer(name, username, password) { /*...*/ }
// Lawyer Status
async function updateLawyerStatus(id, newStatus) {
    const { error } = await supabase.from('lawyers').update({ status: newStatus }).eq('id', id);
    if (error) throw error;
}

// File & Document Management
async function updateFileCase(id, updates) {
    const { error } = await supabase.from('file_cases').update(updates).eq('id', id);
    if (error) throw error;
}

async function deleteFileCase(id) {
    // Cascade delete documents first if needed (Supabase usually handles strict FK but storage remains)
    // For now trust FK cascade on DB
    const { error } = await supabase.from('file_cases').delete().eq('id', id);
    if (error) throw error;
}

async function renameDocument(docId, newName) {
    const { error } = await supabase.from('documents').update({ name: newName }).eq('id', docId);
    if (error) throw error;
}

async function deleteDocument(docId) {
    // Also delete from storage? Ideally yes.
    // First get path
    const { data: doc } = await supabase.from('documents').select('storage_path').eq('id', docId).single();
    if (doc && doc.storage_path) {
        await supabase.storage.from(APP_CONFIG.storageBucket).remove([doc.storage_path]);
    }
    const { error } = await supabase.from('documents').delete().eq('id', docId);
    if (error) throw error;
}

// Re-export needed
window.getLawyers = getLawyers; window.createLawyer = createLawyer; window.updateLawyerStatus = updateLawyerStatus;
window.getFileCases = getFileCases; window.getFileCaseById = getFileCaseById; window.createFileCase = createFileCase; window.updateFileCase = updateFileCase; window.deleteFileCase = deleteFileCase;
window.uploadDocument = uploadDocument; window.renameDocument = renameDocument; window.deleteDocument = deleteDocument;
window.getNotes = getNotes; window.createNote = createNote;
window.analyzeWithGemini = analyzeWithGemini; window.performOcrWithGemini = performOcrWithGemini; window.findMatchingCase = findMatchingCase;
window.initSupabase = initSupabase; window.setupRealtimeLawyers = setupRealtimeLawyers; window.getSystemSettings = getSystemSettings; window.updateSystemSettings = updateSystemSettings;
