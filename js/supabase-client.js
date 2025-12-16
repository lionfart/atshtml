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
       STRICT AUTO-MATCH RULES v2:
       1. Esas No (court_case_number) MUST match exactly for High Confidence.
       2. If Esas matches, suggest it strongly and hide weak fuzzy matches.
       3. If no Esas match, use strict fuzzy logic.
    */

    let candidates = [];
    const searchEsas = (analysisResult.court_case_number || '').trim();

    // 1. Search by Esas Number (Primary)
    if (searchEsas.length >= 3 && !searchEsas.toLowerCase().includes('belirsiz')) {
        const cleanEsas = searchEsas.replace(/\s/g, '').replace(/\./g, '');

        // Split year/number if possible (e.g. 2024/123)
        let exactQuery = `court_case_number.ilike.%${searchEsas}%`;

        const { data: potentialMatches } = await supabase.from('file_cases')
            .select(`*, lawyers(name)`)
            .or(`court_case_number.ilike.%${searchEsas.split('/')[0]}%,court_decision_number.ilike.%${searchEsas}%`)
            .order('created_at', { ascending: false });

        if (potentialMatches && potentialMatches.length > 0) {
            for (const candidate of potentialMatches) {
                let reasons = [];
                let score = 0;

                const cEsas = (candidate.court_case_number || '').replace(/\s/g, '').replace(/\./g, '');
                const cCourt = (candidate.court_name || '').toLowerCase();
                const inCourt = (analysisResult.court_name || '').toLowerCase();
                const inEsasSimple = searchEsas.replace(/\s/g, '').replace(/\./g, '');

                // CHECK 1: ESAS NO
                if (cEsas === inEsasSimple) {
                    score += 10;
                    reasons.push("Esas No Tam Eşleşme");
                } else if (cEsas.includes(inEsasSimple) || inEsasSimple.includes(cEsas)) {
                    score += 5;
                    reasons.push("Esas No Benzerliği");
                }

                // CHECK 2: COURT NAME
                if (inCourt.length > 3 && cCourt.length > 3) {
                    if (cCourt.includes(inCourt) || inCourt.includes(cCourt)) {
                        score += 3;
                        reasons.push("Mahkeme Adı Eşleşmesi");
                    }
                }

                if (score >= 5) {
                    candidates.push({ ...candidate, matchScore: score, matchReason: reasons.join(', ') });
                }
            }
        }
    }

    // If we have a very strong Esas match, don't look further
    const strongMatch = candidates.find(c => c.matchScore >= 10);
    if (strongMatch) {
        return { matchType: 'STRICT_FULL', case: strongMatch, candidates: [strongMatch] };
    }

    // 2. Fallback: Fuzzy Search by Parties (ONLY if no strong Esas candidates found)
    if (candidates.length === 0 && analysisResult.plaintiff && analysisResult.plaintiff.length > 4) {
        const searchName = analysisResult.plaintiff.split(' ')[0].trim();
        const { data } = await supabase.from('file_cases')
            .select(`*, lawyers(name)`)
            .ilike('plaintiff', `%${searchName}%`)
            .limit(5);

        if (data) {
            data.forEach(c => {
                const inPlaintiff = (analysisResult.plaintiff || '').toLowerCase();
                const cPlaintiff = (c.plaintiff || '').toLowerCase();
                if (cPlaintiff.includes(inPlaintiff) || inPlaintiff.includes(cPlaintiff)) {
                    candidates.push({ ...c, matchScore: 3, matchReason: "Davacı Adı Benzerliği" });
                }
            });
        }
    }

    // Remove duplicates
    candidates = candidates.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
    // Sort by score
    candidates.sort((a, b) => b.matchScore - a.matchScore);

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
async function uploadDocument(fileCaseId, file, aiData = null) {
    const ext = file.name.split('.').pop();
    const fileName = `${fileCaseId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const { error: upErr } = await supabase.storage.from(APP_CONFIG.storageBucket).upload(fileName, file);
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from(APP_CONFIG.storageBucket).getPublicUrl(fileName);
    const { data: doc, error: docErr } = await supabase.from('documents').insert([{ name: file.name, type: aiData?.type || file.type, file_case_id: fileCaseId, storage_path: fileName, public_url: urlData.publicUrl, analysis: aiData }]).select().single();
    if (docErr) throw docErr;

    // Note Content
    let noteText = `📤 Yeni evrak: ${file.name}`;
    if (aiData && aiData.type) noteText += ` (${aiData.type})`;
    if (aiData && aiData.summary) noteText += `\n📝 Özet: ${aiData.summary}`;

    await createNote(fileCaseId, null, noteText);

    // Update File Case Activity
    await supabase.from('file_cases').update({
        latest_activity_type: aiData?.type || 'Yeni Evrak',
        latest_activity_date: new Date().toISOString()
    }).eq('id', fileCaseId);

    return doc;
}
async function createNote(fileCaseId, lawyerId, content) { await supabase.from('notes').insert([{ file_case_id: fileCaseId, lawyer_id: lawyerId, content }]); }
async function getNotes(fileCaseId) { return await supabase.from('notes').select(`*, lawyers(name)`).eq('file_case_id', fileCaseId).order('created_at', { ascending: false }); }
async function getSystemSettings() { const { data, error } = await supabase.from('system_settings').select('*').single(); if (error) return { last_assignment_index: -1, catchup_burst_limit: 2 }; return data; }
async function updateSystemSettings(updates) { const { data: existing } = await supabase.from('system_settings').select('id').single(); if (existing) return await supabase.from('system_settings').update(updates).eq('id', existing.id); }

// ==========================================
// AI Analysis (Prompt Updated for Decision No & Workflow)
// ==========================================
async function callGeminiWithFallback(apiKey, contentBody, modelIndex = 0) {
    // Model Priority: 2.0 Flash (Fast/Smart) -> 1.5 Flash (Reliable) -> 1.5 Pro (Fallback)
    const models = APP_CONFIG.geminiModels || ['gemini-2.0-flash-exp', 'gemini-1.5-flash'];

    if (modelIndex >= models.length) throw new Error('AI analizi başarısız.');
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
AMAÇ: Hukuk bürosu iş akışını otomatize etmek. Sadece temel bilgileri değil, avukatın yapması gerekenleri ve takvimi çıkar.

ÖNEMLİ KURALLAR:
1. "court_case_number" (Esas) vs "court_decision_number" (Karar) farkına dikkat et.
2. Savcılık "Sor. No" varsa Subject kısmına ekle, Esas No yapma.
3. TARİHLERİ "YYYY-MM-DD" formatında çıkar. Bulamazsan null yap.
4. "urgency": Eğer süre kısıtlaması varsa (örn: "2 hafta kesin süre", "yakalama emri") "HIGH", normal dava akışıysa "MEDIUM", sadece bilgi amaçlıysa "LOW".

İSTENEN JSON FORMATI:
{
  "type": "Dilekçe | Mahkeme Kararı | Tensip Zaptı | Bilirkişi Raporu | Diğer",
  "plaintiff": "Davacı Adı",
  "defendant": "Davalı Adı",
  "court_name": "Mahkeme Adı",
  "court_case_number": "2023/123 E.",
  "court_decision_number": "2024/55 K. (Yoksa null)",
  "claim_amount": "100.000 TL (Yoksa null)",
  "subject": "Dava Konusu",
  "summary": "2 cümlelik özet.",
  "next_hearing_date": "YYYY-MM-DD (Gelecek duruşma tarihi varsa)",
  "deadline_date": "YYYY-MM-DD (Cevap süresi veya kesin süre bitişi)",
  "suggested_action": "Örn: '2 hafta içinde cevap dilekçesi hazırla' veya 'Duruşmaya katıl'",
  "urgency": "HIGH | MEDIUM | LOW",
  "viz_text": "İlk 300 karakter temiz metin"
}

BELGE METNİ:
"""
${text.slice(0, 30000)}
"""
`;
    // Force JSON response
    const contentBody = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } };
    try {
        const responseText = await callGeminiWithFallback(apiKey, contentBody);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.warn("JSON parsing failed, retrying with simple prompt...");
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
function initSupabase() {
    if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') {
        console.error('Supabase URL veya Key tanımlı değil!');
        return false;
    }
    try {
        if (!window.supabaseClient) {
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        supabase = window.supabaseClient;
        return true;
    } catch (e) {
        console.error('Supabase başlatılamadı:', e);
        return false;
    }
}
function setupRealtimeLawyers(cb) { supabase.channel('public:lawyers').on('postgres_changes', { event: '*', schema: 'public', table: 'lawyers' }, () => cb()).subscribe(); }
async function getLawyers() { const { data } = await supabase.from('lawyers').select('*').order('name'); return data || []; }
async function createLawyer(name, username, password) { /*...*/ }
// Lawyer Status
// Lawyer Status
async function updateLawyerStatus(id, newStatus, returnDate = null) {
    const updates = { status: newStatus };
    if (newStatus === 'ON_LEAVE' && returnDate) {
        updates.leave_return_date = returnDate;
    } else {
        updates.leave_return_date = null;
    }
    const { error } = await supabase.from('lawyers').update(updates).eq('id', id);
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
