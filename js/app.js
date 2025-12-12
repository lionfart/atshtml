// ... (Previous imports and init logic unchanged) ... //

// ==========================================
// Adalet Takip Sistemi - Smart App Logic v2.5
// ==========================================

let uploadQueue = [];
let isProcessingQueue = false;

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    await loadLawyers();
    setupRealtimeLawyers(loadLawyers);
    setupEventListeners();
    loadQueueFromStorage();
    populateModelSelect();
});

// ... (EventListeners, Setup, Queue Storage logic SAME as before) ... //

// ==========================================
// Setup & Events (Shortened for brevity basically same)
// ==========================================
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
// ... (populateModelSelect, loadQueueFromStorage, saveQueueToStorage SAME) ... //

function populatedData() {
    // Populate model select
    const select = document.getElementById('gemini-model-select');
    if (select) {
        select.innerHTML = ''; // Clear first to avoid dupes on reload
        APP_CONFIG.geminiModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.text = model + (model.includes('exp') ? ' (Experimental)' : '');
            select.appendChild(option);
        });
        const savedModel = localStorage.getItem('preferredGeminiModel');
        if (savedModel) select.value = savedModel;
    }
}
function populateModelSelect() { populatedData(); }

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
        } catch (e) { console.error('Queue restore error', e); }
    }
}
function saveQueueToStorage() {
    const toSave = uploadQueue.map(item => {
        const { file, ...rest } = item;
        return { ...rest, fileName: file ? file.name : item.fileName };
    });
    localStorage.setItem('adalet_upload_queue', JSON.stringify(toSave));
}

// ==========================================
// Core Handling
// ==========================================
function handleFiles(files) {
    if (!files.length) return;
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

    item.status = 'PROCESSING'; item.log = 'OCR ve Akıllı Analiz yapılıyor...'; item.progress = 10; updateQueueItemUI(item);

    try {
        const analysis = await analyzeFileContent(item.file);
        item.analysisData = analysis;
        item.progress = 50; item.log = 'Veritabanında eşleşme aranıyor...'; updateQueueItemUI(item);

        const matchResult = await findMatchingCase(analysis);

        if (matchResult.case) { // Confident Match
            item.status = 'MATCHED_AUTO';
            item.log = `Eşleşti: ${matchResult.case.registration_number}`;
            item.progress = 80; updateQueueItemUI(item);
            await uploadDocument(matchResult.case.id, item.file, analysis);
            item.status = 'SUCCESS'; item.progress = 100; item.log = `Dosyaya Eklendi: ${matchResult.case.registration_number}`; item.result = matchResult.case;
            showToast(`"${item.fileName}" mevcut dosyaya eklendi.`, 'success');

        } else { // No Confident Match -> Review
            item.status = 'REVIEW_REQUIRED';
            item.candidates = matchResult.candidates || []; // Store candidates for UI
            item.progress = 100; item.log = 'Onay bekleniyor.';
            showToast(`"${item.fileName}" için onay bekleniyor.`, 'info');
        }
    } catch (error) {
        console.error('Process Error:', error);
        item.status = 'ERROR'; item.log = error.message; item.error = error;
    }
    saveQueueToStorage(); updateQueueItemUI(item); updateQueueCount();
}

// ... (AI Helpers analyzeFileContent SAME) ... //
async function analyzeFileContent(file) {
    let text = '', apiKey = '';
    try {
        const settings = await getSystemSettings(); apiKey = settings.gemini_api_key;
        const userModel = document.getElementById('gemini-model-select')?.value || localStorage.getItem('preferredGeminiModel');
        if (userModel && APP_CONFIG.geminiModels.includes(userModel)) {
            const idx = APP_CONFIG.geminiModels.indexOf(userModel);
            if (idx > -1) { const preferred = APP_CONFIG.geminiModels.splice(idx, 1)[0]; APP_CONFIG.geminiModels.unshift(preferred); }
        }
    } catch (e) { }

    if (file.type === 'application/pdf') {
        try {
            text = await extractTextFromPDF(file);
            if (text.length < 50 && apiKey) {
                const img = await convertPDFPageToImage(file);
                text = await performOcrWithGemini(await readFileAsBase64(img), 'image/jpeg', apiKey);
            }
        } catch (e) { }
    } else if (file.type.startsWith('image/') && apiKey) {
        text = await performOcrWithGemini(await readFileAsBase64(file), file.type, apiKey);
    } else { text = await readFileAsText(file); }
    if (!text || text.length < 5) throw new Error('Metin okunamadı.');
    if (apiKey) return await analyzeWithGemini(text, apiKey);
    else return { plaintiff: 'Belirsiz', subject: 'AI Anahtarı Girilmedi', type: 'Evrak', viz_text: text.slice(0, 200) };
}

// ... (UI Update Logic - Grid - SAME) ... //
function updateQueueUI() {
    const list = document.getElementById('upload-queue-list'); if (!list) return;
    if (uploadQueue.length === 0) list.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">İşlem geçmişi temiz.</div>';
    else list.innerHTML = uploadQueue.map(item => getQueueItemHTML(item)).join('');
    updateQueueCount(); lucide.createIcons(); saveQueueToStorage();
}
function updateQueueItemUI(item) { const el = document.getElementById(`queue-item-${item.id}`); if (el) { el.outerHTML = getQueueItemHTML(item); lucide.createIcons(); } else updateQueueUI(); }

function getQueueItemHTML(item) {
    let badgeClass = 'status-pending', label = 'Bekliyor', icon = 'loader';
    if (item.status === 'PROCESSING') { badgeClass = 'status-processing'; label = 'İşleniyor...'; icon = 'loader'; }
    else if (item.status === 'SUCCESS') { badgeClass = 'status-success'; label = 'Tamamlandı'; icon = 'check'; }
    else if (item.status === 'MATCHED_AUTO') { badgeClass = 'status-success'; label = 'Otomatik Eklendi'; icon = 'check-circle'; }
    else if (item.status === 'ERROR') { badgeClass = 'status-error'; label = 'Hata'; icon = 'alert-circle'; }
    else if (item.status === 'REVIEW_REQUIRED') { badgeClass = 'status-warning'; label = 'Onay Bekliyor'; icon = 'eye'; }

    return `
        <div class="upload-item" id="queue-item-${item.id}" style="display:flex; gap:10px; align-items:flex-start;">
            <div style="min-width:30px; display:flex; justify-content:center; padding-top:5px;">
                <i data-lucide="${icon}" class="${item.status === 'PROCESSING' ? 'spin' : ''}" style="width:20px; color:var(--text-secondary)"></i>
            </div>
            <div style="flex:1;">
                <div class="upload-item-header">
                    <div class="upload-filename" title="${item.fileName}">${escapeHtml(item.fileName)}</div>
                    <span class="status-badge ${badgeClass}">${label}</span>
                </div>
                <div class="upload-details">${escapeHtml(item.log || '')}</div>
                ${item.status === 'PROCESSING' ? `<div class="mini-progress scanning"><div class="mini-progress-bar" style="width: ${item.progress}%"></div></div>` : ''}
                ${item.status === 'REVIEW_REQUIRED' ? `<div class="upload-actions" style="margin-top:10px;"><button class="btn btn-primary btn-sm w-full" onclick="openReviewModal('${item.id}')"><i data-lucide="eye"></i> İncele & Onayla</button></div>` : ''}
                ${(item.status === 'SUCCESS' || item.status === 'MATCHED_AUTO') && item.result ? `<div class="upload-actions" style="margin-top:5px;"><a href="file-detail.html?id=${item.result.id}" class="btn btn-ghost btn-sm w-full" style="text-align:left; padding-left:0;"><i data-lucide="arrow-right"></i> Dosyaya Git (${item.result.registration_number})</a></div>` : ''}
            </div>
            <button onclick="removeFromQueue('${item.id}')" class="icon-btn" style="width:24px; height:24px;" title="Kaldır"><i data-lucide="x" style="width:14px;"></i></button>
        </div>
    `;
}
function removeFromQueue(id) { uploadQueue = uploadQueue.filter(i => i.id !== id); saveQueueToStorage(); updateQueueUI(); }
function updateQueueCount() { const count = uploadQueue.filter(i => i.status === 'PROCESSING' || i.status === 'REVIEW_REQUIRED').length; const el = document.getElementById('queue-count'); if (el) el.textContent = count; }
function toggleUploadManager() { document.getElementById('upload-manager').classList.toggle('minimized'); }

// ... (Settings Logic SAME) ... //
function openSettingsModal() { document.getElementById('settings-modal').classList.add('active'); loadSettingsData(); }
function closeSettingsModal() { document.getElementById('settings-modal').classList.remove('active'); }
async function loadSettingsData() { try { const settings = await getSystemSettings(); document.getElementById('gemini-api-key').value = settings.gemini_api_key || ''; document.getElementById('burst-limit').value = settings.catchup_burst_limit || 2; const pref = localStorage.getItem('preferredGeminiModel'); if (pref) document.getElementById('gemini-model-select').value = pref; } catch (error) { } }
async function saveSettings() { const apiKey = document.getElementById('gemini-api-key').value.trim(); const burst = parseInt(document.getElementById('burst-limit').value) || 2; const model = document.getElementById('gemini-model-select').value; try { await updateSystemSettings({ gemini_api_key: apiKey, catchup_burst_limit: burst }); localStorage.setItem('preferredGeminiModel', model); showToast('Ayarlar kaydedildi.', 'success'); closeSettingsModal(); } catch (error) { showToast('Hata', 'error'); } }
window.openSettingsModal = openSettingsModal; window.closeSettingsModal = closeSettingsModal; window.saveSettings = saveSettings;

// ==========================================
// REVIEW MODAL LOGIC (UPDATED WITH CANDIDATES)
// ==========================================
let currentReviewItemId = null;

function openReviewModal(itemId) {
    const item = uploadQueue.find(i => i.id === itemId);
    if (!item || !item.analysisData) return;

    currentReviewItemId = itemId;
    const data = item.analysisData;
    const candidates = item.candidates || [];

    // Suggestions HTML
    let suggestionsHtml = '';
    if (candidates.length > 0) {
        suggestionsHtml = `
            <div style="margin-top:10px; margin-bottom:15px; background:rgba(6, 182, 212, 0.1); border:1px solid rgba(6, 182, 212, 0.3); border-radius:8px; padding:10px;">
                <h4 style="font-size:0.8rem; color:var(--accent-secondary); margin-bottom:8px; display:flex; align-items:center; gap:5px;">
                    <i data-lucide="sparkles"></i> AI Önerisi: Benzer Dosyalar Bulundu
                </h4>
                ${candidates.map(c => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; margin-bottom:5px;">
                        <div>
                            <div style="font-weight:600; font-size:0.9rem;">${c.registration_number}</div>
                            <div style="font-size:0.75rem; color:#aaa;">${c.plaintiff} v. ${c.defendant || '?'}</div>
                        </div>
                        <button onclick="linkToSpecificCase('${c.id}', '${c.registration_number}')" class="btn btn-sm btn-secondary" style="border-color:var(--accent-secondary)">
                            Buna Bağla
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const content = `
        <div class="review-grid">
            <div class="review-section">
                <h3><i data-lucide="file-text"></i> Analiz Sonuçları</h3>
                <div class="review-field"><label>Evrak Türü</label><input type="text" id="review-type" value="${data.type || ''}" class="form-control"></div>
                <div class="review-field"><label>Mahkeme</label><input type="text" id="review-court" value="${data.court_name || ''}" class="form-control"></div>
                <div class="review-field"><label>Esas No</label><input type="text" id="review-esas" value="${data.court_case_number || ''}" class="form-control"></div>
            </div>
            <div class="review-section">
                <h3><i data-lucide="users"></i> Taraflar</h3>
                <div class="review-field"><label>Davacı</label><input type="text" id="review-plaintiff" value="${data.plaintiff || ''}" class="form-control"></div>
                <div class="review-field"><label>Davalı</label><input type="text" id="review-defendant" value="${data.defendant || ''}" class="form-control"></div>
                <div class="review-field"><label>Dava Değeri</label><input type="text" id="review-amount" value="${data.claim_amount || ''}" class="form-control"></div>
            </div>
        </div>
        <div class="review-summary"><label>Özet</label><textarea id="review-summary" class="form-control" rows="2">${data.summary || data.subject || ''}</textarea></div>
        <div class="review-preview"><label>Metin Önizlemesi</label><p>${data.viz_text || 'Metin yok'}</p></div>
        
        <div class="review-manual-link mt-4" style="margin-top:20px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.1)">
            ${suggestionsHtml}
            
            <label style="color:#888; font-size:0.8rem;">Ya da Manuel Bağla:</label>
            <div class="flex gap-2" style="display:flex; gap:10px; margin-top:5px;">
                <input type="text" id="manual-case-id" placeholder="Dosya No (Örn: 2025/0012)" class="form-control">
                <button onclick="linkToExistingCase()" class="btn btn-secondary">Ara & Bağla</button>
            </div>
        </div>
    `;

    document.getElementById('review-modal-content').innerHTML = content;
    document.getElementById('review-modal').classList.add('active');
    lucide.createIcons();
}

async function approveNewCase() { /* SAME as before */
    const item = uploadQueue.find(i => i.id === currentReviewItemId);
    const btn = document.getElementById('btn-approve-new');
    if (!item) return; btn.disabled = true; btn.innerHTML = 'Oluşturuluyor...';
    try {
        const newData = { type: document.getElementById('review-type').value, court_name: document.getElementById('review-court').value, court_case_number: document.getElementById('review-esas').value, plaintiff: document.getElementById('review-plaintiff').value, defendant: document.getElementById('review-defendant').value, claim_amount: document.getElementById('review-amount').value, summary: document.getElementById('review-summary').value, subject: document.getElementById('review-summary').value };
        const newCase = await createFileCase(newData, item.file);
        item.status = 'SUCCESS'; item.result = newCase; item.log = `Yeni Dosya Açıldı: ${newCase.registration_number}`;
        closeReviewModal(); saveQueueToStorage(); updateQueueItemUI(item); loadLawyers(); showToast('Yeni dosya oluşturuldu.', 'success');
    } catch (e) { showToast('Hata: ' + e.message, 'error'); btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle"></i> Onayla & Oluştur'; }
}

async function linkToExistingCase() {
    const regNum = document.getElementById('manual-case-id').value.trim();
    if (!regNum) return showToast('Dosya No girin', 'warning');
    const { data: cases } = await supabase.from('file_cases').select('id, registration_number').eq('registration_number', regNum);
    if (!cases || cases.length === 0) return showToast('Dosya bulunamadı.', 'error');
    await linkToSpecificCase(cases[0].id, cases[0].registration_number);
}

async function linkToSpecificCase(caseId, regNum) {
    const item = uploadQueue.find(i => i.id === currentReviewItemId);
    if (!item) return;
    try {
        await uploadDocument(caseId, item.file, item.analysisData);
        item.status = 'SUCCESS'; item.result = { id: caseId, registration_number: regNum }; item.log = `Mevcut Dosyaya Eklendi: ${regNum}`;
        closeReviewModal(); saveQueueToStorage(); updateQueueItemUI(item); showToast('Eklendi.', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

window.openReviewModal = openReviewModal; window.closeReviewModal = closeReviewModal; window.approveNewCase = approveNewCase; window.linkToExistingCase = linkToExistingCase; window.linkToSpecificCase = linkToSpecificCase; window.toggleUploadManager = toggleUploadManager; window.removeFromQueue = removeFromQueue;

// ... (Lawyers Loader SAME) ... //
async function loadLawyers() { /*...*/ const container = document.getElementById('lawyers-list'); try { const lawyers = await getLawyers(); if (!lawyers.length) return container.innerHTML = '<p style="padding:15px; text-align:center; color:#666">Avukat yok.</p>'; container.innerHTML = lawyers.map(l => `<div class="lawyer-item"><div><strong>${escapeHtml(l.name)}</strong><div style="font-size:0.8em; color:#666">${l.assigned_files_count || 0} Dosya</div></div><span class="badge ${l.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${l.status}</span></div>`).join(''); } catch (e) { container.innerHTML = 'Hata.'; } }
async function handleAddLawyer(e) { e.preventDefault(); try { await createLawyer(document.getElementById('new-lawyer-name').value, document.getElementById('new-lawyer-username').value, document.getElementById('new-lawyer-password').value); showToast('Avukat eklendi', 'success'); e.target.reset(); loadLawyers(); } catch (e) { showToast(e.message, 'error'); } }
