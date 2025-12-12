// ==========================================
// Adalet Takip Sistemi - Smart App Logic v2
// ==========================================

let uploadQueue = []; // { id, file, status, result, error, analysisData, timestamp }
let isProcessingQueue = false;

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    await loadLawyers();
    setupEventListeners();

    // Restore Queue & Settings
    loadQueueFromStorage();
    populateModelSelect();

    // Check for "open settings" flag?
    // Not needed, user clicks button.
});

// ==========================================
// Setup & Events
// ==========================================
function setupEventListeners() {
    const uploadArea = document.getElementById('file-upload-area');
    const fileInput = document.getElementById('document-upload');

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragging'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragging');
            if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleFiles(Array.from(e.target.files));
                fileInput.value = '';
            }
        });
    }

    const addLawyerForm = document.getElementById('add-lawyer-form');
    if (addLawyerForm) addLawyerForm.addEventListener('submit', handleAddLawyer);
}

function populatedData() {
    // Populate model select
    const select = document.getElementById('gemini-model-select');
    if (select) {
        APP_CONFIG.geminiModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.text = model + (model.includes('exp') ? ' (Experimental)' : '');
            select.appendChild(option);
        });

        // Load saved preference
        const savedModel = localStorage.getItem('preferredGeminiModel');
        if (savedModel) select.value = savedModel;
    }
}
// Call immediately if DOM might be ready or inside DOMContentLoaded
function populateModelSelect() {
    populatedData();
}


// ==========================================
// Queue Management (Persistent)
// ==========================================
function loadQueueFromStorage() {
    const saved = localStorage.getItem('adalet_upload_queue');
    if (saved) {
        try {
            // Restore but reset 'PROCESSING' to 'PENDING' or 'ERROR' because simple reload kills js memory
            const parsed = JSON.parse(saved);
            uploadQueue = parsed.map(item => ({
                ...item,
                status: item.status === 'PROCESSING' ? 'ERROR' : item.status,
                log: item.status === 'PROCESSING' ? 'Sayfa yenilendiği için işlem kesildi.' : item.log,
                // File object cannot be restored fully (browser security), so we mark as "File Lost" if waiting
                fileLost: true
            }));

            // Clean up: If a file was waiting to be processed but page reloaded, we lost the file blob.
            // We can only keep history.
            uploadQueue = uploadQueue.filter(i => i.status === 'SUCCESS' || i.status === 'MATCHED_AUTO' || i.status === 'REVIEW_REQUIRED'); // Only keep actionable or done

            updateQueueUI();

            // If there are items, show the manager
            if (uploadQueue.length > 0) {
                document.getElementById('upload-manager').classList.remove('hidden');
            }
        } catch (e) { console.error('Queue restore error', e); }
    }
}

function saveQueueToStorage() {
    // We cannot save 'file' objects (Blobs) to localStorage.
    // So we save the metadata.
    const toSave = uploadQueue.map(item => {
        const { file, ...rest } = item;
        return {
            ...rest,
            fileName: file ? file.name : item.fileName
        };
    });
    localStorage.setItem('adalet_upload_queue', JSON.stringify(toSave));
}

// ==========================================
// Core File Handling Logic
// ==========================================

function handleFiles(files) {
    if (!files.length) return;
    const manager = document.getElementById('upload-manager');
    manager.classList.remove('hidden');
    manager.classList.remove('minimized');

    files.forEach(file => {
        if (file.size > APP_CONFIG.maxFileSize) {
            showToast(`${file.name} çok büyük.`, 'error');
            return;
        }
        const item = {
            id: generateUUID(),
            file: file, // Blob (memory only)
            fileName: file.name,
            status: 'PENDING',
            progress: 0,
            log: 'Sıraya alındı...',
            analysisData: null,
            timestamp: Date.now()
        };
        uploadQueue.unshift(item);
        processQueueItem(item); // Start async
    });
    updateQueueUI();
}

async function processQueueItem(item) {
    if (!item.file) {
        item.status = 'ERROR';
        item.log = 'Dosya verisi kayıp (Sayfa yenilendi).';
        saveQueueToStorage();
        updateQueueUI();
        return;
    }

    item.status = 'PROCESSING';
    item.log = 'OCR ve Akıllı Analiz yapılıyor...';
    item.progress = 10;
    updateQueueItemUI(item);
    // DO NOT save 'PROCESSING' state to storage to avoid sticking on load. 
    // Or save it but handle restore carefully.

    try {
        // 1. Analyze File
        const analysis = await analyzeFileContent(item.file);
        item.analysisData = analysis;
        item.progress = 50;
        item.log = 'Veritabanında eşleşme aranıyor...';
        updateQueueItemUI(item);

        // 2. Smart Match Check
        const matchResult = await findMatchingCase(analysis);

        if (matchResult) {
            // MATCH FOUND -> AUTO UPLOAD
            item.status = 'MATCHED_AUTO';
            item.log = `Eşleşti: ${matchResult.case.registration_number} (${matchResult.matchType === 'ESAS_NO' ? 'Esas No' : 'Taraf'})`;
            item.progress = 80;
            updateQueueItemUI(item);

            await uploadDocument(matchResult.case.id, item.file, analysis);

            item.status = 'SUCCESS';
            item.progress = 100;
            item.log = `Dosyaya Eklendi: ${matchResult.case.registration_number}`;
            item.result = matchResult.case;
            showToast(`"${item.fileName}" mevcut dosyaya (${matchResult.case.registration_number}) eklendi.`, 'success');

        } else {
            // NO MATCH -> REQUIRE REVIEW
            item.status = 'REVIEW_REQUIRED';
            item.progress = 100; // Ready for user
            item.log = 'Yeni dosya tespiti. Onay bekleniyor.';
            showToast(`"${item.fileName}" için onay bekleniyor.`, 'info');
        }

    } catch (error) {
        console.error('Process Error:', error);
        item.status = 'ERROR';
        item.log = error.message;
        item.error = error;
    }

    saveQueueToStorage();
    updateQueueItemUI(item);
    updateQueueCount();
}

// ==========================================
// AI & OCR Helpers
// ==========================================

async function analyzeFileContent(file) {
    let text = '';
    let apiKey = '';

    try {
        const settings = await getSystemSettings();
        apiKey = settings.gemini_api_key;

        // Inject user preference into CONFIG for this session
        const userModel = document.getElementById('gemini-model-select')?.value || localStorage.getItem('preferredGeminiModel');
        if (userModel && APP_CONFIG.geminiModels.includes(userModel)) {
            // Rotate array to put preference first
            const idx = APP_CONFIG.geminiModels.indexOf(userModel);
            if (idx > -1) {
                const preferred = APP_CONFIG.geminiModels.splice(idx, 1)[0];
                APP_CONFIG.geminiModels.unshift(preferred);
            }
        }

    } catch (e) { }

    // Extract Text
    if (file.type === 'application/pdf') {
        try {
            text = await extractTextFromPDF(file);
            if (text.length < 50 && apiKey) {
                const img = await convertPDFPageToImage(file);
                text = await performOcrWithGemini(await readFileAsBase64(img), 'image/jpeg', apiKey);
            }
        } catch (e) { console.warn('PDF Error', e); }
    } else if (file.type.startsWith('image/') && apiKey) {
        text = await performOcrWithGemini(await readFileAsBase64(file), file.type, apiKey);
    } else {
        text = await readFileAsText(file); // txt
    }

    if (!text || text.length < 5) throw new Error('Metin okunamadı.');

    if (apiKey) {
        return await analyzeWithGemini(text, apiKey);
    } else {
        return {
            plaintiff: 'Belirsiz',
            subject: 'AI Anahtarı Girilmedi',
            type: 'Evrak',
            viz_text: text.slice(0, 200)
        };
    }
}

// ==========================================
// UI Logic (Queue as Grid)
// ==========================================

function updateQueueUI() {
    const list = document.getElementById('upload-queue-list');
    if (!list) return;

    if (uploadQueue.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">İşlem geçmişi temiz.</div>';
    } else {
        list.innerHTML = uploadQueue.map(item => getQueueItemHTML(item)).join('');
    }
    updateQueueCount();
    lucide.createIcons();

    // Save state
    saveQueueToStorage();
}

function updateQueueItemUI(item) {
    const el = document.getElementById(`queue-item-${item.id}`);
    if (el) {
        el.outerHTML = getQueueItemHTML(item);
        lucide.createIcons();
    } else updateQueueUI();
}

function getQueueItemHTML(item) {
    let badgeClass = 'status-pending';
    let label = 'Bekliyor';
    let icon = 'loader';

    if (item.status === 'PROCESSING') { badgeClass = 'status-processing'; label = 'İşleniyor...'; icon = 'loader'; }
    else if (item.status === 'SUCCESS') { badgeClass = 'status-success'; label = 'Tamamlandı'; icon = 'check'; }
    else if (item.status === 'MATCHED_AUTO') { badgeClass = 'status-success'; label = 'Otomatik Eklendi'; icon = 'check-circle'; }
    else if (item.status === 'ERROR') { badgeClass = 'status-error'; label = 'Hata'; icon = 'alert-circle'; }
    else if (item.status === 'REVIEW_REQUIRED') { badgeClass = 'status-warning'; label = 'Onay Bekliyor'; icon = 'eye'; }

    // Grid Layout Style
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

                ${item.status === 'REVIEW_REQUIRED' ? `
                    <div class="upload-actions" style="margin-top:10px; display:grid; grid-template-columns:1fr; gap:5px;">
                        <button class="btn btn-primary btn-sm w-full" onclick="openReviewModal('${item.id}')">
                            <i data-lucide="eye"></i> İncele & Onayla
                        </button>
                    </div>
                ` : ''}
                
                ${(item.status === 'SUCCESS' || item.status === 'MATCHED_AUTO') && item.result ? `
                    <div class="upload-actions" style="margin-top:5px;">
                        <a href="file-detail.html?id=${item.result.id}" class="btn btn-ghost btn-sm w-full" style="text-align:left; padding-left:0;">
                           <i data-lucide="arrow-right"></i> Dosyaya Git (${item.result.registration_number})
                        </a>
                    </div>
                ` : ''}
            </div>
            <button onclick="removeFromQueue('${item.id}')" class="icon-btn" style="width:24px; height:24px;" title="Kaldır"><i data-lucide="x" style="width:14px;"></i></button>
        </div>
    `;
}

function removeFromQueue(id) {
    uploadQueue = uploadQueue.filter(i => i.id !== id);
    saveQueueToStorage();
    updateQueueUI();
}

function updateQueueCount() {
    const count = uploadQueue.filter(i => i.status === 'PROCESSING' || i.status === 'REVIEW_REQUIRED').length;
    const el = document.getElementById('queue-count');
    if (el) el.textContent = count;
}

function toggleUploadManager() {
    document.getElementById('upload-manager').classList.toggle('minimized');
}

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
        const settings = await getSystemSettings();
        document.getElementById('gemini-api-key').value = settings.gemini_api_key || '';
        document.getElementById('burst-limit').value = settings.catchup_burst_limit || 2;

        // Also load preferred model from local storage if not in settings yet (or separate)
        const pref = localStorage.getItem('preferredGeminiModel');
        if (pref) document.getElementById('gemini-model-select').value = pref;

    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    const apiKey = document.getElementById('gemini-api-key').value.trim();
    const burst = parseInt(document.getElementById('burst-limit').value) || 2;
    const model = document.getElementById('gemini-model-select').value;

    try {
        await updateSystemSettings({ gemini_api_key: apiKey, catchup_burst_limit: burst });

        // Save model preference locally
        localStorage.setItem('preferredGeminiModel', model);

        showToast('Ayarlar kaydedildi.', 'success');
        closeSettingsModal();
    } catch (error) {
        showToast('Ayarlar kaydedilemedi.', 'error');
    }
}

window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;

// ==========================================
// Review Modal Logic
// ==========================================

let currentReviewItemId = null;

function openReviewModal(itemId) {
    const item = uploadQueue.find(i => i.id === itemId);
    if (!item || !item.analysisData) return;

    currentReviewItemId = itemId;
    const data = item.analysisData;

    // Fill Modal Data
    const content = `
        <div class="review-grid">
            <div class="review-section">
                <h3><i data-lucide="file-text"></i> Analiz Sonuçları</h3>
                <div class="review-field">
                    <label>Evrak Türü</label>
                    <input type="text" id="review-type" value="${data.type || ''}" class="form-control">
                </div>
                <div class="review-field">
                    <label>Mahkeme</label>
                    <input type="text" id="review-court" value="${data.court_name || ''}" class="form-control">
                </div>
                <div class="review-field">
                    <label>Esas No</label>
                    <input type="text" id="review-esas" value="${data.court_case_number || ''}" class="form-control">
                </div>
            </div>
            <div class="review-section">
                <h3><i data-lucide="users"></i> Taraflar</h3>
                <div class="review-field">
                    <label>Davacı</label>
                    <input type="text" id="review-plaintiff" value="${data.plaintiff || ''}" class="form-control">
                </div>
                <div class="review-field">
                    <label>Davalı</label>
                    <input type="text" id="review-defendant" value="${data.defendant || ''}" class="form-control">
                </div>
                 <div class="review-field">
                    <label>Dava Değeri</label>
                    <input type="text" id="review-amount" value="${data.claim_amount || ''}" class="form-control">
                </div>
            </div>
        </div>
        <div class="review-summary">
            <label>Özet</label>
            <textarea id="review-summary" class="form-control" rows="2">${data.summary || data.subject || ''}</textarea>
        </div>
        <div class="review-preview">
            <label>Metin Önizlemesi</label>
            <p>${data.viz_text || 'Metin yok'}</p>
        </div>
        
        <div class="review-manual-link mt-4" style="margin-top:20px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.1)">
            <label style="color:var(--accent-warning)">Alternatif: Mevcut Bir Dosyaya Bağla</label>
            <div class="flex gap-2" style="display:flex; gap:10px; margin-top:5px;">
                <input type="text" id="manual-case-id" placeholder="Dosya No (2024/0001)" class="form-control">
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

    btn.disabled = true;
    btn.innerHTML = 'Oluşturuluyor...';

    try {
        const newData = {
            type: document.getElementById('review-type').value,
            court_name: document.getElementById('review-court').value,
            court_case_number: document.getElementById('review-esas').value,
            plaintiff: document.getElementById('review-plaintiff').value,
            defendant: document.getElementById('review-defendant').value,
            claim_amount: document.getElementById('review-amount').value,
            summary: document.getElementById('review-summary').value,
            subject: document.getElementById('review-summary').value
        };

        const newCase = await createFileCase(newData, item.file);

        item.status = 'SUCCESS';
        item.result = newCase;
        item.log = `Yeni Dosya Açıldı: ${newCase.registration_number}`;

        closeReviewModal();
        saveQueueToStorage();
        updateQueueItemUI(item);
        loadLawyers();
        showToast('Yeni dosya oluşturuldu.', 'success');

    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="check-circle"></i> Onayla & Oluştur';
    }
}

async function linkToExistingCase() {
    const regNum = document.getElementById('manual-case-id').value.trim();
    if (!regNum) return showToast('Dosya No girin', 'warning');

    const item = uploadQueue.find(i => i.id === currentReviewItemId);
    if (!item) return;

    try {
        const { data: cases } = await supabase.from('file_cases').select('id, registration_number').eq('registration_number', regNum);

        if (!cases || cases.length === 0) throw new Error('Dosya bulunamadı.');
        const caseId = cases[0].id; // The logic was wrong here before, now corrected

        await uploadDocument(caseId, item.file, item.analysisData);

        item.status = 'SUCCESS';
        item.result = { id: caseId, registration_number: regNum };
        item.log = `Elle Eklendi: ${regNum}`;

        closeReviewModal();
        saveQueueToStorage();
        updateQueueItemUI(item);
        showToast('Eklendi.', 'success');

    } catch (e) {
        showToast(e.message, 'error');
    }
}

function closeReviewModal() {
    document.getElementById('review-modal').classList.remove('active');
    currentReviewItemId = null;
}

// Global Exports
window.openReviewModal = openReviewModal;
window.closeReviewModal = closeReviewModal;
window.approveNewCase = approveNewCase;
window.linkToExistingCase = linkToExistingCase;
window.toggleUploadManager = toggleUploadManager;
window.removeFromQueue = removeFromQueue;

// ==========================================
// Initial Loader
// ==========================================
async function loadLawyers() {
    const container = document.getElementById('lawyers-list');
    try {
        const lawyers = await getLawyers();
        if (!lawyers.length) return container.innerHTML = '<p style="padding:15px; text-align:center; color:#666">Avukat yok.</p>';
        container.innerHTML = lawyers.map(l => `
            <div class="lawyer-item">
                <div>
                   <strong>${escapeHtml(l.name)}</strong>
                   <div style="font-size:0.8em; color:#666">${l.assigned_files_count || 0} Dosya</div>
                </div>
                <span class="badge ${l.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${l.status}</span>
            </div>
        `).join('');
    } catch (e) { container.innerHTML = 'Hata.'; }
}
async function handleAddLawyer(e) {
    e.preventDefault();
    try {
        await createLawyer(
            document.getElementById('new-lawyer-name').value,
            document.getElementById('new-lawyer-username').value,
            document.getElementById('new-lawyer-password').value
        );
        showToast('Avukat eklendi', 'success');
        e.target.reset();
        loadLawyers();
    } catch (e) { showToast(e.message, 'error'); }
}
