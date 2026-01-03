// ==========================================
// Adalet Takip Sistemi - Smart App Logic v2.5 (Decision No Added)
// ==========================================

let uploadQueue = [];
let isProcessingQueue = false;

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    await loadLawyers();
    setupRealtimeLawyers(loadLawyers);
    setupEventListeners();
    loadQueueFromStorage();
    // populateModelSelect(); // handled in utils.js
});

// ... (EventListeners, Setup, Queue Storage logic SAME) ... //
function setupEventListeners() {
    const uploadArea = document.getElementById('file-upload-area');
    const fileInput = document.getElementById('document-upload');
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragging'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
        uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.classList.remove('dragging'); if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files)); });
        fileInput.addEventListener('change', (e) => { if (e.target.files.length) { handleFiles(Array.from(e.target.files)); fileInput.value = ''; } });
    }
    const addLawyerForm = document.getElementById('add-lawyer-form');
    if (addLawyerForm) addLawyerForm.addEventListener('submit', handleAddLawyer);
}

// Model selector is now handled in utils.js globally
// function populateModelSelect() { ... } removed


function loadQueueFromStorage() {
    const saved = localStorage.getItem('adalet_upload_queue');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            uploadQueue = parsed.map(item => ({
                ...item,
                status: item.status === 'PROCESSING' ? 'ERROR' : item.status,
                log: item.status === 'PROCESSING' ? 'Sayfa yenilendiği için işlem kesildi.' : item.log,
                fileLost: true
            }));
            uploadQueue = uploadQueue.filter(i => i.status === 'SUCCESS' || i.status === 'MATCHED_AUTO' || i.status === 'REVIEW_REQUIRED');
            updateQueueUI();
            if (uploadQueue.length > 0) document.getElementById('upload-manager').classList.remove('hidden');
        } catch (e) { }
    }
}
function saveQueueToStorage() {
    const toSave = uploadQueue.map(item => {
        const { file, ...rest } = item;
        return { ...rest, fileName: file ? file.name : item.fileName };
    });
    localStorage.setItem('adalet_upload_queue', JSON.stringify(toSave));
}

// ... (handleFiles, processQueueItem) ... //
function handleFiles(files) {
    if (!files.length) return;

    // Admin check - only admins can create new cases via upload
    if (typeof isAdmin === 'function' && !isAdmin()) {
        showToast('Evrak girişi (yeni dosya oluşturma) için admin yetkisi gerekli! Ayarlar menüsünden giriş yapın.', 'error');
        return;
    }

    const manager = document.getElementById('upload-manager');
    manager.classList.remove('hidden');
    manager.classList.remove('minimized');
    files.forEach(file => {
        if (file.size > APP_CONFIG.maxFileSize) { showToast(`${file.name} çok büyük.`, 'error'); return; }
        const item = { id: generateUUID(), file: file, fileName: file.name, status: 'PENDING', progress: 0, log: 'Sıraya alındı...', analysisData: null, timestamp: Date.now() };
        uploadQueue.unshift(item);
        processQueueItem(item);
    });
    updateQueueUI();
}

async function processQueueItem(item) {
    if (!item.file) { item.status = 'ERROR'; item.log = 'Dosya verisi kayıp.'; saveQueueToStorage(); updateQueueUI(); return; }
    item.status = 'PROCESSING'; item.log = 'Analiz yapılıyor...'; item.progress = 10; updateQueueItemUI(item);
    try {
        const analysis = await analyzeFileContent(item.file);
        item.analysisData = analysis;
        item.progress = 50; item.log = 'Veritabanında eşleşme aranıyor...'; updateQueueItemUI(item);
        const matchResult = await findMatchingCase(analysis);

        if (matchResult.matchType === 'STRICT_FULL') { // STRICT Auto Match
            item.status = 'MATCHED_AUTO';
            item.log = `Tam Eşleşme: ${matchResult.case.registration_number}`;
            item.progress = 80; updateQueueItemUI(item);
            await uploadDocument(matchResult.case.id, item.file, analysis);
            item.status = 'SUCCESS'; item.progress = 100; item.log = `Otomatik Eklendi: ${matchResult.case.registration_number}`; item.result = matchResult.case;
            showToast(`"${item.fileName}" otomatik eklendi.`, 'success');
        } else {
            // Manual Review or Suggestion
            item.status = 'REVIEW_REQUIRED';
            item.candidates = matchResult.candidates || [];
            item.progress = 100; item.log = 'Onay bekleniyor.';
            showToast(`"${item.fileName}" onayı gerekiyor.`, 'info');
        }
    } catch (error) {
        console.error('Process Error:', error); item.status = 'ERROR'; item.log = error.message; item.error = error;
    }
    saveQueueToStorage(); updateQueueItemUI(item); updateQueueCount();
}

async function analyzeFileContent(file) {
    let text = '', apiKey = '';
    try {
        const settings = await getSystemSettings(); apiKey = settings.gemini_api_key;
        const userModel = document.getElementById('gemini-model-select')?.value || localStorage.getItem('preferredGeminiModel');
        if (userModel && APP_CONFIG.geminiModels.includes(userModel)) {
            const idx = APP_CONFIG.geminiModels.indexOf(userModel);
            if (idx > -1) { let p = APP_CONFIG.geminiModels.splice(idx, 1)[0]; APP_CONFIG.geminiModels.unshift(p); }
        }
    } catch (e) { }

    // Text Extraction
    // Text Extraction
    const lowerName = file.name.toLowerCase();
    if (file.type === 'application/pdf') {
        if (typeof extractTextFromPDF === 'function') {
            try { text = await extractTextFromPDF(file); } catch (e) { text = ""; }

            if ((!text || text.length < 150) && typeof convertPDFPageToImage === 'function' && apiKey) {
                try {
                    const imageBlob = await convertPDFPageToImage(file);
                    const base64 = await readFileAsBase64(imageBlob);
                    const ocrText = await performOcrWithGemini(base64, 'image/jpeg', apiKey);
                    if (ocrText && ocrText.length > text.length) text = ocrText;
                } catch (e) { console.warn("OCR fallback failed:", e); }
            }
        }
    } else if (lowerName.endsWith('.odt')) {
        text = await extractTextFromODT(file);
    } else if (lowerName.endsWith('.udf')) {
        text = await extractTextFromUDF(file);
    } else if (lowerName.endsWith('.tiff') || lowerName.endsWith('.tif')) {
        if (apiKey) {
            const base64 = await convertTiffToBase64(file);
            text = await performOcrWithGemini(base64, 'image/jpeg', apiKey);
        }
    } else if (file.type.startsWith('image/') && apiKey) {
        text = await performOcrWithGemini(await readFileAsBase64(file), file.type, apiKey);
    } else {
        text = await readFileAsText(file);
    }

    if (!text || text.length < 5) throw new Error('Metin okunamadı.');
    if (apiKey) return await analyzeWithGemini(text, apiKey);
    else return { plaintiff: 'Belirsiz', subject: 'Anahtar Yok', type: 'Evrak', viz_text: text.slice(0, 200) };
}

// ... (UI Update Logic) ... //
function updateQueueUI() {
    const list = document.getElementById('upload-queue-list'); if (!list) return;
    if (uploadQueue.length === 0) list.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">İşlem geçmişi temiz.</div>';
    else list.innerHTML = uploadQueue.map(item => getQueueItemHTML(item)).join('');
    updateQueueCount(); lucide.createIcons(); saveQueueToStorage();
}
function updateQueueItemUI(item) { const el = document.getElementById(`queue-item-${item.id}`); if (el) { el.outerHTML = getQueueItemHTML(item); lucide.createIcons(); } else updateQueueUI(); }
function getQueueItemHTML(item) {
    let badge = 'status-pending', label = 'Bekliyor', icon = 'loader';
    if (item.status === 'PROCESSING') { badge = 'status-processing'; label = 'İşleniyor...'; icon = 'loader'; }
    else if (item.status === 'SUCCESS' || item.status === 'MATCHED_AUTO') { badge = 'status-success'; label = 'Tamamlandı'; icon = 'check'; }
    else if (item.status === 'ERROR') { badge = 'status-error'; label = 'Hata'; icon = 'alert-circle'; }
    else if (item.status === 'REVIEW_REQUIRED') { badge = 'status-warning'; label = 'Onay'; icon = 'eye'; }
    return `
        <div class="upload-item" id="queue-item-${item.id}" style="display:flex; gap:10px;">
            <div style="min-width:30px; display:flex; justify-content:center; padding-top:5px;"><i data-lucide="${icon}" class="${item.status == 'PROCESSING' ? 'spin' : ''}" style="width:20px;"></i></div>
            <div style="flex:1;">
                <div class="upload-item-header">
                    <div class="upload-filename" title="${item.fileName}">${escapeHtml(item.fileName)}</div>
                    <span class="status-badge ${badge}">${label}</span>
                </div>
                <div class="upload-details">${escapeHtml(item.log || '')}</div>
                ${item.status === 'PROCESSING' ? `<div class="mini-progress scanning"><div class="mini-progress-bar" style="width:${item.progress}%"></div></div>` : ''}
                ${item.status === 'REVIEW_REQUIRED' ? `<div class="upload-actions" style="margin-top:10px;"><button class="btn btn-primary btn-sm w-full" onclick="openReviewModal('${item.id}')"><i data-lucide="eye"></i> İncele & Onayla</button></div>` : ''}
                ${(item.result) ? `<div class="upload-actions" style="margin-top:5px;"><a href="file-detail.html?id=${item.result.id}" class="btn btn-ghost btn-sm w-full" style="text-align:left; padding-left:0;"><i data-lucide="arrow-right"></i> Dosyaya Git (${item.result.registration_number})</a></div>` : ''}
            </div>
            <button onclick="removeFromQueue('${item.id}')" class="icon-btn"><i data-lucide="x" style="width:14px;"></i></button>
        </div>
    `;
}
function removeFromQueue(id) { uploadQueue = uploadQueue.filter(i => i.id !== id); saveQueueToStorage(); updateQueueUI(); }
function updateQueueCount() { const count = uploadQueue.filter(i => i.status === 'PROCESSING' || i.status === 'REVIEW_REQUIRED').length; const el = document.getElementById('queue-count'); if (el) el.textContent = count; }
function toggleUploadManager() { document.getElementById('upload-manager').classList.toggle('minimized'); }

// ==========================================
// REVIEW MODAL LOGIC (UPDATED WITH DECISION NO)
// ==========================================
let currentReviewItemId = null;
function openReviewModal(itemId) {
    const item = uploadQueue.find(i => i.id === itemId); if (!item || !item.analysisData) return;
    currentReviewItemId = itemId;
    const data = item.analysisData;
    const candidates = item.candidates || [];

    // [LOGIC] Enforce "Karar", "İstinaf Kararı", or "Temyiz Kararı" if decision_result exists
    // But don't overwrite if it's already specific (e.g. Temyiz Kararı)
    if (data.decision_result && data.decision_result.length > 2) {
        const currentType = data.type || '';
        if (!currentType.includes('Karar')) {
            if (currentType.includes('İstinaf')) data.type = 'İstinaf Kararı';
            else if (currentType.includes('Temyiz')) data.type = 'Temyiz Kararı';
            else data.type = 'Karar';
        }
    }

    // [FIX] Calculate deadline_date from action_duration_days if not already set
    // Handle "kesin karar" - no deadline needed
    const decisionTypes = ['Ara Karar', 'İstinaf Kararı', 'Temyiz Kararı', 'Karar'];
    const isDecisionType = decisionTypes.some(t => (data.type || '').includes(t));
    let durationWarning = data.deadline_warning || ''; // Use AI-provided warning if any

    // If is_final_no_deadline is true, this is a "kesin karar" - skip deadline
    if (data.is_final_no_deadline === true) {
        data.action_duration_days = null;
        data.deadline_date = null;
        durationWarning = '✓ Kesin karar, işlem süresi uygulanmaz.';
        console.log(`[Review Modal] Kesin karar detected, no deadline needed.`);
    } else if (isDecisionType && !data.action_duration_days) {
        // If it's a decision type and no duration was extracted, default to 30 days
        data.action_duration_days = 30;
        if (!durationWarning) {
            durationWarning = '⚠️ Süre metinden okunamadı, otomatik 30 gün eklendi.';
        }
        console.log(`[Review Modal] Applied default duration (30 days) for decision type: ${data.type}`);
    }

    // [FIX] Force calculation of deadline_date from action_duration_days relative to TODAY
    // User Requirement: Start date is "Upload Date" (Today), not decision date.
    // Only calculate if not a kesin karar
    if (data.action_duration_days && data.is_final_no_deadline !== true) {
        const days = parseInt(data.action_duration_days);
        if (!isNaN(days) && days > 0) {
            const today = new Date();
            const deadline = new Date(today);
            deadline.setDate(today.getDate() + days);
            data.deadline_date = deadline.toISOString().split('T')[0];
            console.log(`[Review Modal] Recalculated deadline: ${data.deadline_date} (Today + ${days} days).`);
        }
    }

    const content = `
        <div class="review-grid">
            <div class="review-section">
                <h3><i data-lucide="file-text"></i> Analiz</h3>
                <div class="review-field"><label>Tip</label>
                    <select id="review-type" class="form-control">
                        <option value="">Seçiniz</option>
                        <option value="Dava Dilekçesi" ${data.type === 'Dava Dilekçesi' ? 'selected' : ''}>Dava Dilekçesi</option>
                        <option value="Savunma Dilekçesi" ${data.type === 'Savunma Dilekçesi' ? 'selected' : ''}>Savunma Dilekçesi</option>
                        <option value="Cevap Dilekçesi" ${data.type === 'Cevap Dilekçesi' ? 'selected' : ''}>Cevap Dilekçesi</option>
                        <option value="Savunmaya Cevap Dilekçesi" ${data.type === 'Savunmaya Cevap Dilekçesi' ? 'selected' : ''}>Savunmaya Cevap Dilekçesi</option>
                        <option value="Ara Karar" ${data.type === 'Ara Karar' ? 'selected' : ''}>Ara Karar</option>
                        <option value="Bilirkişi Raporu" ${data.type === 'Bilirkişi Raporu' ? 'selected' : ''}>Bilirkişi Raporu</option>
                        <option value="Bilirkişi Raporuna İtiraz" ${data.type === 'Bilirkişi Raporuna İtiraz' ? 'selected' : ''}>Bilirkişi Raporuna İtiraz</option>
                        <option value="Karar" ${data.type === 'Karar' ? 'selected' : ''}>Karar</option>
                        <option value="İstinaf Talebi" ${data.type === 'İstinaf Talebi' ? 'selected' : ''}>İstinaf Talebi</option>
                        <option value="İstinafa Cevap" ${data.type === 'İstinafa Cevap' ? 'selected' : ''}>İstinafa Cevap</option>
                        <option value="İstinaf Kararı" ${data.type === 'İstinaf Kararı' ? 'selected' : ''}>İstinaf Kararı</option>
                        <option value="Temyiz Talebi" ${data.type === 'Temyiz Talebi' ? 'selected' : ''}>Temyiz Talebi</option>
                        <option value="Temyize Cevap" ${data.type === 'Temyize Cevap' ? 'selected' : ''}>Temyize Cevap</option>
                        <option value="Temyiz Kararı" ${data.type === 'Temyiz Kararı' ? 'selected' : ''}>Temyiz Kararı</option>
                        <option value="Diğer" ${data.type === 'Diğer' || !data.type ? 'selected' : ''}>Diğer</option>
                    </select>
                </div>
                <div class="review-field"><label>Sonuç</label>
                     <select id="review-decision-result" class="form-control">
                         <option value="">Seçiniz (Varsa)</option>
                         <option value="Red" ${data.decision_result === 'Red' ? 'selected' : ''}>Red</option>
                         <option value="İptal" ${data.decision_result === 'İptal' ? 'selected' : ''}>İptal</option>
                         <option value="Onama" ${data.decision_result === 'Onama' ? 'selected' : ''}>Onama</option>
                         <option value="Bozma" ${data.decision_result === 'Bozma' ? 'selected' : ''}>Bozma</option>
                         <option value="Kısmen Kabul Kısmen Red" ${data.decision_result === 'Kısmen Kabul Kısmen Red' ? 'selected' : ''}>Kısmen Kabul Kısmen Red</option>
                         <option value="Gönderme" ${data.decision_result === 'Gönderme' ? 'selected' : ''}>Gönderme</option>
                         <option value="Kabul" ${data.decision_result === 'Kabul' ? 'selected' : ''}>Kabul</option>
                         <option value="Diğer" ${data.decision_result === 'Diğer' ? 'selected' : ''}>Diğer</option>
                     </select>
                </div>
                <div class="review-field"><label>Mahkeme</label><input type="text" id="review-court" value="${data.court_name || ''}" class="form-control"></div>
                <div class="review-field"><label>Esas No</label><input type="text" id="review-esas" value="${data.court_case_number || ''}" class="form-control"></div>
                <div class="review-field"><label>Karar No</label><input type="text" id="review-decision" value="${data.court_decision_number || ''}" class="form-control" placeholder="Varsa"></div>
                <div class="review-field"><label>Karar Tarihi</label><input type="date" id="review-decision-date" value="${data.decision_date || ''}" class="form-control"></div>
                <div class="review-field"><label>Konu (Tag)</label>
                    <select id="review-primary-tag" class="form-control">
                         <option value="">Seçiniz</option>
                         <option value="Çevre" ${data.primary_tag === 'Çevre' ? 'selected' : ''}>Çevre</option>
                         <option value="Şehircilik" ${data.primary_tag === 'Şehircilik' ? 'selected' : ''}>Şehircilik</option>
                         <option value="Mevzuat" ${data.primary_tag === 'Mevzuat' ? 'selected' : ''}>Mevzuat</option>
                         <option value="Diğer" ${data.primary_tag === 'Diğer' ? 'selected' : ''}>Diğer</option>
                    </select>
                </div>
            </div>
            <div class="review-section">
                <h3><i data-lucide="users"></i> Taraflar</h3>
                <div class="review-field"><label>Davacı</label><input type="text" id="review-plaintiff" value="${data.plaintiff || ''}" class="form-control"></div>
                <div class="review-field"><label>Davacı Vekili</label><input type="text" id="review-plaintiff-attorney" value="${data.plaintiff_attorney || ''}" class="form-control" placeholder="Av. ..."></div>
                <div class="review-field"><label>Davalı</label><input type="text" id="review-defendant" value="${data.defendant || ''}" class="form-control"></div>
                <div class="review-field"><label>Davalı Vekili</label><input type="text" id="review-defendant-attorney" value="${data.defendant_attorney || ''}" class="form-control" placeholder="Av. ..."></div>
                <div class="review-field"><label>Değer</label><input type="text" id="review-amount" value="${data.claim_amount || ''}" class="form-control"></div>
                <div class="review-field"><label>Ek Etiketler</label><input type="text" id="review-tags" value="${(data.secondary_tags || data.tags || []).join(', ')}" class="form-control" placeholder="Virgülle ayır"></div>
            </div>
            <div class="review-section" style="border-left: 2px solid var(--accent-warning); padding-left: 10px;">
                <h3><i data-lucide="calendar-clock"></i> İş Akışı</h3>
                <div class="review-field"><label>Duruşma/Keşif</label><input type="date" id="review-hearing" value="${data.next_hearing_date || ''}" class="form-control"></div>
                <div class="review-field">
                    <label>İşlem Süresi</label>
                    <input type="date" id="review-deadline" value="${data.deadline_date || ''}" class="form-control" style="color:var(--accent-danger);">
                    ${durationWarning ? `<div style="color:var(--accent-warning); font-size:0.75rem; margin-top:4px;">${durationWarning}</div>` : ''}
                </div>
                <div class="review-field"><label>Aciliyet</label>
                    <select id="review-urgency" class="form-control">
                        <option value="LOW" ${data.urgency === 'LOW' ? 'selected' : ''}>Düşük</option>
                        <option value="MEDIUM" ${(!data.urgency || data.urgency === 'MEDIUM') ? 'selected' : ''}>Orta</option>
                        <option value="HIGH" ${data.urgency === 'HIGH' ? 'selected' : ''}>Yüksek (Acil)</option>
                    </select>
                </div>
            </div>
        </div>
        <div class="review-summary">
            <label>Özet</label><textarea id="review-summary" class="form-control" rows="2">${data.summary || data.subject || ''}</textarea>
        </div>
        <div class="review-summary" style="margin-top:10px;">
             <label>AI Önerisi</label><input type="text" id="review-action" value="${data.suggested_action || ''}" class="form-control" style="font-style:italic; color:var(--text-secondary);">
        </div>
        <div class="review-manual-link mt-4" style="border-top:1px solid rgba(255,255,255,0.1); padding-top:15px;">
            ${candidates.length > 0 ? `
            <div style="margin-bottom:15px; background:rgba(6, 182, 212, 0.1); border:1px solid rgba(6, 182, 212, 0.3); border-radius:8px; padding:10px;">
                <h4 style="font-size:0.8rem; color:var(--accent-secondary); margin-bottom:8px; display:flex; align-items:center; gap:5px;"><i data-lucide="sparkles"></i> Benzer Dosyalar</h4>
                ${candidates.map(c => {
        const score = c.matchScore || 0;
        const isStrong = score >= 5;
        const reason = c.matchReason || 'Benzerlik';

        return `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; margin-bottom:5px; border-left: 3px solid ${isStrong ? 'var(--accent-success)' : 'var(--accent-warning)'};">
                        <div style="flex:1;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="font-weight:600; font-size:0.9rem; color:#fff;">${escapeHtml(c.registration_number || 'Numara Yok')}</div>
                                ${isStrong ? '<span class="badge badge-active" style="font-size:0.6rem; padding:2px 6px;">Yüksek Eşleşme</span>' : ''}
                            </div>
                            <div style="font-size:0.75rem; opacity:0.8; color:#ccc;">${escapeHtml(c.court_name || '')} | ${escapeHtml(c.court_case_number || '')}</div>
                            <div style="font-size:0.7rem; color:var(--accent-secondary); margin-top:2px;">Detect: ${escapeHtml(reason)}</div>
                        </div>
                        <button onclick="linkToSpecificCase('${c.id}', '${escapeHtml(c.registration_number)}')" class="btn btn-sm btn-secondary" style="font-size:0.7rem; white-space:nowrap;">
                            <i data-lucide="link" style="width:12px; height:12px; margin-right:4px;"></i> Bağla
                        </button>
                    </div>`;
    }).join('')}
            </div>` : ''}
            <div class="flex gap-2" style="display:flex; gap:10px; margin-top:5px;">
                <input type="text" id="manual-case-id" placeholder="Manuel Dosya No (2024/0001)" class="form-control">
                <button onclick="linkToExistingCase()" class="btn btn-secondary">Bağla</button>
            </div>
        </div>
    `;
    document.getElementById('review-modal-content').innerHTML = content;
    document.getElementById('review-modal').classList.add('active');
    lucide.createIcons();
}

async function approveNewCase() {
    const item = uploadQueue.find(i => i.id === currentReviewItemId);
    const btn = document.getElementById('btn-approve-new');
    if (!item) return;

    // Validation (Relaxed: allow empty, but strict format if filled)
    const esasNo = document.getElementById('review-esas').value.trim();
    const kararNo = document.getElementById('review-decision').value.trim();
    const courtName = document.getElementById('review-court').value.trim();
    const formatRegex = /^\d{4}\/\d+$/;

    if (esasNo && !formatRegex.test(esasNo)) {
        showToast('Esas No formatı hatalı! (Örn: 2024/1458)', 'error');
        return;
    }
    if (kararNo && !formatRegex.test(kararNo)) {
        showToast('Karar No formatı hatalı! (Örn: 2024/55)', 'error');
        return;
    }

    // Strict Court Name Validation (Must contain 'daire' or 'mahkeme')
    if (courtName) {
        const lowerCourt = courtName.toLowerCase();
        if (!lowerCourt.includes('mahkeme') && !lowerCourt.includes('daire')) {
            showToast('Mahkeme adı geçersiz! "Mahkemesi" veya "Dairesi" kelimelerini içermeli.', 'error');
            // Strict blocking
            return;
        }
        if (courtName.split(' ').length < 2) {
            showToast('Mahkeme adı çok kısa. (Örn: Ankara 2. İdare Mahkemesi)', 'warning');
            // Warning only allow proceed
        }
    }

    btn.disabled = true; btn.innerHTML = 'Oluşturuluyor...';
    try {
        const newData = {
            type: document.getElementById('review-type').value,
            court_name: courtName,
            court_case_number: esasNo,
            court_decision_number: kararNo,
            plaintiff: document.getElementById('review-plaintiff').value,
            plaintiff_attorney: document.getElementById('review-plaintiff-attorney').value,
            defendant: document.getElementById('review-defendant').value,
            defendant_attorney: document.getElementById('review-defendant-attorney').value,
            claim_amount: document.getElementById('review-amount').value,
            summary: document.getElementById('review-summary').value,
            subject: document.getElementById('review-summary').value,
            // [NEW] Primary and Secondary Tags
            primary_tag: document.getElementById('review-primary-tag').value,
            tags: document.getElementById('review-tags').value.split(',').map(t => t.trim()).filter(t => t.length > 0),
            // Workflow fields (mapped to schema)
            next_hearing_date: document.getElementById('review-hearing').value || null,
            deadline_date: document.getElementById('review-deadline').value || null, // [FIX] Add explicit deadline field
            case_status_notes: `[Action: ${document.getElementById('review-action').value}] [Deadline: ${document.getElementById('review-deadline').value || 'N/A'}] [Urgency: ${document.getElementById('review-urgency').value}]`,
            latest_decision_result: document.getElementById('review-decision-result').value || null // [NEW]
        };
        const newCase = await createFileCase(newData, item.file);



        // [NEW] Create decision record if this is a decision document
        const decisionResult = document.getElementById('review-decision-result')?.value || '';
        const decisionDate = document.getElementById('review-decision-date')?.value || null;

        // Auto-detect decision type from court name
        function detectDecisionType(courtNameVal) {
            const court = (courtNameVal || '').toLowerCase();
            if (court.includes('danıştay') || court.includes('yargıtay')) {
                return 'TEMYIZ';
            } else if (court.includes('bölge') || court.includes('istinaf')) {
                return 'ISTINAF';
            }
            return 'ILK_DERECE';
        }

        const decisionType = detectDecisionType(courtName);

        // Create decision if decision result is selected or has karar no
        if ((decisionResult || kararNo) && newCase.id) {
            try {
                await createDecision({
                    file_case_id: newCase.id,
                    decision_type: decisionType,
                    decision_result: decisionResult || 'Belirsiz',
                    decision_date: decisionDate,
                    decision_number: kararNo || null,
                    court_name: courtName || null,
                    court_case_number: esasNo || null
                });
                // Update latest_decision_result
                await supabase.from('file_cases').update({ latest_decision_result: decisionResult || null }).eq('id', newCase.id);
            } catch (decErr) {
                console.warn('Decision creation failed:', decErr);
            }
        }

        // [FIX] uploadDocument is already called inside createFileCase
        // Removing duplicate call.
        /* if (item.file) {
            await uploadDocument(newCase.id, item.file, item.analysisData);
        } */

        item.status = 'SUCCESS'; item.result = newCase; item.log = `Yeni: ${newCase.registration_number}`;
        closeReviewModal(); saveQueueToStorage(); updateQueueItemUI(item); loadLawyers(); showToast('Yeni dosya oluşturuldu.', 'success');
    } catch (e) { showToast('Hata: ' + e.message, 'error'); btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle"></i> Onayla'; }
}
async function linkToExistingCase() { const reg = document.getElementById('manual-case-id').value.trim(); if (!reg) return showToast('Dosya No girin', 'warning'); const { data: c } = await supabase.from('file_cases').select('id,registration_number').eq('registration_number', reg); if (!c || !c.length) return showToast('Bulunamadı', 'error'); await linkToSpecificCase(c[0].id, c[0].registration_number); }

async function linkToSpecificCase(cid, cnum) {
    const item = uploadQueue.find(i => i.id === currentReviewItemId);
    if (!item) return;

    try {
        await uploadDocument(cid, item.file, item.analysisData);

        // [NEW] Create decision record if this is a decision document
        const decisionResult = document.getElementById('review-decision-result')?.value || '';
        const decisionDate = document.getElementById('review-decision-date')?.value || null;
        const kararNo = document.getElementById('review-decision')?.value || '';
        const courtName = document.getElementById('review-court')?.value || '';
        const esasNo = document.getElementById('review-esas')?.value || '';

        // Auto-detect decision type from court name
        function detectDecisionType(courtNameVal) {
            const court = (courtNameVal || '').toLowerCase();
            if (court.includes('danıştay') || court.includes('yargıtay')) {
                return 'TEMYIZ';
            } else if (court.includes('bölge') || court.includes('istinaf')) {
                return 'ISTINAF';
            }
            return 'ILK_DERECE';
        }

        const decisionType = detectDecisionType(courtName);

        // Create decision if decision result is selected or has karar no
        if (decisionResult || kararNo) {
            try {
                await createDecision({
                    file_case_id: cid,
                    decision_type: decisionType,
                    decision_result: decisionResult || 'Belirsiz',
                    decision_date: decisionDate,
                    decision_number: kararNo || null,
                    court_name: courtName || null,
                    court_case_number: esasNo || null
                });
                // Update latest_decision_result
                await supabase.from('file_cases').update({ latest_decision_result: decisionResult || null }).eq('id', cid);
            } catch (decErr) {
                console.warn('Decision creation failed:', decErr);
            }
        }

        item.status = 'SUCCESS';
        item.result = { id: cid, registration_number: cnum };
        item.log = `Eklendi: ${cnum}`;
        closeReviewModal();
        saveQueueToStorage();
        updateQueueItemUI(item);
        showToast('Eklendi', 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function closeReviewModal() { document.getElementById('review-modal').classList.remove('active'); currentReviewItemId = null; }
// ... (loadLawyers, Settings SAME) ... //
async function loadLawyers() { const c = document.getElementById('lawyers-list'); try { const l = await getLawyers(); c.innerHTML = l.length ? l.map(a => `<div class="lawyer-item"><div><strong>${escapeHtml(a.name)}</strong><span style="font-size:0.8em;color:#666;display:block;">${a.assigned_files_count || 0} Dosya</span></div><span class="badge ${a.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${a.status}</span></div>`).join('') : '<p style="text-align:center;color:#666">Yok.</p>'; } catch (e) { c.innerHTML = 'Hata'; } }
async function handleAddLawyer(e) { e.preventDefault(); try { await createLawyer(document.getElementById('new-lawyer-name').value, document.getElementById('new-lawyer-username').value, document.getElementById('new-lawyer-password').value); showToast('Eklendi', 'success'); e.target.reset(); loadLawyers(); } catch (x) { showToast(x.message, 'error'); } }
// ==========================================
// Settings Modal Logic
// ==========================================

function openSettingsModal() {
    document.getElementById('settings-modal').classList.add('active');
    loadSettingsData();
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.remove('active');
}

async function loadSettingsData() {
    try {
        const s = await getSystemSettings();
        document.getElementById('gemini-api-key').value = s.gemini_api_key || '';
        document.getElementById('burst-limit').value = s.catchup_burst_limit || 2;

        // Load OpenRouter Key from LocalStorage
        const orKey = localStorage.getItem('openrouter_api_key');
        if (orKey) document.getElementById('openrouter-api-key').value = orKey;

        const p = localStorage.getItem('preferredGeminiModel');
        if (p) document.getElementById('gemini-model-select').value = p;
    } catch (e) { }
}
async function saveSettings() {
    try {
        await updateSystemSettings({
            gemini_api_key: document.getElementById('gemini-api-key').value.trim(),
            catchup_burst_limit: parseInt(document.getElementById('burst-limit').value)
        });

        // Save OpenRouter Key to LocalStorage
        const orKey = document.getElementById('openrouter-api-key').value.trim();
        if (orKey) localStorage.setItem('openrouter_api_key', orKey);
        else localStorage.removeItem('openrouter_api_key');

        localStorage.setItem('preferredGeminiModel', document.getElementById('gemini-model-select').value);
        showToast('Ayarlar ve Anahtarlar Kaydedildi', 'success');
        closeSettingsModal();
    } catch (e) { showToast('Hata: ' + e.message, 'error'); }
}
window.openSettingsModal = openSettingsModal; window.closeSettingsModal = closeSettingsModal; window.saveSettings = saveSettings; window.openReviewModal = openReviewModal; window.closeReviewModal = closeReviewModal; window.approveNewCase = approveNewCase; window.linkToExistingCase = linkToExistingCase; window.linkToSpecificCase = linkToSpecificCase; window.toggleUploadManager = toggleUploadManager; window.removeFromQueue = removeFromQueue;
