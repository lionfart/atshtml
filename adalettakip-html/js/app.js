// ==========================================
// Adalet Takip Sistemi - Main Application
// ==========================================

// Global state
let selectedFile = null;
let isProcessing = false;
let isAiUsed = false;

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
                handleFileSelection(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelection(e.target.files[0]);
            }
        });
    }

    // File intake form
    const intakeForm = document.getElementById('file-intake-form');
    if (intakeForm) {
        intakeForm.addEventListener('submit', handleFileIntakeSubmit);
    }

    // Add lawyer form
    const addLawyerForm = document.getElementById('add-lawyer-form');
    if (addLawyerForm) {
        addLawyerForm.addEventListener('submit', handleAddLawyer);
    }
}

// ==========================================
// File Selection & Processing
// ==========================================

async function handleFileSelection(file) {
    // Validate file
    if (file.size > APP_CONFIG.maxFileSize) {
        showToast('Dosya çok büyük. Maksimum 20MB.', 'error');
        return;
    }

    selectedFile = file;

    // Update UI
    document.getElementById('file-upload-area').querySelector('.file-upload-content').classList.add('hidden');
    document.getElementById('file-selected').classList.remove('hidden');
    document.getElementById('selected-file-name').textContent = file.name;

    // Process file for OCR/analysis
    await processFile(file);
}

function clearFileSelection() {
    selectedFile = null;
    document.getElementById('file-upload-area').querySelector('.file-upload-content').classList.remove('hidden');
    document.getElementById('file-selected').classList.add('hidden');
    document.getElementById('document-upload').value = '';
    document.getElementById('plaintiff').value = '';
    document.getElementById('subject').value = '';
    document.getElementById('ai-badge').classList.add('hidden');
    isAiUsed = false;
    lucide.createIcons();
}

async function processFile(file) {
    isProcessing = true;
    showProcessingIndicator(true);
    isAiUsed = false;

    try {
        let text = '';
        const isImage = file.type.startsWith('image/');
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');

        // Get API key for AI features
        let apiKey = '';
        try {
            const settings = await getSystemSettings();
            apiKey = settings.gemini_api_key || '';
        } catch (e) {
            console.log('Could not get settings, AI features disabled');
        }

        if (isText) {
            // Plain text file
            text = await readFileAsText(file);
        } else if (isPdf) {
            // Try to extract text from PDF
            try {
                text = await extractTextFromPDF(file);

                // If text is too short, it might be a scanned PDF
                if (text.length < 50 && apiKey) {
                    showToast('Taranmış PDF algılandı, OCR yapılıyor...', 'info');
                    const imageBlob = await convertPDFPageToImage(file);
                    const base64 = await readFileAsBase64(imageBlob);
                    text = await performOcrWithGemini(base64, 'image/jpeg', apiKey);
                }
            } catch (e) {
                console.error('PDF extraction failed:', e);
                if (apiKey) {
                    // Fallback to image conversion + OCR
                    const imageBlob = await convertPDFPageToImage(file);
                    const base64 = await readFileAsBase64(imageBlob);
                    text = await performOcrWithGemini(base64, 'image/jpeg', apiKey);
                }
            }
        } else if (isImage && apiKey) {
            // Image - use AI OCR
            const base64 = await readFileAsBase64(file);
            text = await performOcrWithGemini(base64, file.type, apiKey);
        }

        if (!text || text.length < 10) {
            showToast('Metin çıkarılamadı. Lütfen manuel doldurun.', 'warning');
            showProcessingIndicator(false);
            isProcessing = false;
            return;
        }

        console.log('Extracted text:', text.substring(0, 500));

        // Parse locally first
        let { plaintiff, subject } = parseTextLocally(text);

        // Try AI analysis if available
        if (apiKey) {
            try {
                showToast('Yapay Zeka analizi yapılıyor...', 'info');
                const aiResult = await analyzeWithGemini(text, apiKey);

                if (aiResult.plaintiff) plaintiff = aiResult.plaintiff;
                if (aiResult.subject) subject = aiResult.subject;

                isAiUsed = true;
                document.getElementById('ai-badge').classList.remove('hidden');
                showToast('Yapay Zeka ile analiz tamamlandı!', 'success');
            } catch (e) {
                console.error('AI analysis failed:', e);
                showToast('AI analizi başarısız, yerel analiz kullanıldı.', 'warning');
            }
        }

        // Update form fields
        if (plaintiff) document.getElementById('plaintiff').value = plaintiff;
        if (subject) document.getElementById('subject').value = subject;

        if (!plaintiff && !subject) {
            showToast('Veri çıkarılamadı. Lütfen manuel doldurun.', 'warning');
        } else if (!isAiUsed) {
            showToast('Analiz tamamlandı.', 'success');
        }

    } catch (error) {
        console.error('File processing error:', error);
        showToast('İşlem hatası: ' + error.message, 'error');
    } finally {
        showProcessingIndicator(false);
        isProcessing = false;
        lucide.createIcons();
    }
}

function showProcessingIndicator(show) {
    const indicator = document.getElementById('processing-indicator');
    if (indicator) {
        indicator.classList.toggle('hidden', !show);
    }
}

// ==========================================
// File Intake Form Submission
// ==========================================

async function handleFileIntakeSubmit(e) {
    e.preventDefault();

    const plaintiff = document.getElementById('plaintiff').value.trim();
    const subject = document.getElementById('subject').value.trim();

    if (!plaintiff || !subject) {
        showToast('Davacı ve konu alanları zorunludur.', 'error');
        return;
    }

    const submitBtn = document.getElementById('submit-file-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div><span>Kaydediliyor...</span>';

    try {
        const newFile = await createFileCase(plaintiff, subject, selectedFile);

        showToast('Dosya oluşturuldu ve atandı!', 'success');

        // Reset form
        document.getElementById('file-intake-form').reset();
        clearFileSelection();

        // Refresh lawyers list
        await loadLawyers();

    } catch (error) {
        console.error('File creation error:', error);
        showToast('Kayıt hatası: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="save"></i><span>Sisteme Kaydet</span>';
        lucide.createIcons();
    }
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
                    ${lawyer.status === 'ON_LEAVE' && lawyer.leave_return_date ? `
                        <div class="lawyer-return-date">
                            Otomatik Dönüş: ${formatDate(lawyer.leave_return_date)}
                        </div>
                    ` : ''}
                </div>
                <div class="lawyer-actions">
                    <label class="toggle-switch">
                        <input type="checkbox" 
                            ${lawyer.status === 'ACTIVE' ? 'checked' : ''} 
                            onchange="toggleLawyerStatus('${lawyer.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
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

        // Reset form
        document.getElementById('new-lawyer-name').value = '';
        document.getElementById('new-lawyer-username').value = '';
        document.getElementById('new-lawyer-password').value = '';

        // Refresh list
        await loadLawyers();

    } catch (error) {
        console.error('Failed to add lawyer:', error);
        showToast('Hata: ' + error.message, 'error');
    }
}

async function toggleLawyerStatus(lawyerId, isActive) {
    try {
        if (isActive) {
            await updateLawyerStatus(lawyerId, 'ACTIVE', null);
            showToast('Avukat aktif edildi.', 'success');
        } else {
            const returnDate = prompt(
                'Döneceği tarih (YYYY-MM-DD) [Boş bırakılabilir]:',
                new Date(Date.now() + 86400000).toISOString().split('T')[0]
            );
            await updateLawyerStatus(lawyerId, 'ON_LEAVE', returnDate || null);
            showToast('Avukat izinli olarak işaretlendi.', 'success');
        }

        await loadLawyers();

    } catch (error) {
        console.error('Failed to toggle lawyer status:', error);
        showToast('Durum güncellenemedi.', 'error');
        await loadLawyers(); // Refresh to reset toggle
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
