// ==========================================
// Supabase Client Initialization
// ==========================================

let supabase;

// Initialize Supabase client
function initSupabase() {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        console.warn('⚠️ Supabase credentials not configured. Please update js/config.js');
        showToast('Supabase yapılandırılmamış. config.js dosyasını güncelleyin.', 'warning');
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
    // Hash password using Web Crypto API (simple hash for demo, use bcrypt in production)
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Check if username already exists
    const { data: existing } = await supabase
        .from('lawyers')
        .select('id')
        .eq('username', username)
        .single();

    if (existing) {
        throw new Error('Bu kullanıcı adı zaten alınmış.');
    }

    const { data: newLawyer, error } = await supabase
        .from('lawyers')
        .insert([{
            name,
            username,
            password_hash: passwordHash,
            role: 'LAWYER',
            status: 'ACTIVE',
            missed_assignments_count: 0,
            assigned_files_count: 0
        }])
        .select()
        .single();

    if (error) throw error;
    return newLawyer;
}

async function updateLawyerStatus(id, status, leaveReturnDate = null) {
    const updateData = { status };
    if (leaveReturnDate !== undefined) {
        updateData.leave_return_date = leaveReturnDate;
    }

    const { data, error } = await supabase
        .from('lawyers')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==========================================
// File Cases API
// ==========================================

async function getFileCases(options = {}) {
    let query = supabase
        .from('file_cases')
        .select(`
            *,
            lawyers (id, name)
        `)
        .order('created_at', { ascending: false });

    // Search filter
    if (options.search) {
        const searchTerm = `%${options.search.toLowerCase()}%`;
        query = query.or(`plaintiff.ilike.${searchTerm},subject.ilike.${searchTerm},registration_number.ilike.${searchTerm}`);
    }

    // Lawyer filter
    if (options.lawyerId) {
        query = query.eq('lawyer_id', options.lawyerId);
    }

    // Status filter
    if (options.status) {
        query = query.eq('status', options.status);
    }

    // Limit
    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform data to include lawyer_name
    return (data || []).map(file => ({
        ...file,
        lawyer_name: file.lawyers?.name || 'Atanmamış'
    }));
}

async function getFileCaseById(id) {
    const { data: fileCase, error: fileError } = await supabase
        .from('file_cases')
        .select(`
            *,
            lawyers (id, name)
        `)
        .eq('id', id)
        .single();

    if (fileError) throw fileError;

    // Get documents
    const { data: documents, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('file_case_id', id)
        .order('upload_date', { ascending: false });

    if (docError) throw docError;

    return {
        ...fileCase,
        lawyer_name: fileCase.lawyers?.name || 'Bilinmiyor',
        documents: documents || []
    };
}

async function createFileCase(plaintiff, subject, file = null) {
    // Get system settings
    const settings = await getSystemSettings();

    // Get all lawyers
    const lawyers = await getLawyers();
    const activeLawyers = lawyers.filter(l => l.status === 'ACTIVE');

    if (activeLawyers.length === 0) {
        throw new Error('Atanabilecek aktif avukat yok.');
    }

    // Assign lawyer using round-robin algorithm with catch-up logic
    const selectedLawyer = await assignLawyer(lawyers, activeLawyers, settings);

    // Generate registration number
    const year = new Date().getFullYear();
    const { count } = await supabase
        .from('file_cases')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${year}-01-01`);

    const regNumber = `${year}/${String((count || 0) + 1).padStart(4, '0')}`;

    // Create file case
    const { data: newFile, error: fileError } = await supabase
        .from('file_cases')
        .insert([{
            registration_number: regNumber,
            plaintiff,
            subject,
            lawyer_id: selectedLawyer.id,
            status: 'OPEN'
        }])
        .select()
        .single();

    if (fileError) throw fileError;

    // Update lawyer's assigned files count
    await supabase
        .from('lawyers')
        .update({ assigned_files_count: selectedLawyer.assigned_files_count + 1 })
        .eq('id', selectedLawyer.id);

    // Upload document if provided
    if (file) {
        await uploadDocument(newFile.id, file);
    }

    return newFile;
}

async function updateFileCase(id, updates) {
    const { data, error } = await supabase
        .from('file_cases')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function deleteFileCase(id) {
    // Delete associated documents from storage first
    const { data: documents } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('file_case_id', id);

    if (documents && documents.length > 0) {
        const paths = documents.map(d => d.storage_path).filter(Boolean);
        if (paths.length > 0) {
            await supabase.storage.from(APP_CONFIG.storageBucket).remove(paths);
        }
    }

    // Delete documents metadata
    await supabase.from('documents').delete().eq('file_case_id', id);

    // Delete notes
    await supabase.from('notes').delete().eq('file_case_id', id);

    // Delete file case
    const { error } = await supabase
        .from('file_cases')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
}

// ==========================================
// Lawyer Assignment Algorithm
// ==========================================

async function assignLawyer(allLawyers, activeLawyers, settings) {
    // Calculate average
    const totalFilesAssigned = activeLawyers.reduce((sum, l) => sum + (l.assigned_files_count || 0), 0);
    const targetAverage = totalFilesAssigned / activeLawyers.length;

    // Find lawyers with deficit
    const neededLawyers = activeLawyers
        .map(l => ({ ...l, deficit: targetAverage - (l.assigned_files_count || 0) }))
        .filter(l => l.deficit > 0)
        .sort((a, b) => b.deficit - a.deficit);

    const burstLimit = settings.catchup_burst_limit || APP_CONFIG.defaultBurstLimit;
    const currentSeq = settings.catchup_sequence_count || 0;

    let selectedLawyer;
    let newSeqCount = currentSeq;

    // Catch-up mode
    if (neededLawyers.length > 0 && currentSeq < burstLimit) {
        selectedLawyer = neededLawyers[0];
        newSeqCount = currentSeq + 1;
        console.log(`[CATCH-UP ${newSeqCount}/${burstLimit}] Assigned to ${selectedLawyer.name}`);
    } else {
        // Round-robin mode
        newSeqCount = 0;
        const lastIndex = settings.last_assignment_index || -1;
        let currentIndex = (lastIndex + 1) % allLawyers.length;

        // Find next active lawyer
        let attempts = 0;
        while (attempts < allLawyers.length) {
            const candidate = allLawyers[currentIndex];
            if (candidate.status === 'ACTIVE') {
                selectedLawyer = candidate;
                break;
            }
            currentIndex = (currentIndex + 1) % allLawyers.length;
            attempts++;
        }

        // Fallback to first active
        if (!selectedLawyer) {
            selectedLawyer = activeLawyers[0];
        }

        // Update last assignment index
        await updateSystemSettings({
            last_assignment_index: allLawyers.findIndex(l => l.id === selectedLawyer.id)
        });

        console.log(`[ROTATION] Assigned to ${selectedLawyer.name}`);
    }

    // Update sequence count
    await updateSystemSettings({ catchup_sequence_count: newSeqCount });

    return selectedLawyer;
}

// ==========================================
// Documents API
// ==========================================

async function uploadDocument(fileCaseId, file, scanEnabled = true) {
    // Generate unique filename
    const ext = file.name.split('.').pop();
    const fileName = `${fileCaseId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
        .from(APP_CONFIG.storageBucket)
        .upload(fileName, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
        .from(APP_CONFIG.storageBucket)
        .getPublicUrl(fileName);

    // Create document record
    const { data: document, error: docError } = await supabase
        .from('documents')
        .insert([{
            name: file.name,
            type: file.type,
            upload_date: new Date().toISOString(),
            file_case_id: fileCaseId,
            storage_path: fileName,
            public_url: urlData.publicUrl
        }])
        .select()
        .single();

    if (docError) throw docError;

    // Create upload note
    await createNote(fileCaseId, null, `📤 Yeni evrak eklendi: ${file.name}`);

    return document;
}

async function deleteDocument(id) {
    // Get document info
    const { data: doc, error: getError } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('id', id)
        .single();

    if (getError) throw getError;

    // Delete from storage
    if (doc.storage_path) {
        await supabase.storage
            .from(APP_CONFIG.storageBucket)
            .remove([doc.storage_path]);
    }

    // Delete metadata
    const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
}

async function renameDocument(id, newName) {
    const { data, error } = await supabase
        .from('documents')
        .update({ name: newName })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==========================================
// Notes API
// ==========================================

async function getNotes(fileCaseId) {
    const { data, error } = await supabase
        .from('notes')
        .select(`
            *,
            lawyers (name)
        `)
        .eq('file_case_id', fileCaseId)
        .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(note => ({
        ...note,
        author_name: note.lawyers?.name || 'Sistem'
    }));
}

async function createNote(fileCaseId, lawyerId, content) {
    const { data, error } = await supabase
        .from('notes')
        .insert([{
            file_case_id: fileCaseId,
            lawyer_id: lawyerId,
            content
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==========================================
// System Settings API
// ==========================================

async function getSystemSettings() {
    const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();

    if (error) {
        // If no settings exist, create default
        if (error.code === 'PGRST116') {
            return await createDefaultSettings();
        }
        throw error;
    }
    return data;
}

async function createDefaultSettings() {
    const { data, error } = await supabase
        .from('system_settings')
        .insert([{
            last_assignment_index: -1,
            catchup_burst_limit: APP_CONFIG.defaultBurstLimit,
            catchup_sequence_count: 0,
            gemini_api_key: ''
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateSystemSettings(updates) {
    // First try to update existing
    const { data: existing } = await supabase
        .from('system_settings')
        .select('id')
        .single();

    if (existing) {
        const { data, error } = await supabase
            .from('system_settings')
            .update(updates)
            .eq('id', existing.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    } else {
        // Create with updates merged into defaults
        return await supabase
            .from('system_settings')
            .insert([{
                last_assignment_index: -1,
                catchup_burst_limit: APP_CONFIG.defaultBurstLimit,
                catchup_sequence_count: 0,
                gemini_api_key: '',
                ...updates
            }])
            .select()
            .single();
    }
}

// ==========================================
// AI Analysis (Direct Gemini API Call)
// ==========================================

// ==========================================
// AI Analysis (Generic Fallback Handler)
// ==========================================

async function callGeminiWithFallback(apiKey, contentBody, modelIndex = 0) {
    const models = APP_CONFIG.geminiModels || ['gemini-1.5-flash-001'];

    // Safety check for recursion
    if (modelIndex >= models.length) {
        throw new Error('Tüm yapay zeka modelleri denendi ancak yanıt alınamadı. Lütfen daha sonra tekrar deneyin.');
    }

    const currentModel = models[modelIndex];
    console.log(`🤖 AI Modeli deneniyor (${modelIndex + 1}/${models.length}): ${currentModel}`);

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contentBody)
        });

        if (!response.ok) {
            // If it's a 4xx error (client error), it might be model not found or invalid argument
            // If it's a 5xx error (server error), it might be temporary overload
            // In both cases, trying the next model is worth a shot, unless it's an Auth error (400/403 with specific message)

            const errorText = await response.text();
            console.warn(`⚠️ Model ${currentModel} hatası:`, errorText);

            // If API key is invalid, don't retry
            if (response.status === 400 && errorText.includes('API_KEY_INVALID')) {
                throw new Error('API Anahtarı geçersiz.');
            }

            // Fallback to next model
            return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        }

        const data = await response.json();

        // Check if candidates exist (sometimes safety filters block output)
        if (!data.candidates || data.candidates.length === 0) {
            console.warn(`⚠️ Model ${currentModel} sonuç döndürmedi (Güvenlik filtresi olabilir).`);
            return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        }

        return data.candidates[0].content.parts[0].text || '';

    } catch (error) {
        console.error(`❌ Model ${currentModel} çağrısında istisna:`, error);
        // Retry with next model
        if (modelIndex < models.length - 1) {
            return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        }
        throw error;
    }
}

async function analyzeWithGemini(text, apiKey) {
    if (!apiKey) throw new Error('Gemini API anahtarı gerekli.');

    const prompt = `
Sen uzman bir hukuk asistanısın. Sunulan belgeyi dikkatlice incele.

GÖREV:
1. "Evrak Türü"nü sınıflandır. Seçenekler:
   - "Dava Dilekçesi", "Cevap Dilekçesi", "Savunma Dilekçesi", "Bilirkişi Raporu", "Ara Karar", "Gerekçeli Karar" (İlam), "Duruşma Zaptı", "İstinaf Başvurusu", "Temyiz Başvurusu", "Diğer"
2. "Davacı" (Plaintiff) ismini bul.
3. "Dava Konusu"nu (Subject) özetle (kısa ve öz, maksimum 20 kelime).
4. EĞER evrak türü bir "Karar" (Gerekçeli Karar, Ara Karar vs.) ise, kararın SONUCUNU şu etiketlerden biriyle ifade et ("decision_result" alanına yaz):
   - "DAVA KABUL", "DAVA RED", "DAVA KISMEN KABUL", "TAZMİNAT KABUL", "TAZMİNAT RED", "TAZMİNAT KISMEN KABUL", "GÖREVSİZLİK", "YETKİSİZLİK", "DOSYA İŞLEMDEN KALDIRILDI", "KARAR YOK"

YANIT (JSON):
{
  "type": "Evrak Türü",
  "plaintiff": "...",
  "subject": "...",
  "decision_result": "..." 
}

BELGE METNİ:
"""
${text.slice(0, 30000)}
"""
    `;

    const contentBody = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    const responseText = await callGeminiWithFallback(apiKey, contentBody);

    // Parse JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }

    throw new Error('AI yanıtı parse edilemedi.');
}

async function performOcrWithGemini(imageBase64, mimeType, apiKey) {
    if (!apiKey) throw new Error('Gemini API anahtarı gerekli.');

    const contentBody = {
        contents: [{
            parts: [
                { text: 'Bu belgedeki tüm metni olduğu gibi dışarı aktar (OCR). Yorum yapma, sadece metni ver.' },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: imageBase64
                    }
                }
            ]
        }]
    };

    return await callGeminiWithFallback(apiKey, contentBody);
}
