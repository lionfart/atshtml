// ==========================================
// Supabase Client Initialization
// ==========================================

let supabase;

// Initialize Supabase client
function initSupabase() {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
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
    const { data, error } = await supabase
        .from('lawyers')
        .select('*')
        .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
}

async function getLawyerById(id) {
    const { data, error } = await supabase
        .from('lawyers')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

async function createLawyer(name, username, password) {
    // Simple hash for demo
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: existing } = await supabase.from('lawyers').select('id').eq('username', username).single();
    if (existing) throw new Error('Bu kullanıcı adı alınmış.');

    const { data: newLawyer, error } = await supabase
        .from('lawyers')
        .insert([{
            name, username, password_hash: passwordHash,
            role: 'LAWYER', status: 'ACTIVE'
        }])
        .select().single();

    if (error) throw error;
    return newLawyer;
}

// ==========================================
// File Cases & Smart Matching API
// ==========================================

async function getFileCases(options = {}) {
    let query = supabase
        .from('file_cases')
        .select(`*, lawyers (id, name)`)
        .order('created_at', { ascending: false });

    if (options.search) {
        const term = `%${options.search.toLowerCase()}%`;
        // Search in multiple fields
        query = query.or(`plaintiff.ilike.${term},defendant.ilike.${term},court_case_number.ilike.${term},registration_number.ilike.${term},subject.ilike.${term}`);
    }

    if (options.lawyerId) query = query.eq('lawyer_id', options.lawyerId);
    if (options.status) query = query.eq('status', options.status);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(file => ({
        ...file,
        lawyer_name: file.lawyers?.name || 'Atanmamış'
    }));
}

async function getFileCaseById(id) {
    const { data: fileCase, error } = await supabase
        .from('file_cases')
        .select(`*, lawyers (id, name)`)
        .eq('id', id)
        .single();

    if (error) throw error;

    const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .eq('file_case_id', id)
        .order('upload_date', { ascending: false });

    return {
        ...fileCase,
        lawyer_name: fileCase.lawyers?.name || 'Bilinmiyor',
        documents: documents || []
    };
}

// SMART MATCHING FUNCTION
async function findMatchingCase(analysisResult) {
    // 1. Exact Match on Esas Number (Highly reliable)
    if (analysisResult.court_case_number && analysisResult.court_case_number.length > 5) {
        const { data } = await supabase
            .from('file_cases')
            .select(`*, lawyers(name)`)
            .ilike('court_case_number', analysisResult.court_case_number)
            .single(); // Assuming unique esas within context, or returns first match

        if (data) return { matchType: 'ESAS_NO', case: data };
    }

    // 2. Fuzzy Match on Parties (Plaintiff & Defendant)
    if (analysisResult.plaintiff && analysisResult.defendant) {
        // Search for cases where BOTH parties roughly match
        const { data } = await supabase
            .from('file_cases')
            .select(`*, lawyers(name)`)
            .ilike('plaintiff', `%${analysisResult.plaintiff.split(' ')[0]}%`) // Search by first name part
            .ilike('defendant', `%${analysisResult.defendant.split(' ')[0]}%`);

        // Refine in JS (client-side) for better accuracy
        if (data && data.length > 0) {
            // Simple check: does the full name allow for a confident match?
            const exactMatch = data.find(c =>
                c.plaintiff.toLowerCase().includes(analysisResult.plaintiff.toLowerCase()) &&
                (c.defendant && c.defendant.toLowerCase().includes(analysisResult.defendant.toLowerCase()))
            );
            if (exactMatch) return { matchType: 'PARTIES', case: exactMatch };
        }
    }

    return null; // No confident match found
}

async function createFileCase(fileData, file = null) {
    // Determine Lawyer
    let selectedLawyerId = fileData.lawyer_id;

    // Automatic assignment if no lawyer specified
    if (!selectedLawyerId) {
        const settings = await getSystemSettings();
        const lawyers = await getLawyers();
        const activeLawyers = lawyers.filter(l => l.status === 'ACTIVE');
        if (activeLawyers.length === 0) throw new Error('Atanabilecek aktif avukat yok.');

        const assignedLawyer = await assignLawyer(lawyers, activeLawyers, settings);
        selectedLawyerId = assignedLawyer.id;

        // Update lawyer stats
        await supabase
            .from('lawyers')
            .update({ assigned_files_count: (assignedLawyer.assigned_files_count || 0) + 1 })
            .eq('id', selectedLawyerId);
    }

    // Generate System Reg Number (Year/Seq)
    const year = new Date().getFullYear();
    const { count } = await supabase.from('file_cases').select('*', { count: 'exact', head: true }).gte('created_at', `${year}-01-01`);
    const regNumber = `${year}/${String((count || 0) + 1).padStart(4, '0')}`;

    // Create File Case
    const { data: newFile, error } = await supabase
        .from('file_cases')
        .insert([{
            registration_number: regNumber,
            court_name: fileData.court_name,
            court_case_number: fileData.court_case_number, // Esas No
            plaintiff: fileData.plaintiff,
            defendant: fileData.defendant,
            claim_amount: fileData.claim_amount,
            subject: fileData.subject,
            lawyer_id: selectedLawyerId,
            status: 'OPEN'
        }])
        .select()
        .single();

    if (error) throw error;

    // Upload Document if provided
    if (file) {
        await uploadDocument(newFile.id, file, {
            summary: fileData.summary,
            type: fileData.type,
            viz_text: fileData.viz_text // Preview text
        });
    }

    return newFile;
}

// ==========================================
// Lawyer Assignment Logic
// ==========================================

async function assignLawyer(allLawyers, activeLawyers, settings) {
    // Calculate average
    const totalFiles = activeLawyers.reduce((sum, l) => sum + (l.assigned_files_count || 0), 0);
    const avg = totalFiles / activeLawyers.length;

    // Catch-up Candidates (Below average)
    const needed = activeLawyers
        .map(l => ({ ...l, deficit: avg - (l.assigned_files_count || 0) }))
        .filter(l => l.deficit > 0.5) // Significant deficit
        .sort((a, b) => b.deficit - a.deficit);

    const burstLimit = settings.catchup_burst_limit || 2;
    const currentSeq = settings.catchup_sequence_count || 0;

    let selected;
    let newSeq = currentSeq;

    // Logic: If we are in a sequence for a needy lawyer, continue giving them files OR if we have a needy lawyer start giving
    if (needed.length > 0 && currentSeq < burstLimit) {
        selected = needed[0];
        newSeq++;
        console.log(`[CATCH-UP] Assigned to ${selected.name} (${newSeq}/${burstLimit})`);
    } else {
        // Round Robin
        newSeq = 0;
        let idx = (settings.last_assignment_index + 1) % allLawyers.length;
        let loops = 0;
        while (loops < allLawyers.length) {
            if (allLawyers[idx].status === 'ACTIVE') {
                selected = allLawyers[idx];
                break;
            }
            idx = (idx + 1) % allLawyers.length;
            loops++;
        }
        if (!selected) selected = activeLawyers[0]; // Fallback

        await updateSystemSettings({ last_assignment_index: allLawyers.findIndex(l => l.id === selected.id) });
        console.log(`[ROTATION] Assigned to ${selected.name}`);
    }

    await updateSystemSettings({ catchup_sequence_count: newSeq });
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

    const { data: doc, error: docErr } = await supabase
        .from('documents')
        .insert([{
            name: file.name,
            type: aiData?.type || file.type, // Use AI detected type if available
            file_case_id: fileCaseId,
            storage_path: fileName,
            public_url: urlData.publicUrl,
            analysis: aiData // Store full AI analysis JSON
        }])
        .select().single();

    if (docErr) throw docErr;

    // Create note
    let noteText = `📤 Yeni evrak: ${file.name}`;
    if (aiData && aiData.type) noteText += ` (${aiData.type})`;
    await createNote(fileCaseId, null, noteText);

    return doc;
}

async function deleteDocument(id) {
    const { data: doc } = await supabase.from('documents').select('storage_path').eq('id', id).single();
    if (doc?.storage_path) await supabase.storage.from(APP_CONFIG.storageBucket).remove([doc.storage_path]);
    await supabase.from('documents').delete().eq('id', id);
    return true;
}

// ==========================================
// System Settings & Notes (Helpers)
// ==========================================

async function getSystemSettings() {
    const { data, error } = await supabase.from('system_settings').select('*').single();
    if (error && error.code === 'PGRST116') {
        return await supabase.from('system_settings').insert([{ last_assignment_index: -1, catchup_burst_limit: 2 }]).select().single().then(r => r.data);
    }
    return data;
}

async function updateSystemSettings(updates) {
    const { data: existing } = await supabase.from('system_settings').select('id').single();
    if (existing) {
        return await supabase.from('system_settings').update(updates).eq('id', existing.id);
    }
}

async function createNote(fileCaseId, lawyerId, content) {
    await supabase.from('notes').insert([{ file_case_id: fileCaseId, lawyer_id: lawyerId, content }]);
}

async function getNotes(fileCaseId) {
    return await supabase.from('notes').select(`*, lawyers(name)`).eq('file_case_id', fileCaseId).order('created_at', { ascending: false });
}

// ==========================================
// AI Analysis (Generic Fallback Handler)
// ==========================================

async function callGeminiWithFallback(apiKey, contentBody, modelIndex = 0) {
    const models = APP_CONFIG.geminiModels || ['gemini-1.5-flash-001'];
    if (modelIndex >= models.length) throw new Error('AI analizi başarısız.');

    const currentModel = models[modelIndex];
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contentBody)
        });

        if (!response.ok) {
            // Check for API Key error specifically
            if (response.status === 400 && (await response.clone().text()).includes('API_KEY')) throw new Error('API Key Invalid');
            return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);

        return data.candidates[0].content.parts[0].text || '';
    } catch (e) {
        if (modelIndex < models.length - 1) return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        throw e;
    }
}

async function analyzeWithGemini(text, apiKey) {
    if (!apiKey) throw new Error('API keysiz analiz yapılamaz.');

    const prompt = `
Sen Türk Hukuk Sistemine hakim uzman bir avukat asistanısın. Bu belgeyi analiz et ve YALNIZCA aşağıdaki JSON formatında veri döndür. Yorum yapma.

İSTENEN VERİLER:
1. "type": Evrakın hukuki türü (Dava Dilekçesi, Cevap Dilekçesi, Bilirkişi Raporu, Ara Karar, Tensip Zaptı, Duruşma Tutanağı vb.)
2. "plaintiff": Davacı Adı Soyadı/Unvanı (Yoksa "Belirsiz")
3. "defendant": Davalı Adı Soyadı/Unvanı (Yoksa "Belirsiz")
4. "court_name": Mahkeme Adı (Örn: İstanbul 12. Asliye Hukuk Mahkemesi). Yoksa "Belirsiz".
5. "court_case_number": Varsa Esas Numarası (Örn: 2023/145 E. veya 2024/54). Kesinlikle "Soruşturma No" veya "Değişik İş" ile karıştırma. Eğer "Esas" yazmıyorsa boş bırak.
6. "claim_amount": Dava Değeri / Miktarı (Örn: 100.000 TL). Yoksa boş bırak.
7. "subject": Dava Konusu / Özeti (Maksimum 15 kelime).
8. "summary": Evrakın içeriğinin 2-3 cümlelik net özeti.
9. "viz_text": Belgenin ilk 300 karakterlik temiz metin önizlemesi.

BELGE METNİ:
"""
${text.slice(0, 30000)}
"""

JSON ÇIKTISI (Örnek):
{
  "type": "...",
  "plaintiff": "...",
  "defendant": "...",
  "court_name": "...",
  "court_case_number": "...",
  "claim_amount": "...",
  "subject": "...",
  "summary": "...",
  "viz_text": "..."
}
    `;

    const contentBody = { contents: [{ parts: [{ text: prompt }] }] };
    const responseText = await callGeminiWithFallback(apiKey, contentBody);

    // Extract JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);

    throw new Error('AI yanıtı çözümlenemedi.');
}

async function performOcrWithGemini(imageBase64, mimeType, apiKey) {
    const contentBody = {
        contents: [{
            parts: [
                { text: 'Bu belgedeki tüm metni olduğu gibi, satırları koruyarak dışarı aktar. Sadece metin.' },
                { inlineData: { mimeType: mimeType, data: imageBase64 } }
            ]
        }]
    };
    return await callGeminiWithFallback(apiKey, contentBody);
}
