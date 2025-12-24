// ... (Previous imports SAME) ... //

// ==========================================
// File Cases & Smart Matching API (UPDATED)
// ==========================================
// ... (getFileCases, getFileCaseById, getLawyers SAME) ... //
async function getFileCases(options = {}) {
    let query = supabase.from('file_cases').select(`*, lawyers (id, name, status)`);

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
    // Update tags if present (append to existing)
    if (aiData && aiData.tags && Array.isArray(aiData.tags) && aiData.tags.length > 0) {
        // Fetch current tags first to merge
        const { data: currentFile } = await supabase.from('file_cases').select('tags').eq('id', fileCaseId).single();
        const existingTags = currentFile?.tags || [];

        // Merge arrays and remove duplicates
        const newTags = [...new Set([...existingTags, ...aiData.tags])];

        updates.tags = newTags;
    }

    await supabase.from('file_cases').update(updates).eq('id', fileCaseId);

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
// AI Analysis (Prompt Updated for Decision No & Workflow)
// ==========================================
async function callGeminiWithFallback(apiKey, contentBody, modelIndex = 0, useOpenRouter = false) {
    const googleModels = APP_CONFIG.geminiModels || ['gemini-2.0-flash-exp', 'gemini-1.5-flash'];
    const openRouterModels = APP_CONFIG.openRouterModels || ['google/gemini-2.0-flash-exp:free'];

    if (!useOpenRouter && modelIndex >= googleModels.length) {
        console.log('Google API models exhausted. Switching to OpenRouter...');
        // Try localStorage first to avoid git exposure issues
        const routerKey = localStorage.getItem('openrouter_api_key') || APP_CONFIG.OPENROUTER_API_KEY;
        if (routerKey) return await callGeminiWithFallback(routerKey, contentBody, 0, true);
        throw new Error('Google API başarısız ve OpenRouter Key bulunamadı (localStorage: openrouter_api_key).');
    }

    if (useOpenRouter && modelIndex >= openRouterModels.length) {
        throw new Error('Bütün AI modelleri denendi fakat sonuç alınamadı.');
    }

    const currentModel = useOpenRouter ? openRouterModels[modelIndex] : googleModels[modelIndex];
    console.log(`AI Model Deneniyor (${useOpenRouter ? 'OpenRouter' : 'Google'} ${modelIndex + 1}): ${currentModel}`);

    try {
        if (useOpenRouter) {
            const safeKey = apiKey.trim();
            console.log(`OpenRouter Key Debug: Length=${safeKey.length}, Prefix=${safeKey.substring(0, 10)}...`);

            const promptText = contentBody.contents[0].parts.map(p => p.text).join('\n');
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${safeKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://adalettakip-local.app', // Hardcoded for local dev to satisfy OpenRouter
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

                // If rate limited or model not found, try next one
                if (resp.status === 429 || resp.status === 404 || resp.status === 400) {
                    await new Promise(r => setTimeout(r, 1000));
                    return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1, useOpenRouter);
                }
                throw new Error(`OpenRouter Error: ${resp.status} - ${errText}`);
            }
            const data = await resp.json();
            return data.choices[0].message.content;
        } else {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(contentBody)
            });
            if (!resp.ok) {
                if (resp.status === 429) {
                    console.warn(`Rate limit (429) for ${currentModel}. Skipping to next model...`);
                    // Don't retry same model, move to next to reach OpenRouter faster
                    await new Promise(r => setTimeout(r, 2000));
                    return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1, useOpenRouter);
                }
                return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1, useOpenRouter);
            }
            const data = await resp.json();
            if (!data.candidates || !data.candidates[0].content) return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1, useOpenRouter);
            return data.candidates[0].content.parts[0].text;
        }
    } catch (e) {
        console.error(`${currentModel} error:`, e);
        await new Promise(r => setTimeout(r, 1000));
        return await callGeminiWithFallback(apiKey, contentBody, modelIndex + 1, useOpenRouter);
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
   - "Red", "İptal", "Tazminat Kabul", "Kısmen Kabul Kısmen Red", "Gönderme", "Onama", "Bozma"
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
5. "action_duration_days": Kararda veya belgede belirtilen yasal süre veya işlem süresi (GÜN CİNSİNDEN).
   - ÖZELLİKLE "kararın tebliğini izleyen günden itibaren X gün" gibi ifadeleri ara ve X'i buraya yaz.
   - "Ara Karar", "İstinaf Kararı", "Temyiz Kararı" gibi evraklarda bu süreler kritiktir. Örn: "7", "15", "30". Yoksa null.
   - DİKKAT: Metin içinde "30 gün içinde istinaf yolu açık" gibi bir ifade varsa MUTLAKA bu süreyi gir (Sadece öneri kısmına yazıp bırakma).
6. "plaintiff_attorney" ve "defendant_attorney": Varsa tam isimleri (Av. ...). Yoksa null.
7. "summary" (Özet): ÇOK DETAYLI VE KAPSAMLI OLMALI. En az 8-10 cümle ile davanın kök sebebini, tarafların tüm iddialarını, hukuki dayanakları ve (varsa) sonucu ayrıntılı açıkla. Asla kısa özet yazma.
8. "urgency" (Aciliyet):
   - "İptal", "Kısmen İptal", "Tazminat Kabul", "Kısmen Kabul" kararları (aleyhe durumlar) için KESİNLİKLE "HIGH" seç.
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
  "summary": "Çok detaylı özet (en az 8-10 cümle).",
  "next_hearing_date": "YYYY-MM-DD (Gelecek duruşma tarihi varsa)",
  "deadline_date": "YYYY-MM-DD (Cevap süresi veya kesin süre bitişi. Yoksa null)",
  "action_duration_days": 15, // Varsa gün sayısı (Örn: "tebliğden itibaren 30 gün" -> 30)
  "decision_result": "Red | İptal | Tazminat Kabul | Kısmen Kabul Kısmen Red | Gönderme | Onama | Bozma | Düzelterek Onama | null",
  "is_final_decision": true, // SADECE dosyanın KAPANMASINI gerektiren nihai kararlar (Onama, Düzelterek Onama, Red, İptal, Tazminat Kabul). "Bozma" veya "Gönderme" durumunda FALSE işaretle (çünkü dosya kapanmaz, devam eder).
  "urgency": "High | Medium | Low",
  "suggested_action": "Örn: '2 hafta içinde cevap dilekçesi hazırla' veya 'Duruşmaya katıl'",
  "primary_tag": "Çevre | Şehircilik | Mevzuat | Diğer",
  "secondary_tags": ["Deprem", "Tazminat", "Adli"] (Dizi olarak)
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

        // CLEANUP: Extract JSON from Markdown code blocks if present
        let cleanedText = responseText.trim();
        // Remove ```json and ``` wrapping
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

        // Find first '{' and last '}'
        const firstOpen = cleanedText.indexOf('{');
        const lastClose = cleanedText.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1) {
            cleanedText = cleanedText.substring(firstOpen, lastClose + 1);
        }

        return JSON.parse(cleanedText);
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
