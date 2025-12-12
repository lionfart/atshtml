// ==========================================
// Adalet Takip Sistemi - Smart App Logic
// ==========================================

let uploadQueue = []; // { id, file, status, result, error, analysisData }
let isProcessingQueue = false;

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    await loadLawyers();
    setupEventListeners();
});

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

    // Add Lawyer Form
    const addLawyerForm = document.getElementById('add-lawyer-form');
    if (addLawyerForm) addLawyerForm.addEventListener('submit', handleAddLawyer);
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
            file: file,
            status: 'PENDING',
            progress: 0,
            log: 'Sıraya alındı...',
            analysisData: null
        };
        uploadQueue.unshift(item);
        processQueueItem(item);
    });
    updateQueueUI();
}

async function processQueueItem(item) {
    item.status = 'PROCESSING';
    item.log = 'OCR ve Akıllı Analiz yapılıyor...';
    item.progress = 10;
    updateQueueItemUI(item);

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
            showToast(`"${item.file.name}" mevcut dosyaya (${matchResult.case.registration_number}) eklendi.`, 'success');

        } else {
            // NO MATCH -> REQUIRE REVIEW
            item.status = 'REVIEW_REQUIRED';
            item.progress = 100; // Ready for user
            item.log = 'Yeni dosya tespiti. Onay bekleniyor.';
            showToast(`"${item.file.name}" için onay bekleniyor.`, 'info');
        }

    } catch (error) {
        console.error('Process Error:', error);
        item.status = 'ERROR';
        item.log = error.message;
        item.error = error;
    }
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
    } catch (e) { }

    // Extract Text based on type
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
        text = await readFileAsText(file); // txt, etc
    }

    if (!text || text.length < 5) throw new Error('Metin okunamadı.');

    // Analyze
    if (apiKey) {
        return await analyzeWithGemini(text, apiKey);
    } else {
        // Fallback local regex (simplified)
        return {
            plaintiff: 'Belirsiz',
            subject: 'AI Anahtarı Girilmedi',
            type: 'Evrak',
            viz_text: text.slice(0, 200)
        };
    }
}

// ==========================================
// UI Logic (Queue & Review)
// ==========================================

function updateQueueUI() {
    const list = document.getElementById('upload-queue-list');
    list.innerHTML = uploadQueue.map(item => getQueueItemHTML(item)).join('');
    updateQueueCount();
    lucide.createIcons();
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

    if (item.status === 'PROCESSING') { badgeClass = 'status-processing'; label = 'Analiz...'; }
    else if (item.status === 'SUCCESS') { badgeClass = 'status-success'; label = 'Tamamlandı'; }
    else if (item.status === 'ERROR') { badgeClass = 'status-error'; label = 'Hata'; }
    else if (item.status === 'REVIEW_REQUIRED') { badgeClass = 'status-warning'; label = 'Onay Bekliyor'; }

    return `
        <div class="upload-item" id="queue-item-${item.id}">
            <div class="upload-item-header">
                <div class="upload-filename" title="${item.file.name}">${escapeHtml(item.file.name)}</div>
                <span class="status-badge ${badgeClass}">${label}</span>
            </div>
            <div class="upload-details">${escapeHtml(item.log)}</div>
            
            ${item.status === 'PROCESSING' ? `<div class="mini-progress scanning"><div class="mini-progress-bar" style="width: ${item.progress}%"></div></div>` : ''}

            ${item.status === 'REVIEW_REQUIRED' ? `
                <div class="upload-actions">
                    <button class="btn btn-primary btn-sm w-full" onclick="openReviewModal('${item.id}')">
                        <i data-lucide="eye"></i> İncele & Onayla
                    </button>
                </div>
            ` : ''}
            
            ${item.status === 'SUCCESS' ? `
                <div class="upload-actions">
                    <a href="file-detail.html?id=${item.result.id}" class="btn btn-ghost btn-sm w-full">Dosyaya Git</a>
                </div>
            ` : ''}
        </div>
    `;
}

function updateQueueCount() {
    const count = uploadQueue.filter(i => i.status === 'PROCESSING' || i.status === 'PENDING' || i.status === 'REVIEW_REQUIRED').length;
    document.getElementById('queue-count').textContent = count;
}

function toggleUploadManager() {
    document.getElementById('upload-manager').classList.toggle('minimized');
}

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
        
        <div class="review-manual-link mt-4">
            <label>Ya da Mevcut Bir Dosyaya Bağla (Sistem No Girin)</label>
            <div class="flex gap-2">
                <input type="text" id="manual-case-id" placeholder="Örn: 2024/0005" class="form-control">
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
        // Gather edited data from inputs
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

        // Create
        const newCase = await createFileCase(newData, item.file);

        // Success
        item.status = 'SUCCESS';
        item.result = newCase;
        item.log = `Yeni Dosya Açıldı: ${newCase.registration_number}`;

        closeReviewModal();
        updateQueueItemUI(item);
        loadLawyers(); // Refresh UI
        showToast('Yeni dosya oluşturuldu ve ataması yapıldı.', 'success');

    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
        btn.disabled = false;
        btn.innerHTML = 'Onayla & Yeni Klasör Aç';
    }
}

async function linkToExistingCase() {
    const regNum = document.getElementById('manual-case-id').value.trim();
    if (!regNum) return showToast('Lütfen Dosya No girin (Örn: 2024/0001)', 'warning');

    const item = uploadQueue.find(i => i.id === currentReviewItemId);

    try {
        // Find ID from Reg Num
        const { data: cases } = await supabase.from('file_cases').select('id').eq('registration_number', regNum);

        if (!cases || cases.length === 0) throw new Error('Bu numarada dosya bulunamadı.');
        const caseId = cases[0].id;

        await uploadDocument(caseId, item.file, item.analysisData);

        item.status = 'SUCCESS';
        item.result = { id: caseId, registration_number: regNum };
        item.log = `Elle Eklendi: ${regNum}`;

        closeReviewModal();
        updateQueueItemUI(item);
        showToast('Dosya başarıyla eklendi.', 'success');

    } catch (e) {
        showToast(e.message, 'error');
    }
}

function closeReviewModal() {
    document.getElementById('review-modal').classList.remove('active');
    currentReviewItemId = null;
}

// ==========================================
// Initial Loader
// ==========================================
async function loadLawyers() {
    const container = document.getElementById('lawyers-list');
    try {
        const lawyers = await getLawyers();
        if (!lawyers.length) return container.innerHTML = '<p>Avukat yok.</p>';
        container.innerHTML = lawyers.map(l => `
            <div class="lawyer-item">
                <div>
                   <strong>${escapeHtml(l.name)}</strong>
                   <small>${l.assigned_files_count} Dosya</small>
                </div>
                <span class="badge ${l.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${l.status}</span>
            </div>
        `).join('');
    } catch (e) { container.innerHTML = 'Hata.'; }
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
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    const apiKey = document.getElementById('gemini-api-key').value.trim();
    try {
        await updateSystemSettings({ gemini_api_key: apiKey });
        showToast('Ayarlar kaydedildi.', 'success');
        closeSettingsModal();
    } catch (error) {
        showToast('Ayarlar kaydedilemedi.', 'error');
    }
}

// Global scope check
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;

// ==========================================
// Initial Loader
// ==========================================
async function handleAddLawyer(e) {
    e.preventDefault();
    try {
        await createLawyer(
            document.getElementById('new-lawyer-name').value,
            document.getElementById('new-lawyer-username').value,
            document.getElementById('new-lawyer-password').value
        );
        showToast('Eklendi', 'success');
        e.target.reset();
        loadLawyers();
    } catch (e) { showToast(e.message, 'error'); }
}
