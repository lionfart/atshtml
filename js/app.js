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
    if (file.type === 'application/pdf') {
        // PDF Logic (dummy for now unless pdf.js loaded)
    } else if (file.type.startsWith('image/') && apiKey) {
        text = await performOcrWithGemini(await readFileAsBase64(file), file.type, apiKey);
    } else { text = await readFileAsText(file); }

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

    let suggestionsHtml = '';
    if (candidates.length > 0) {
        suggestionsHtml = `
            <div style="margin-top:10px; margin-bottom:15px; background:rgba(6, 182, 212, 0.1); border:1px solid rgba(6, 182, 212, 0.3); border-radius:8px; padding:10px;">
                <h4 style="font-size:0.8rem; color:var(--accent-secondary); margin-bottom:8px; display:flex; align-items:center; gap:5px;"><i data-lucide="sparkles"></i> Benzer Dosyalar</h4>
                ${candidates.map(c => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; margin-bottom:5px;">
                        <div><div style="font-weight:600; font-size:0.9rem;">${c.registration_number}</div><div style="font-size:0.75rem; opacity:0.8;">${c.court_name} | ${c.court_case_number}</div></div>
                        <button onclick="linkToSpecificCase('${c.id}', '${c.registration_number}')" class="btn btn-sm btn-secondary">Bağla</button>
                    </div>`).join('')}
            </div>`;
    }

    const content = `
        <div class="review-grid">
            <div class="review-section">
                <h3><i data-lucide="file-text"></i> Analiz</h3>
                <div class="review-field"><label>Tip</label><input type="text" id="review-type" value="${data.type || ''}" class="form-control"></div>
                <div class="review-field"><label>Mahkeme</label><input type="text" id="review-court" value="${data.court_name || ''}" class="form-control"></div>
                <div class="review-field"><label>Esas No</label><input type="text" id="review-esas" value="${data.court_case_number || ''}" class="form-control"></div>
                <div class="review-field"><label>Karar No</label><input type="text" id="review-decision" value="${data.court_decision_number || ''}" class="form-control" placeholder="Varsa"></div>
            </div>
            <div class="review-section">
                <h3><i data-lucide="users"></i> Taraflar</h3>
                <div class="review-field"><label>Davacı</label><input type="text" id="review-plaintiff" value="${data.plaintiff || ''}" class="form-control"></div>
                <div class="review-field"><label>Davalı</label><input type="text" id="review-defendant" value="${data.defendant || ''}" class="form-control"></div>
                <div class="review-field"><label>Değer</label><input type="text" id="review-amount" value="${data.claim_amount || ''}" class="form-control"></div>
            </div>
        </div>
        <div class="review-summary"><label>Özet</label><textarea id="review-summary" class="form-control" rows="2">${data.summary || data.subject || ''}</textarea></div>
        <div class="review-manual-link mt-4" style="border-top:1px solid rgba(255,255,255,0.1); padding-top:15px;">
            ${suggestionsHtml}
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
    if (!item) return; btn.disabled = true; btn.innerHTML = 'Oluşturuluyor...';
    try {
        const newData = {
            type: document.getElementById('review-type').value,
            court_name: document.getElementById('review-court').value,
            court_case_number: document.getElementById('review-esas').value,
            court_decision_number: document.getElementById('review-decision').value, // NEW
            plaintiff: document.getElementById('review-plaintiff').value,
            defendant: document.getElementById('review-defendant').value,
            claim_amount: document.getElementById('review-amount').value,
            summary: document.getElementById('review-summary').value,
            subject: document.getElementById('review-summary').value
        };
        const newCase = await createFileCase(newData, item.file);
        item.status = 'SUCCESS'; item.result = newCase; item.log = `Yeni: ${newCase.registration_number}`;
        closeReviewModal(); saveQueueToStorage(); updateQueueItemUI(item); loadLawyers(); showToast('Yeni dosya oluşturuldu.', 'success');
    } catch (e) { showToast('Hata: ' + e.message, 'error'); btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle"></i> Onayla'; }
}
async function linkToExistingCase() { const reg = document.getElementById('manual-case-id').value.trim(); if (!reg) return showToast('Dosya No girin', 'warning'); const { data: c } = await supabase.from('file_cases').select('id,registration_number').eq('registration_number', reg); if (!c || !c.length) return showToast('Bulunamadı', 'error'); await linkToSpecificCase(c[0].id, c[0].registration_number); }
async function linkToSpecificCase(cid, cnum) { const item = uploadQueue.find(i => i.id === currentReviewItemId); if (!item) return; try { await uploadDocument(cid, item.file, item.analysisData); item.status = 'SUCCESS'; item.result = { id: cid, registration_number: cnum }; item.log = `Eklendi: ${cnum}`; closeReviewModal(); saveQueueToStorage(); updateQueueItemUI(item); showToast('Eklendi', 'success'); } catch (e) { showToast(e.message, 'error'); } }

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

async function loadSettingsData() { try { const s = await getSystemSettings(); document.getElementById('gemini-api-key').value = s.gemini_api_key || ''; document.getElementById('burst-limit').value = s.catchup_burst_limit || 2; const p = localStorage.getItem('preferredGeminiModel'); if (p) document.getElementById('gemini-model-select').value = p; } catch (e) { } }
async function saveSettings() { try { await updateSystemSettings({ gemini_api_key: document.getElementById('gemini-api-key').value.trim(), catchup_burst_limit: parseInt(document.getElementById('burst-limit').value) }); localStorage.setItem('preferredGeminiModel', document.getElementById('gemini-model-select').value); showToast('Kaydedildi', 'success'); closeSettingsModal(); } catch (e) { showToast('Hata', 'error'); } }
window.openSettingsModal = openSettingsModal; window.closeSettingsModal = closeSettingsModal; window.saveSettings = saveSettings; window.openReviewModal = openReviewModal; window.closeReviewModal = closeReviewModal; window.approveNewCase = approveNewCase; window.linkToExistingCase = linkToExistingCase; window.linkToSpecificCase = linkToSpecificCase; window.toggleUploadManager = toggleUploadManager; window.removeFromQueue = removeFromQueue;
