// ==========================================
// Supabase Client Initialization
// ==========================================

let supabase;

// Initialize Supabase client
function initSupabase() {
    if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' ||
        SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        console.warn('⚠️ Supabase credentials not configured.');
        showToast('Supabase yapılandırılmamış.', 'warning');
        return false;
    }

    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase client initialized');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize Supabase:', error);
        showToast('Supabase bağlantısı başarısız.', 'error');
        return false;
    }
}

// ==========================================
// Lawyers API
// ==========================================

async function getLawyers() {
    const { data, error } = await supabase.from('lawyers').select('*').order('name', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function getLawyerById(id) {
    const { data, error } = await supabase.from('lawyers').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

async function createLawyer(name, username, password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: existing } = await supabase.from('lawyers').select('id').eq('username', username).maybeSingle();
    if (existing) throw new Error('Bu kullanıcı adı alınmış.');

    const { data: newLawyer, error } = await supabase
        .from('lawyers')
        .insert([{ name, username, password_hash: passwordHash, role: 'LAWYER', status: 'ACTIVE' }])
        .select().single();

    if (error) throw error;
    return newLawyer;
}

function setupRealtimeLawyers(callback) {
    supabase
        .channel('public:lawyers')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lawyers' }, (payload) => {
            console.log('Avukat tablosu değişti:', payload);
            callback();
        })
        .subscribe();
}

// ==========================================
// File Cases & Smart Matching API
// ==========================================

async function getFileCases(options = {}) {
    let query = supabase.from('file_cases').select(`*, lawyers (id, name)`).order('created_at', { ascending: false });
    if (options.search) {
        const term = `%${options.search.toLowerCase()}%`;
        query = query.or(`plaintiff.ilike.${term},defendant.ilike.${term},court_case_number.ilike.${term},registration_number.ilike.${term},subject.ilike.${term}`);
    }
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
    if (analysisResult.court_case_number && analysisResult.court_case_number.length > 5 && !analysisResult.court_case_number.toLowerCase().includes('belirsiz')) {
        const { data } = await supabase.from('file_cases').select(`*, lawyers(name)`).ilike('court_case_number', analysisResult.court_case_number.trim()).maybeSingle();
        if (data) return { matchType: 'ESAS_NO', case: data };
    }
    if (analysisResult.plaintiff && analysisResult.plaintiff.length > 3 && !analysisResult.plaintiff.toLowerCase().includes('belirsiz')) {
        const { data } = await supabase.from('file_cases').select(`*, lawyers(name)`).ilike('plaintiff', `%${analysisResult.plaintiff.split(' ')[0]}%`).limit(5);
        if (data && data.length > 0) {
            const exactMatch = data.find(c => c.plaintiff.toLowerCase().includes(analysisResult.plaintiff.toLowerCase()));
            if (exactMatch) return { matchType: 'PARTIES', case: exactMatch };
        }
    }
    return null;
}

async function createFileCase(fileData, file = null) {
    let selectedLawyerId = fileData.lawyer_id;

    // A. Avukat Atama (Atomic DB Function)
    if (!selectedLawyerId) {
        // Use RPC to assign lawyer atomically in the database
        // Burst limit is optional logic, for now round-robin is safer via SQL
        const { data: assignedId, error: assignError } = await supabase.rpc('assign_next_lawyer_round_robin', { burst_limit: 2 });

        if (assignError) {
            console.error('Lawyer assignment RPC failed, fallback to JS logic:', assignError);
            // Fallback JS Logic (Not concurrent safe but better than crashing)
            const settings = await getSystemSettings();
            const lawyers = await getLawyers();
            const activeLawyers = lawyers.filter(l => l.status === 'ACTIVE');
            if (activeLawyers.length === 0) throw new Error('Atanabilecek aktif avukat yok.');
            const assigned = await assignLawyerLegacy(lawyers, activeLawyers, settings);
            selectedLawyerId = assigned.id;
        } else if (!assignedId) {
            throw new Error('Aktif avukat bulunamadı (DB).');
        } else {
            selectedLawyerId = assignedId;
        }
    }

    // B. Dosya No Üretimi (Atomic DB Function)
    // Eski yöntem: const count = ... (Race condition riski vardı)
    // Yeni yöntem: RPC
    const { data: regNumber, error: regError } = await supabase.rpc('get_next_case_number');

    // Fallback if RPC fails (e.g. function not created yet)
    let finalRegNumber = regNumber;
    if (regError || !regNumber) {
        console.warn('RPC get_next_case_number failed, using fallback.', regError);
        const year = new Date().getFullYear();
        const { count } = await supabase.from('file_cases').select('*', { count: 'exact', head: true }).gte('created_at', `${year}-01-01`);
        finalRegNumber = `${year}/${String((count || 0) + 1 + Math.floor(Math.random() * 10)).padStart(4, '0')}`; // Random padding to minimize collision slightly
    }

    // Create File Case
    const { data: newFile, error } = await supabase.from('file_cases').insert([{
        registration_number: finalRegNumber,
        court_name: fileData.court_name,
        court_case_number: fileData.court_case_number,
        plaintiff: fileData.plaintiff,
        defendant: fileData.defendant,
        claim_amount: fileData.claim_amount,
        subject: fileData.subject,
        lawyer_id: selectedLawyerId,
        status: 'OPEN'
    }]).select().single();

    if (error) throw error;

    // Upload Document
    if (file) {
        await uploadDocument(newFile.id, file, {
            summary: fileData.summary,
            type: fileData.type,
            viz_text: fileData.viz_text
        });
    }
    return newFile;
}

// Eski JS mantığı (Fallback için tutuyoruz)
async function assignLawyerLegacy(allLawyers, activeLawyers, settings) {
    let idx = (settings.last_assignment_index + 1) % allLawyers.length;
    let loops = 0;
    let selected = null;
    while (loops < allLawyers.length) {
        if (allLawyers[idx].status === 'ACTIVE') { selected = allLawyers[idx]; break; }
        idx = (idx + 1) % allLawyers.length;
        loops++;
    }
    if (!selected && activeLawyers.length > 0) selected = activeLawyers[0];

    // Update settings (unsafe)
    if (selected) {
        await supabase.from('lawyers').update({ assigned_files_count: (selected.assigned_files_count || 0) + 1 }).eq('id', selected.id);
        const index = allLawyers.findIndex(l => l.id === selected.id);
        await updateSystemSettings({ last_assignment_index: index });
    }
    return selected;
}

// ==========================================
// Documents API
// ==========================================
async function uploadDocument(fileCaseId, file, aiData = null) {
    const ext = file.name.split('.').pop();
    const fileName = `${fileCaseId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const { error: upErr } = await supabase.storage.from(APP_CONFIG.storageBucket).upload(fileName, file);
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from(APP_CONFIG.storageBucket).getPublicUrl(fileName);
    const { data: doc, error: docErr } = await supabase.from('documents').insert([{
        name: file.name, type: aiData?.type || file.type, file_case_id: fileCaseId,
        storage_path: fileName, public_url: urlData.publicUrl, analysis: aiData
    }]).select().single();
    if (docErr) throw docErr;
    let noteText = `📤 Yeni evrak: ${file.name}`; if (aiData && aiData.type) noteText += ` (${aiData.type})`;
    await createNote(fileCaseId, null, noteText);
    return doc;
}
async function createNote(fileCaseId, lawyerId, content) { await supabase.from('notes').insert([{ file_case_id: fileCaseId, lawyer_id: lawyerId, content }]); }
async function getNotes(fileCaseId) { return await supabase.from('notes').select(`*, lawyers(name)`).eq('file_case_id', fileCaseId).order('created_at', { ascending: false }); }

async function getSystemSettings() {
    const { data, error } = await supabase.from('system_settings').select('*').single();
    if (error && error.code === 'PGRST116') return await supabase.from('system_settings').insert([{ last_assignment_index: -1, catchup_burst_limit: 2 }]).select().single().then(r => r.data);
    return data;
}
async function updateSystemSettings(updates) {
    const { data: existing } = await supabase.from('system_settings').select('id').single();
    if (existing) return await supabase.from('system_settings').update(updates).eq('id', existing.id);
}

// ==========================================
// AI Analysis (Retry & Delay Logic)
// ==========================================

async function callGeminiWithFallback(apiKey, contentBody, modelIndex = 0) {
    const models = APP_CONFIG.geminiModels || ['gemini-1.5-flash'];
    if (modelIndex >= models.length) throw new Error('AI analizi başarısız. Tüm modeller denendi.');

    const currentModel = models[modelIndex];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
    console.log(`🤖 AI Request (${modelIndex + 1}/${models.length}): ${currentModel}`, url);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contentBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`⚠️ Model ${currentModel} hatası (${response.status}):`, errorText);

            // If API key is explicitly invalid, stop.
            if (response.status === 400 && errorText.includes('API_KEY_INVALID')) throw new Error('API Anahtarı geçersiz.');

            // IMPORTANT: If rate limited (429), wait longer
            const waitTime = response.status === 429 ? 3000 : 1000;
            await new Promise(r => setTimeout(r, waitTime));

            return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) {
            return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        }

        return data.candidates[0].content.parts[0].text || '';

    } catch (error) {
        console.error(`❌ Model ${currentModel} exception:`, error);
        await new Promise(r => setTimeout(r, 1500));

        if (modelIndex < models.length - 1) {
            return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        }
        throw error;
    }
}

async function analyzeWithGemini(text, apiKey) {
    if (!apiKey) throw new Error('API keysiz analiz yapılamaz.');
    const prompt = `
Sen Türk Hukuk Sistemine hakim uzman bir avukat asistanısın. Bu belgeyi analiz et ve YALNIZCA aşağıdaki JSON formatında veri döndür. Yorum yapma.
İSTENEN VERİLER:
1. "type": Evrakın hukuki türü.
2. "plaintiff": Davacı Adı Soyadı/Unvanı.
3. "defendant": Davalı Adı Soyadı/Unvanı.
4. "court_name": Mahkeme Adı.
5. "court_case_number": Esas Numarası (2023/123 E. gibi).
6. "claim_amount": Dava Değeri.
7. "subject": Dava Konusu / Özeti.
8. "summary": Evrakın içeriğinin özeti.
9. "viz_text": Belgenin ilk 300 karakterlik temiz metin önizlemesi.

BELGE METNİ:
"""
${text.slice(0, 30000)}
"""
`;
    // Force JSON response for latest models
    const contentBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
    };

    // Fallback logic inside helper will handle old models that don't support responseMimeType if needed, 
    // but Gemini 1.5+ supports it. If it fails, we catch it.

    try {
        const responseText = await callGeminiWithFallback(apiKey, contentBody);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        // Retry without JSON enforcement if failed
        const simpleBody = { contents: [{ parts: [{ text: prompt }] }] };
        const responseText = await callGeminiWithFallback(apiKey, simpleBody);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    }

    throw new Error('AI yanıtı çözümlenemedi.');
}

async function performOcrWithGemini(imageBase64, mimeType, apiKey) {
    const contentBody = {
        contents: [{
            parts: [
                { text: 'Metni çıkar.' },
                { inlineData: { mimeType: mimeType, data: imageBase64 } }
            ]
        }]
    };
    return await callGeminiWithFallback(apiKey, contentBody);
}
