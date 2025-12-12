// ==========================================
// Adalet Takip Sistemi - Main Application
// ==========================================

// Global state
let uploadQueue = []; // { id, file, status, result, error }
let isProcessingQueue = false;

// ==========================================
// Initialization
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Supabase
    const supabaseReady = initSupabase();

    if (supabaseReady) {
        // Load initial data
        await loadLawyers();
    }

    // Setup event listeners
    setupEventListeners();
});

// ==========================================
// Event Listeners Setup
// ==========================================

function setupEventListeners() {
    // File upload area
    const uploadArea = document.getElementById('file-upload-area');
    const fileInput = document.getElementById('document-upload');

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragging');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragging');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragging');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFiles(Array.from(files));
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFiles(Array.from(e.target.files));
                // Reset input to allow selecting same files again if needed
                fileInput.value = '';
            }
        });
    }

    // Add lawyer form
    const addLawyerForm = document.getElementById('add-lawyer-form');
    if (addLawyerForm) {
        addLawyerForm.addEventListener('submit', handleAddLawyer);
    }
}

// ==========================================
// Queue & File Handling
// ==========================================

function handleFiles(files) {
    if (files.length === 0) return;

    const manager = document.getElementById('upload-manager');
    manager.classList.remove('hidden');
    manager.classList.remove('minimized');

    files.forEach(file => {
        // Validate
        if (file.size > APP_CONFIG.maxFileSize) {
            showToast(`${file.name} çok büyük (Max 20MB).`, 'error');
            return;
        }

        const queueItem = {
            id: generateUUID(),
            file: file,
            status: 'PENDING', // PENDING, PROCESSING, SUCCESS, ERROR
            progress: 0,
            log: 'Kuyruğa alındı...',
            created_at: new Date()
        };

        uploadQueue.unshift(queueItem);
        // Start processing immediately (non-blocking)
        processQueueItem(queueItem);
    });

    updateQueueUI();
}

async function processQueueItem(item) {
    item.status = 'PROCESSING';
    item.log = 'OCR ve AI Analizi yapılıyor...';
    item.progress = 20;
    updateQueueItemUI(item);

    try {
        // 1. Process File (OCR & AI)
        const analysisResult = await analyzeFileContent(item.file);

        item.progress = 60;
        item.log = 'Sisteme kaydediliyor ve avukat atanıyor...';
        updateQueueItemUI(item);

        // 2. Auto-Create Case
        const plaintiff = analysisResult.plaintiff || 'Bilinmeyen Davacı';
        const subject = analysisResult.subject || 'Otomatik Dosya Girişi';

        const newFileCase = await createFileCase(plaintiff, subject, item.file);

        // 3. Success
        item.status = 'SUCCESS';
        item.progress = 100;
        item.log = `Dosya No: ${newFileCase.registration_number}`;
        item.result = newFileCase;

        // Refresh lawyers list to show updated counts
        loadLawyers();

        showToast(`${item.file.name} başarıyla işlendi!`, 'success');

    } catch (error) {
        console.error('Queue item error:', error);
        item.status = 'ERROR';
        item.log = error.message;
        item.error = error;
        showToast(`${item.file.name} işlenemedi: ${error.message}`, 'error');
    }

    updateQueueItemUI(item);
    updateQueueCount();
}

async function analyzeFileContent(file) {
    let text = '';
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt'); // Corrected txt check
    const isDocx = file.name.toLowerCase().endsWith('.docx'); // Basic check

    // Get API key
    let apiKey = '';
    try {
        const settings = await getSystemSettings();
        apiKey = settings.gemini_api_key || '';
    } catch (e) { console.log('Settings unavailable'); }

    // Text Extraction
    if (isText) {
        text = await readFileAsText(file);
    }
    else if (isPdf) {
        try {
            text = await extractTextFromPDF(file);
            // Fallback for scanned PDF
            if (text.length < 50 && apiKey) {
                const imageBlob = await convertPDFPageToImage(file);
                const base64 = await readFileAsBase64(imageBlob);
                text = await performOcrWithGemini(base64, 'image/jpeg', apiKey);
            }
        } catch (e) {
            if (apiKey) {
                const imageBlob = await convertPDFPageToImage(file);
                const base64 = await readFileAsBase64(imageBlob);
                text = await performOcrWithGemini(base64, 'image/jpeg', apiKey);
            }
        }
    }
    else if (isImage && apiKey) {
        const base64 = await readFileAsBase64(file);
        text = await performOcrWithGemini(base64, file.type, apiKey);
    }

    if (!text || text.length < 10) {
        return { plaintiff: '', subject: '' };
    }

    // AI Analysis
    if (apiKey) {
        try {
            return await analyzeWithGemini(text, apiKey);
        } catch (e) {
            console.warn('AI analysis failed, falling back to regex', e);
        }
    }

    // Fallback Regex Analysis
    return parseTextLocally(text);
}


// ==========================================
// Queue UI Management
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
    } else {
        updateQueueUI(); // Full refresh if not found
    }
}

function getQueueItemHTML(item) {
    let statusClass = 'status-pending';
    let statusIcon = 'clock';
    let statusText = 'Bekliyor';

    if (item.status === 'PROCESSING') {
        statusClass = 'status-processing';
        statusIcon = 'loader-2'; // spinner
        statusText = 'İşleniyor';
    } else if (item.status === 'SUCCESS') {
        statusClass = 'status-success';
        statusIcon = 'check-circle';
        statusText = 'Tamamlandı';
    } else if (item.status === 'ERROR') {
        statusClass = 'status-error';
        statusIcon = 'alert-triangle';
        statusText = 'Hata';
    }

    return `
        <div class="upload-item" id="queue-item-${item.id}">
            <div class="upload-item-header">
                <div class="upload-filename" title="${item.file.name}">${item.file.name}</div>
                <div class="upload-status">
                    <span class="status-badge ${statusClass}">
                        ${item.status === 'PROCESSING' ? '<i data-lucide="loader-2" class="animate-spin" style="width:10px;height:10px;display:inline;"></i>' : ''}
                        ${statusText}
                    </span>
                </div>
            </div>
            
            <div class="upload-details">
                ${item.log}
            </div>

            ${item.status === 'PROCESSING' ? `
                <div class="mini-progress ${item.log.includes('OCR') ? 'scanning' : ''}">
                    <div class="mini-progress-bar" style="width: ${item.progress}%"></div>
                </div>
            ` : ''}

            ${item.status === 'SUCCESS' && item.result ? `
                <div class="upload-actions">
                    <a href="file-detail.html?id=${item.result.id}" class="btn btn-primary btn-sm" style="width:100%">
                        <i data-lucide="eye" style="width:14px"></i> İncele
                    </a>
                </div>
            ` : ''}
        </div>
    `;
}

function updateQueueCount() {
    const count = uploadQueue.filter(i => i.status === 'PROCESSING' || i.status === 'PENDING').length;
    document.getElementById('queue-count').textContent = count > 0 ? `${count} İşlem` : 'Kuyruk';
}

function toggleUploadManager() {
    const manager = document.getElementById('upload-manager');
    manager.classList.toggle('minimized');

    const icon = document.getElementById('upload-toggle-icon');
    if (manager.classList.contains('minimized')) {
        icon.setAttribute('data-lucide', 'chevron-up');
    } else {
        icon.setAttribute('data-lucide', 'chevron-down');
    }
    lucide.createIcons();
}

// ==========================================
// Lawyers Management
// ==========================================

async function loadLawyers() {
    const container = document.getElementById('lawyers-list');
    if (!container) return;

    try {
        const lawyers = await getLawyers();

        if (lawyers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="users"></i>
                    <p>Henüz avukat eklenmedi.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        container.innerHTML = lawyers.map(lawyer => `
            <div class="lawyer-item" data-lawyer-id="${lawyer.id}">
                <div class="lawyer-info">
                    <a href="lawyer.html?id=${lawyer.id}" class="lawyer-name">${escapeHtml(lawyer.name)}</a>
                    <div class="lawyer-stats">
                        Atanan: ${lawyer.assigned_files_count || 0} | Telafi Borcu: ${lawyer.missed_assignments_count || 0}
                    </div>
                </div>
                <div class="lawyer-actions">
                    <span class="badge ${lawyer.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">
                        ${lawyer.status === 'ACTIVE' ? 'Aktif' : 'İzinli'}
                    </span>
                </div>
            </div>
        `).join('');

        lucide.createIcons();

    } catch (error) {
        console.error('Failed to load lawyers:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="alert-circle"></i>
                <p>Avukatlar yüklenemedi.</p>
            </div>
        `;
        lucide.createIcons();
    }
}

async function handleAddLawyer(e) {
    e.preventDefault();

    const name = document.getElementById('new-lawyer-name').value.trim();
    const username = document.getElementById('new-lawyer-username').value.trim();
    const password = document.getElementById('new-lawyer-password').value;

    if (!name || !username || !password) {
        showToast('Tüm alanları doldurun.', 'error');
        return;
    }

    try {
        await createLawyer(name, username, password);
        showToast('Avukat eklendi!', 'success');
        document.getElementById('add-lawyer-form').reset();
        await loadLawyers();
    } catch (error) {
        console.error('Failed to add lawyer:', error);
        showToast('Hata: ' + error.message, 'error');
    }
}

// ==========================================
// Settings Modal
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
        document.getElementById('burst-limit').value = settings.catchup_burst_limit || APP_CONFIG.defaultBurstLimit;
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    const apiKey = document.getElementById('gemini-api-key').value.trim();
    const burstLimit = parseInt(document.getElementById('burst-limit').value) || APP_CONFIG.defaultBurstLimit;

    const saveBtn = document.getElementById('save-settings-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="spinner"></div><span>Kaydediliyor...</span>';

    try {
        await updateSystemSettings({
            gemini_api_key: apiKey,
            catchup_burst_limit: burstLimit
        });

        showToast('Ayarlar kaydedildi.', 'success');
        closeSettingsModal();

    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('Ayarlar kaydedilemedi.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>Kaydet</span>';
    }
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSettingsModal();
    }
});
