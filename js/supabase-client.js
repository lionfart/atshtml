// supabase-client.js
// Initialize Supabase Client
// (Global supabase variable is assumed or created on window)

async function initSupabase() {
    if (window.supabase) return;

    if (typeof createClient === 'undefined' || typeof SUPABASE_URL === 'undefined') {
        console.error('Supabase SDK or Config missing');
        return;
    }
    window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase initialized.');
}

// Auto-init attempt
if (typeof SUPABASE_URL !== 'undefined' && typeof createClient !== 'undefined') {
    if (!window.supabase) {
        window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
}

// ==========================================
// File Cases & Smart Matching API (UPDATED)
// ==========================================
// ... (getFileCases, getFileCaseById, getLawyers SAME) ... //
async function getFileCases(options = {}) {
    let query = supabase.from('file_cases').select(`*, lawyers (id, name, status)`);

    // Sort logic
    if (options.sort === 'date-asc') query = query.order('latest_activity_date', { ascending: true });
    else if (options.sort === 'date-desc') query = query.order('latest_activity_date', { ascending: false });
    else if (options.sort === 'reg-desc') query = query.order('registration_number', { ascending: false });
    else if (options.sort === 'reg-asc') query = query.order('registration_number', { ascending: true });
    else query = query.order('latest_activity_date', { ascending: false }); // Default

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
        court_decision_number: fileData.court_decision_number,
        plaintiff: fileData.plaintiff,
        defendant: fileData.defendant,
        claim_amount: fileData.claim_amount,
        subject: fileData.subject,
        lawyer_id: selectedLawyerId,
        primary_tag: fileData.primary_tag,
        tags: fileData.tags,
        next_hearing_date: fileData.next_hearing_date,
        case_status_notes: fileData.case_status_notes,
        plaintiff_attorney: fileData.plaintiff_attorney,
        defendant_attorney: fileData.defendant_attorney,
        latest_decision_result: fileData.latest_decision_result,
        deadline_date: fileData.deadline_date, // [FIX] Add explicit deadline column map
        urgency: fileData.urgency, // [NEW] Ensure urgency is saved
        address: fileData.address, // [NEW] Ensure address is saved
        status: 'OPEN'
    }]).select().single();

    if (error) throw error;
    // [FIX] Duplicate upload removed from here ? No, keeping it here is better for encapsulation.
    // I will remove the external call in app.js instead.
    if (file) await uploadDocument(newFile.id, file, { summary: fileData.summary, type: fileData.type, viz_text: fileData.viz_text });
    return newFile;
}

// ... (assignLawyerLegacy, uploadDocument, createNote, etc. SAME) ... //
async function assignLawyerLegacy(allLawyers, activeLawyers, settings) { let idx = (settings.last_assignment_index + 1) % allLawyers.length; let loops = 0; let selected = null; while (loops < allLawyers.length) { if (allLawyers[idx].status === 'ACTIVE') { selected = allLawyers[idx]; break; } idx = (idx + 1) % allLawyers.length; loops++; } if (!selected && activeLawyers.length > 0) selected = activeLawyers[0]; if (selected) { await supabase.from('lawyers').update({ assigned_files_count: (selected.assigned_files_count || 0) + 1 }).eq('id', selected.id); await updateSystemSettings({ last_assignment_index: allLawyers.findIndex(l => l.id === selected.id) }); } return selected; }
async function uploadDocument(fileCaseId, file, aiData = null, options = {}) {
    const { isMain = true, parentDocumentId = null, sortOrder = 0 } = options;

    const ext = file.name.split('.').pop();
    const fileName = `${fileCaseId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const { error: upErr } = await supabase.storage.from(APP_CONFIG.storageBucket).upload(fileName, file);
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from(APP_CONFIG.storageBucket).getPublicUrl(fileName);
    const { data: doc, error: docErr } = await supabase.from('documents').insert([{
        name: file.name,
        type: aiData?.type || file.type,
        file_case_id: fileCaseId,
        storage_path: fileName,
        public_url: urlData.publicUrl,
        analysis: aiData,
        is_main: isMain,
        parent_document_id: parentDocumentId,
        sort_order: sortOrder
    }]).select().single();
    if (docErr) throw docErr;

    // Note Content
    let noteText = `📤 Yeni evrak: ${file.name}`;
    if (aiData && aiData.type) noteText += ` (${aiData.type})`;
    if (aiData && aiData.summary) noteText += `\n📝 Özet: ${aiData.summary}`;

    await createNote(fileCaseId, null, noteText);

    // Update File Case Activity ONLY if it is a MAIN document
    if (isMain) {
        const updates = {
            latest_activity_type: aiData?.type || 'Yeni Evrak',
            latest_activity_summary: aiData?.summary || null,
            latest_activity_date: new Date().toISOString()
        };

        // Auto-Calculate Deadline (Generic for ALL documents with a duration)
        // Rule: If document has "action_duration_days", Calculate Deadline = Upload Date (Today) + Duration
        if (aiData && aiData.action_duration_days) {
            const days = parseInt(aiData.action_duration_days);
            if (!isNaN(days) && days > 0) {
                const today = new Date();
                const deadline = new Date(today);
                deadline.setDate(today.getDate() + days);

                // Update logic: Always prefer the calculated deadline if duration exists
                updates.deadline_date = deadline.toISOString().split('T')[0];
                console.log(`[Auto-Deadline] Enforced: ${updates.deadline_date} (Upload + ${days} days).`);
            }
        }

        // Update decision result if present
        if (aiData && aiData.decision_result) {
            updates.latest_decision_result = aiData.decision_result;
        }

        // Update tags if present (append to existing or set new)
        if (aiData && aiData.tags && Array.isArray(aiData.tags) && aiData.tags.length > 0) {
            // Fetch current tags first to merge
            const { data: currentFile } = await supabase.from('file_cases').select('tags').eq('id', fileCaseId).single();
            const existingTags = currentFile?.tags || [];

            // Merge arrays and remove duplicates
            const newTags = [...new Set([...existingTags, ...aiData.tags])];

            updates.tags = newTags;
        }

        await supabase.from('file_cases').update(updates).eq('id', fileCaseId);
    }

    return doc;
}
async function createNote(fileCaseId, lawyerId, content) { await supabase.from('notes').insert([{ file_case_id: fileCaseId, lawyer_id: lawyerId, content }]); }
async function getNotes(fileCaseId) { return await supabase.from('notes').select(`*, lawyers(name)`).eq('file_case_id', fileCaseId).order('created_at', { ascending: false }); }
async function getSystemSettings() {
    const { data: settings } = await supabase.from('system_settings').select('*').limit(1).maybeSingle();

    // Default Fallback (Config.js)
    if ((!settings || !settings.gemini_api_key) && typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEFAULT_GEMINI_KEY) {
        const fallback = settings || {};
        return { ...fallback, gemini_api_key: APP_CONFIG.DEFAULT_GEMINI_KEY };
    }

    return settings || { last_assignment_index: -1, catchup_burst_limit: 2 };
}
async function updateSystemSettings(updates) {
    const { data: existing } = await supabase.from('system_settings').select('id').single();
    if (existing) return await supabase.from('system_settings').update(updates).eq('id', existing.id);
}

async function renameDocument(docId, newName) {
    const { error } = await supabase.from('documents').update({ name: newName }).eq('id', docId);
    if (error) throw error;
}

async function deleteDocument(docId) {
    // 1. Get storage path
    const { data: doc, error: getError } = await supabase.from('documents').select('storage_path').eq('id', docId).single();
    if (getError) throw getError;

    // 2. Remove from Storage
    if (doc.storage_path) {
        const { error: storageError } = await supabase.storage.from(APP_CONFIG.storageBucket).remove([doc.storage_path]);
        if (storageError) console.warn('Storage delete warning:', storageError);
    }

    // 3. Remove from DB
    const { error: dbError } = await supabase.from('documents').delete().eq('id', docId);
    if (dbError) throw dbError;
}

// ==========================================
// AI Analysis (OpenRouter Only - Gemini API Removed)
// ==========================================

// Get effective model order: user's custom order with rate-limited models at end
function getEffectiveModelOrder() {
    // Get user's custom order or default from config
    let modelOrder;
    const stored = localStorage.getItem('openrouter_model_order');
    if (stored) {
        try { modelOrder = JSON.parse(stored); } catch (e) { modelOrder = null; }
    }
    if (!modelOrder || !Array.isArray(modelOrder) || modelOrder.length === 0) {
        modelOrder = APP_CONFIG.openRouterModels || ['deepseek/deepseek-r1-0528:free'];
    }

    // Get rate-limited models from session storage
    const rateLimited = JSON.parse(sessionStorage.getItem('openrouter_rate_limited') || '[]');

    // Filter out rate-limited models and add them to end
    const available = modelOrder.filter(m => !rateLimited.includes(m));
    return [...available, ...rateLimited];
}

// Add model to rate-limited list (session only)
function markModelRateLimited(model) {
    const limited = JSON.parse(sessionStorage.getItem('openrouter_rate_limited') || '[]');
    if (!limited.includes(model)) {
        limited.push(model);
        sessionStorage.setItem('openrouter_rate_limited', JSON.stringify(limited));
        console.warn(`Model ${model} added to rate-limited list (will be tried last)`);
    }
}

// Helper to clean AI JSON responses
function sanitizeJsonString(str) {
    if (!str) return '';
    // Remove markdown fences
    str = str.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    // Remove DeepSeek <think> tags
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Trim whitespace
    str = str.trim();
    // Replace single quotes with double quotes
    str = str.replace(/'/g, '"');
    // Remove trailing commas before } or ]
    str = str.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    // Extract outermost JSON object
    const first = str.indexOf('{');
    const last = str.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
        str = str.substring(first, last + 1);
    }
    return str;
}

async function callGeminiWithFallback(apiKey, contentBody, modelIndex = 0) {
    // Use custom model order with rate-limited models at end
    const effectiveModels = getEffectiveModelOrder();

    if (modelIndex >= effectiveModels.length) {
        throw new Error('Bütün AI modelleri denendi fakat sonuç alınamadı.');
    }

    // Get API key from parameter or localStorage
    const routerKey = apiKey || localStorage.getItem('openrouter_api_key');
    if (!routerKey) {
        throw new Error('OpenRouter API Key bulunamadı. Lütfen ayarlardan kaydedin.');
    }

    const currentModel = effectiveModels[modelIndex];
    console.log(`AI Model Deneniyor (OpenRouter ${modelIndex + 1}/${effectiveModels.length}): ${currentModel}`);

    try {
        const safeKey = routerKey.trim();
        console.log(`OpenRouter Key Debug: Length=${safeKey.length}, Prefix=${safeKey.substring(0, 10)}...`);

        // Extract prompt text from contentBody (supporting both Gemini and OpenRouter formats)
        let promptText = '';
        if (contentBody.contents && contentBody.contents[0] && contentBody.contents[0].parts) {
            promptText = contentBody.contents[0].parts.map(p => p.text || '').join('\n');
        } else if (typeof contentBody === 'string') {
            promptText = contentBody;
        }

        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${safeKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://adalettakip.vercel.app',
                'X-Title': 'Adalet Takip Sistemi'
            },
            body: JSON.stringify({
                model: currentModel,
                messages: [{ role: 'user', content: promptText }]
            })
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.warn(`OpenRouter Model ${currentModel} failed: ${resp.status} - ${errText}`);

            // If rate limited (429), add to rate-limited list and try next model
            if (resp.status === 429 || errText.toLowerCase().includes('rate')) {
                markModelRateLimited(currentModel);
                await new Promise(r => setTimeout(r, 1000));
                return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
            }

            // For other errors, just try next model
            if (resp.status === 404 || resp.status === 400 || resp.status === 503) {
                await new Promise(r => setTimeout(r, 1000));
                return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
            }
            throw new Error(`OpenRouter Error: ${resp.status} - ${errText}`);
        }

        const data = await resp.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.warn(`OpenRouter Model ${currentModel} returned no content, trying next...`);
            return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
        }

        console.log(`✓ AI Analysis successful with model: ${currentModel}`);
        return data.choices[0].message.content;
    } catch (e) {
        console.error(`${currentModel} error:`, e);
        // Check if error message indicates rate limiting
        if (e.message && (e.message.includes('429') || e.message.toLowerCase().includes('rate'))) {
            markModelRateLimited(currentModel);
        }
        await new Promise(r => setTimeout(r, 1000));
        return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1);
    }
}

async function analyzeWithGemini(text, apiKey) {
    if (!apiKey) throw new Error('API keysiz analiz yapılamaz.');
    const prompt = `
Sen Türk Hukuk Sistemine hakim uzman bir avukat asistanısın. Bu belgeyi analiz et ve YALNIZCA aşağıdaki JSON formatında veri döndür.
AMAÇ: Hukuk bürosu iş akışını otomatize etmek. Sadece temel bilgileri değil, avukatın yapması gerekenleri ve takvimi çıkar.

ÖNEMLİ KURALLAR:
0. KARAKTER KULLANIMI: TÜM METİNLERDE (ÖZELLİKLE ÖZET BÖLÜMÜNDE) TÜRKÇE KARAKTERLERİ (ğ, ü, ş, ı, ö, ç, İ) DOĞRU VE EKSİKSİZ KULLAN. Arama fonksiyonunun çalışması için bu kritiktir.
1. "type": SADECE bu listeden biri olmalı (En uygununu seç):
   - "Dava Dilekçesi", "Savunma Dilekçesi", "Cevap Dilekçesi", "Savunmaya Cevap Dilekçesi"
   - "Ara Karar", "Bilirkişi Raporu", "Bilirkişi Raporuna İtiraz"
   - "Karar" (mahkeme kararı için genel tip)
   - "İstinaf Talebi", "İstinafa Cevap", "İstinaf Kararı"
   - "Temyiz Talebi", "Temyize Cevap", "Temyiz Kararı", "Diğer"
2. "primary_tag": Dosyanın ANA konusunu belirle. BUNLAR BİRBİRİNİ DIŞLAR. Sadece biri seçilebilir:
   - "Çevre", "Şehircilik", "Mevzuat", "Diğer"
3. "secondary_tags": Dosyanın içerdiği diğer tüm konular. Birden fazla olabilir.
   - Örnekler: "Adli", "Deprem", "Tazminat", "Hasar", "Tespit", "Görüş", "Kamulaştırma", "İdari Para Cezası", "Yıkım"
4. FORMAT ZORUNLULUKLARI (KESİN UYULACAK):
   - "court_case_number" (Esas No) ve "court_decision_number" (Karar No): SADECE "YYYY/SAYI" formatında olmalı. Asla "E.", "K." veya yazı içermemeli. Örn: "2024/1458".
   - "court_name" (Mahkeme): "İL", "DAİRE/MAHKEME SAYISI", "TÜRÜ" formatında olmalı. 
     - Örn: "Ankara 2. İdare Mahkemesi", "Bursa Bölge İdare Mahkemesi 2. İdari Dava Dairesi", "Danıştay 6. Daire".

5. SÜRE VE KESİNLİK KURALLARI (ÇOK ÖNEMLİ):
   a) "KEŞİN KARAR" TESPİTİ: Belgede şu ifadelerden biri varsa is_final_no_deadline = true ve action_duration_days = null:
      * "kesin olarak karar verildi"
      * "kesindir"
      * "kanun yolu kapalı"
      * "itiraz yolu kapalı"
   b) SÜRE TESPİTİ: Şu kalıpları ara:
      * "tebliğinden itibaren X gün" -> X
      * "X gün içinde istinaf/temyiz" -> X
      * "X günlük süre" -> X
      * "istinaf yolu açık olmak üzere" -> 30
   c) BELİRSİZ SÜRE: Kesin karar değilse AMA süre net belirtilmemişse:
      * action_duration_days = 30 (varsayılan)
      * deadline_warning = "Süre belgede net belirtilmedi, 30 gün olarak varsayıldı."

6. KARAR SONUCU (decision_result) - SADECE BU DEĞERLERDEN BİRİ:
   - "Red" = Dava tamamen reddedildi
   - "İptal" = İdari işlem iptal edildi (iptal davası)
   - "Kabul" = Dava tamamen kabul edildi (özellikle tam yargı/tazminat davaları)
   - "Kısmen Kabul Kısmen Red" = Talebin bir kısmı kabul, bir kısmı red
   - "Onama" = Üst mahkeme alt kararı onadı
   - "Bozma" = Üst mahkeme alt kararı bozdu
   - "Gönderme" = Başka mahkemeye/kuruma gönderildi
   - "YD Kabul" = Yürütmenin Durdurulması talebi KABUL edildi (SADECE Ara Karar için)
   - "YD Red" = Yürütmenin Durdurulması talebi REDDEDİLDİ (SADECE Ara Karar için)
   - "Diğer" = Yukarıdakilerden hiçbiri

   ÖNEMLİ - ARA KARAR İÇİN:
   ========================
   Eğer belge tipi "Ara Karar" ise ve Yürütmenin Durdurulması (YD) talebi varsa:
   - YD talebi KABUL edilmişse → decision_result = "YD Kabul" (ASLA "Kabul" kullanma!)
   - YD talebi REDDEDİLMİŞSE → decision_result = "YD Red" (ASLA "Red" kullanma!)
   - YD ile ilgili karar yoksa → decision_result = null (boş bırak)

   TAM YARGI DAVALARI İÇİN:
   - Tazminat talebi TAMAMEN kabul → "Kabul"
   - Tazminat talebi KISMEN kabul → "Kısmen Kabul Kısmen Red"
   - Tazminat talebi TAMAMEN red → "Red"

7. "plaintiff_attorney" ve "defendant_attorney": Varsa tam isimleri (Av. ...). Yoksa null.
8. "summary" (Özet): ÇOK DETAYLI VE KAPSAMLI OLMALI. En az 8-10 cümle ile davanın kök sebebini, tarafların tüm iddialarını, hukuki dayanakları ve (varsa) sonucu ayrıntılı açıkla.
9. "urgency" (Aciliyet):
   - "İptal", "Kabul", "Kısmen Kabul Kısmen Red" kararları (aleyhe durumlar) için KESİNLİKLE "HIGH" seç.
   - Kısa süreli (7 gün altı) işlemler için "HIGH" seç. Diğerleri için "Medium" veya "Low".

İSTENEN JSON FORMATI:
{
  "type": "STANDART LİSTEDEN BİRİ",
  "plaintiff": "Davacı Adı",
  "defendant": "Davalı Adı",
  "court_name": "Şehir No Tür (Örn: Ankara 2. İdare)",
  "court_case_number": "YYYY/NUM (Örn: 2023/123)",
  "court_decision_number": "YYYY/NUM (Örn: 2024/55 - Yoksa null)",
  "plaintiff_attorney": "Av. Adı Soyadı | null",
  "defendant_attorney": "Av. Adı Soyadı | null",
  "claim_amount": "100.000 TL (Yoksa null)",
  "subject": "Dava Konusu",
  "address": "Belgedeki adres bilgisi (Taşınmaz adresi, dava konusu yer vb. Yoksa null)",
  "summary": "Çok detaylı özet (en az 8-10 cümle).",
  "next_hearing_date": "YYYY-MM-DD (Gelecek duruşma tarihi varsa)",
  "deadline_date": "YYYY-MM-DD (Kesin karar değilse hesaplanmış süre bitişi. Kesin kararlarda null)",
  "action_duration_days": 30, // Gün sayısı. Kesin kararlarda null.
  "is_final_no_deadline": false, // TRUE = Kesin karar, süre yok. FALSE = Süre var veya varsayılan 30 gün.
  "deadline_warning": null, // Süre belirsizse uyarı mesajı
  "decision_result": "Red | İptal | Kabul | Kısmen Kabul Kısmen Red | Onama | Bozma | Gönderme | YD Kabul | YD Red | Diğer | null", // Ara Karar için YD Kabul veya YD Red kullan
  "decision_date": "YYYY-MM-DD (Karar verilme tarihi)",
  "is_final_decision": true, // Onama, Red, İptal, Kabul = TRUE. Bozma, Gönderme, YD = FALSE.
  "urgency": "Yüksek | Orta | Düşük", // Önem derecesi (Türkçe)
  "suggested_action": "Örn: '2 hafta içinde cevap dilekçesi hazırla' veya 'Süre yok, kesin karar'",
"primary_tag": "Çevre | Şehircilik | Mevzuat | Diğer",
    "secondary_tags": ["Deprem", "Tazminat", "Adli"](Dizi olarak)
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

        let cleanedText = sanitizeJsonString(responseText);

        // Try parsing
        try {
            return JSON.parse(cleanedText);
        } catch (parseErr) {
            // Strategy 4: Try to fix common JSON issues (trailing commas, single quotes, etc.)
            let fixedJson = cleanedText
                .replace(/,\s*}/g, '}')  // Remove trailing commas before }
                .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
                .replace(/'/g, '"')       // Replace single quotes with double quotes
                .replace(/\n/g, ' ')      // Remove newlines
                .replace(/\r/g, '');      // Remove carriage returns
            return JSON.parse(fixedJson);
        }
    } catch (e) {
        console.warn("JSON parsing failed, retrying with simple prompt...", e);
        try {
            const simpleBody = { contents: [{ parts: [{ text: prompt }] }] };
            const responseText = await callGeminiWithFallback(apiKey, simpleBody);
            let cleanedText = sanitizeJsonString(responseText); // Apply sanitization here too
            // Try multiple JSON extraction patterns
            const patterns = [
                /\{[\s\S]*\}/,                    // Greedy match
                /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/ // Nested brackets
            ];
            for (const pattern of patterns) {
                const match = cleanedText.match(pattern); // Use cleanedText
                if (match) {
                    try {
                        return JSON.parse(match[0]);
                    } catch (parseErr) { continue; }
                }
            }
        } catch (retryErr) {
            console.error("Retry also failed:", retryErr);
        }
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
async function createLawyer(name, username, password) {
    if (!name || !username || !password) {
        throw new Error('Ad, kullanıcı adı ve şifre zorunludur.');
    }

    // Check if username already exists
    const { data: existing } = await supabase
        .from('lawyers')
        .select('id')
        .eq('username', username)
        .maybeSingle();

    if (existing) {
        throw new Error('Bu kullanıcı adı zaten kullanılıyor.');
    }

    const { data, error } = await supabase
        .from('lawyers')
        .insert({
            name: name,
            username: username,
            password_hash: password, // Note: In production, this should be properly hashed
            status: 'ACTIVE'
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}
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
window.analyzeOpinionWithGemini = analyzeOpinionWithGemini;

// ==========================================
// AI Analysis for Legal Opinions (Mütalaa)
// ==========================================
async function analyzeOpinionWithGemini(text, apiKey) {
    if (!apiKey) throw new Error('API anahtarı gerekli.');

    const prompt = `
Sen Türk Hukuk Sistemine hakim uzman bir avukat asistanısın.Bu belgeyi analiz et ve YALNIZCA aşağıdaki JSON formatında veri döndür.
Bu belge bir HUKUKİ MÜTALAA(Görüş) talebidir - bir dava dosyası DEĞİLDİR.

ÖNEMLİ KURALLAR:
1. "requesting_institution": Görüş talep eden kurum / kişi adını tespit et.
2. "subject": Görüş konusunun kısa özeti(1 - 2 cümle).
3. "summary": Detaylı açıklama(4 - 6 cümle).
4. "urgency": "HIGH"(acil / kısa süre), "MEDIUM"(normal), "LOW"(acil değil)
5. "deadline_date": Varsa kesin süre tarihi(YYYY - MM - DD formatında), yoksa null.
6. "ai_suggestion": Görüşe nasıl yaklaşılması gerektiğine dair kısa öneri.

İSTENEN JSON FORMATI:
{
    "requesting_institution": "Kurum/Kişi Adı",
        "subject": "Görüş Konusu (kısa)",
            "summary": "Detaylı açıklama (4-6 cümle)",
                "urgency": "HIGH | MEDIUM | LOW",
                    "deadline_date": "YYYY-MM-DD | null",
                        "ai_suggestion": "Örn: 'Mevzuat taraması yapılmalı. İlgili Danıştay kararları incelenmeli.'"
}

BELGE METNİ:
"""
${text.slice(0, 15000)}
"""
    `;

    const contentBody = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } };

    try {
        const responseText = await callGeminiWithFallback(apiKey, contentBody);
        let cleanedText = responseText.trim();
        cleanedText = cleanedText.replace(/^```json\s * /, '').replace(/ ^ ```\s*/, '').replace(/\s*```$ /, '');
        const firstOpen = cleanedText.indexOf('{');
        const lastClose = cleanedText.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1) {
            cleanedText = cleanedText.substring(firstOpen, lastClose + 1);
        }
        return JSON.parse(cleanedText);
    } catch (e) {
        console.error('Opinion AI analysis error:', e);
        return { requesting_institution: '', subject: '', urgency: 'MEDIUM', ai_suggestion: 'Analiz yapılamadı.' };
    }
}

// ==========================================
// Decisions API
// ==========================================

async function getDecisionsByFileId(fileId) {
    const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('file_case_id', fileId)
        .order('decision_date', { ascending: true });

    if (error) {
        console.error('Error fetching decisions:', error);
        return [];
    }
    return data || [];
}

async function createDecision(data) {
    const { data: newDecision, error } = await supabase
        .from('decisions')
        .insert(data)
        .select()
        .single();

    if (error) throw error;
    return newDecision;
}

async function updateDecision(id, updates) {
    const { error } = await supabase
        .from('decisions')
        .update(updates)
        .eq('id', id);

    if (error) throw error;
}

async function deleteDecision(id) {
    const { error } = await supabase
        .from('decisions')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// Export Global API
window.getFileCases = getFileCases;
window.getFileCaseById = getFileCaseById;
window.findMatchingCase = findMatchingCase;
window.createFileCase = createFileCase;
window.uploadDocument = uploadDocument;
window.analyzeWithGemini = analyzeWithGemini;
window.getSystemSettings = getSystemSettings;
window.updateSystemSettings = updateSystemSettings;
window.getLawyers = getLawyers;
window.analyzeOpinionWithGemini = analyzeOpinionWithGemini;
window.getNotes = getNotes;
window.getDecisionsByFileId = getDecisionsByFileId;
window.createDecision = createDecision;
window.updateDecision = updateDecision;
window.deleteDecision = deleteDecision;
