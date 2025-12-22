// ==========================================
// File Detail Page - Adalet Takip Sistemi
// ==========================================

let currentFile = null;
let fileId = null;

// ==========================================
// Initialization
// ==========================================

const initPage = async () => {
    console.log('[FileDetail] Sayfa başlatılıyor...');

    // Get file ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    fileId = urlParams.get('id');

    if (!fileId) {
        // Fallback: Check session storage (handle clean URL redirects dropping params)
        fileId = sessionStorage.getItem('currentFileId');
        if (fileId) {
            console.log('Recovered File ID from session:', fileId);
            // Optional: Restore URL visually
            // window.history.replaceState(null, '', `file-detail.html?id=${fileId}`);
        }
    }

    if (!fileId) {
        showToast('Dosya ID bulunamadı.', 'error');
        // window.location.href = 'files.html';
        console.error('Missing File ID in URL:', window.location.href);
        return;
    }

    console.log('[FileDetail] File ID:', fileId);

    // Initialize Supabase
    const supabaseReady = initSupabase();
    console.log('[FileDetail] Supabase hazır:', supabaseReady);

    if (supabaseReady) {
        // Load data
        loadFileDetails();
        loadNotes();
        setupDocumentUpload();
    } else {
        // Retry
        setTimeout(() => {
            console.log('[FileDetail] Supabase tekrar deneniyor...');
            if (initSupabase()) {
                loadFileDetails();
                loadNotes();
                setupDocumentUpload();
            } else {
                showToast('Veritabanına bağlanılamadı.', 'error');
            }
        }, 1000);
    }

    // Setup form handlers
    setupFormHandlers();
};

// Robust initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
} else {
    initPage();
}

// Window load fallback
window.addEventListener('load', () => {
    // Check if data loaded
    const fileNumber = document.getElementById('file-number');
    if (fileNumber && fileNumber.textContent === 'Yükleniyor...') {
        console.log('[FileDetail] Window load fallback triggered');
        if (initSupabase() && fileId) {
            loadFileDetails();
            loadNotes();
        }
    }
});


// ==========================================
// Load File Details
// ==========================================

async function loadFileDetails(retryCount = 0) {
    try {
        // Retry logic wrapper for fetch
        currentFile = await getFileCaseById(fileId);

        if (!currentFile && retryCount < 3) {
            console.warn('File not found yet, retrying details...', retryCount);
            setTimeout(() => loadFileDetails(retryCount + 1), 1000);
            return;
        }

        if (!currentFile) throw new Error("Dosya bulunamadı.");

        // Update header
        const fileNo = currentFile.registration_number || currentFile.court_case_number || 'Numara Yok';
        document.getElementById('file-number').textContent = fileNo;
        document.getElementById('file-created-date').textContent = 'Oluşturulma: ' + formatDate(currentFile.created_at);

        const titleEl = document.querySelector('title');
        if (titleEl) titleEl.textContent = fileNo + ' - Adalet Takip Sistemi';

        // Update form fields
        if (document.getElementById('edit-plaintiff')) document.getElementById('edit-plaintiff').value = currentFile.plaintiff || '';
        if (document.getElementById('edit-defendant')) document.getElementById('edit-defendant').value = currentFile.defendant || '';
        if (document.getElementById('edit-court')) document.getElementById('edit-court').value = currentFile.court_name || '';
        if (document.getElementById('edit-amount')) document.getElementById('edit-amount').value = currentFile.claim_amount || '';
        if (document.getElementById('edit-reg-number')) document.getElementById('edit-reg-number').value = currentFile.court_case_number || currentFile.registration_number || '';
        if (document.getElementById('edit-decision-number')) document.getElementById('edit-decision-number').value = currentFile.court_decision_number || '';
        if (document.getElementById('edit-decision-number')) document.getElementById('edit-decision-number').value = currentFile.court_decision_number || '';
        if (document.getElementById('edit-subject')) document.getElementById('edit-subject').value = currentFile.subject || '';

        // Vekil fields
        if (document.getElementById('edit-plaintiff-attorney')) document.getElementById('edit-plaintiff-attorney').value = currentFile.plaintiff_attorney || '';
        if (document.getElementById('edit-defendant-attorney')) document.getElementById('edit-defendant-attorney').value = currentFile.defendant_attorney || '';

        // [NEW] Populate AI Suggestion
        if (document.getElementById('ai-suggestion-box')) {
            document.getElementById('ai-suggestion-box').textContent = currentFile.case_status_notes || 'Henüz öneri yok.';
        }

        // Update status card
        updateStatusCard(currentFile);

        // Update documents list
        updateDocumentsList(currentFile.documents || []);
        // Render Tags (Robust Parsing)
        let tagsArray = currentFile.tags;
        if (typeof tagsArray === 'string') {
            // Check for Postgres array format "{tag1,tag2}"
            if (tagsArray.startsWith('{') && tagsArray.endsWith('}')) {
                tagsArray = tagsArray.slice(1, -1).split(',').map(t => t.replace(/"/g, '').trim());
            } else if (tagsArray.includes(',')) {
                tagsArray = tagsArray.split(',').map(t => t.trim());
            } else {
                tagsArray = [tagsArray];
            }
        }
        renderTags(tagsArray || []);

        // [NEW] Populate Primary Tag
        if (currentFile.primary_tag && document.getElementById('primary-tag-select')) {
            document.getElementById('primary-tag-select').value = currentFile.primary_tag;
        }

        lucide.createIcons();

    } catch (error) {
        console.error('Failed to load file details:', error);

        if (retryCount < 3) {
            setTimeout(() => loadFileDetails(retryCount + 1), 1000);
            return;
        }

        showToast('Dosya yüklenemedi: ' + error.message, 'error');
        document.getElementById('file-number').innerHTML = `<span style="color:red">Yükleme Hatası</span>`;
    }
}

// ... status card ...

// Setup Form Listener
function setupDetailsForm() {
    const form = document.getElementById('file-details-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-details-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div> Kaydediliyor...';

        try {
            const courtCaseNumber = document.getElementById('edit-reg-number').value.trim();
            const courtDecisionNumber = document.getElementById('edit-decision-number').value.trim();
            const courtName = document.getElementById('edit-court').value.trim();
            const formatRegex = /^\d{4}\/\d+$/;

            if (courtCaseNumber && !formatRegex.test(courtCaseNumber)) {
                showToast('Dosya/Esas No formatı hatalı! (Örn: 2024/1458)', 'error');
                throw new Error('Validation failed');
            }
            if (courtDecisionNumber && !formatRegex.test(courtDecisionNumber)) {
                showToast('Karar No formatı hatalı! (Örn: 2024/55)', 'error');
                throw new Error('Validation failed');
            }

            // Court Name Validation
            if (courtName) {
                const lowerCourt = courtName.toLowerCase();
                if (!lowerCourt.includes('mahkeme') && !lowerCourt.includes('daire')) {
                    showToast('Mahkeme adı geçersiz! "Mahkemesi" veya "Dairesi" kelimelerini içermeli.', 'error');
                    throw new Error('Validation failed');
                }
            }

            const updates = {
                plaintiff: document.getElementById('edit-plaintiff').value,
                defendant: document.getElementById('edit-defendant').value,
                plaintiff_attorney: document.getElementById('edit-plaintiff-attorney')?.value || null,
                defendant_attorney: document.getElementById('edit-defendant-attorney')?.value || null,
                court_name: courtName,
                claim_amount: document.getElementById('edit-amount').value,
                court_case_number: courtCaseNumber,
                // Also update registration number to match if user edited it
                registration_number: courtCaseNumber,
                court_decision_number: courtDecisionNumber,
                subject: document.getElementById('edit-subject').value
            };

            const { error } = await supabase
                .from('file_cases')
                .update(updates)
                .eq('id', fileId);

            if (error) throw error;

            showToast('Değişiklikler kaydedildi.', 'success');
            // Reload to refresh header etc
            loadFileDetails();

        } catch (error) {
            console.error('Save error:', error);
            showToast('Hata: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

function updateStatusCard(file) {
    const container = document.getElementById('status-content');

    let html = `
        <div class="form-group">
            <label class="text-muted">Atanan Avukat</label>
            <div class="font-semibold" style="font-size: var(--font-size-lg);">
                ${escapeHtml(file.lawyer_name || 'Bilinmiyor')}
            </div>
        </div>
        <div class="form-group">
            <span class="badge ${file.status === 'OPEN' ? 'badge-active' : 'badge-inactive'}" 
                  style="cursor:pointer;" 
                  onclick="toggleFileStatus()" 
                  title="Durumu değiştirmek için tıklayın">
                ${file.status === 'OPEN' ? 'Açık Dosya' : 'Kapalı'}
            </span>
        </div>
    `;

    if (file.latest_activity_type) {
        html += `
            <div class="divider"></div>
            <div class="form-group">
                <label class="text-muted">Son İşlem</label>
                <div class="font-semibold">${escapeHtml(file.latest_activity_type)}</div>
                ${file.latest_decision_result ? `
                    <span class="badge ${getDecisionBadgeClass(file.latest_decision_result)}" style="margin-top: var(--space-2);">
                        ${escapeHtml(file.latest_decision_result)}
                    </span>
                ` : ''}
                ${file.latest_activity_date ? `
                    <div class="text-muted" style="font-size: var(--font-size-xs); margin-top: var(--space-1);">
                        ${formatDate(file.latest_activity_date)}
                    </div>
                ` : ''}
            </div>
        `;
    }

    container.innerHTML = html;
}

function updateDocumentsList(documents) {
    const container = document.getElementById('documents-list');
    const countEl = document.getElementById('documents-count');

    countEl.textContent = `(${documents.length})`;

    if (documents.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: var(--space-4);">
                <i data-lucide="file-x"></i>
                <p>Henüz evrak yok.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = documents.map(doc => `
        <div class="document-item" data-doc-id="${doc.id}">
            <div class="document-icon" onclick="viewDocument('${doc.id}', '${doc.public_url || ''}')">
                <i data-lucide="file-text"></i>
            </div>
            <div class="document-info">
                <div class="document-name" onclick="viewDocument('${doc.id}', '${doc.public_url || ''}')" ${doc.analysis?.summary ? `data-tooltip="${escapeHtml(doc.analysis.summary.substring(0, 200) + (doc.analysis.summary.length > 200 ? '...' : ''))}"` : ''}>
                    ${escapeHtml(doc.name)}
                    ${doc.analysis?.type ? `<span class="badge" style="font-size:0.65em; margin-left:5px; opacity:0.8;">${escapeHtml(doc.analysis.type)}</span>` : ''}
                </div>
                <div class="document-date">${formatDate(doc.upload_date)}</div>
            </div>
            <div class="document-actions">
                <button class="icon-btn" onclick="renameDocumentPrompt('${doc.id}', '${escapeHtml(doc.name)}')" title="Yeniden Adlandır">
                    <i data-lucide="pencil"></i>
                </button>
                <button class="icon-btn" onclick="deleteDocumentConfirm('${doc.id}')" title="Sil" style="color: var(--accent-danger);">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('');

    lucide.createIcons();
}

// ==========================================
// Notes
// ==========================================

async function loadNotes() {
    const container = document.getElementById('notes-list');

    try {
        const { data: notes, error } = await getNotes(fileId);
        if (error) throw error;

        if (!notes || notes.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: var(--space-4);">
                    <p>Henüz not yok.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = notes.map(note => `
            <div class="note-item">
                <div class="note-header">
                    <span class="note-author">${escapeHtml(note.lawyers?.name || 'Sistem')}</span>
                    <span class="note-date">${formatDateTime(note.created_at)}</span>
                </div>
                <div class="note-content">${escapeHtml(note.content)}</div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Failed to load notes:', error);
        container.innerHTML = `
            <div class="empty-state" style="padding: var(--space-4);">
                <p>Notlar yüklenemedi.</p>
            </div>
        `;
    }
}

async function addNote() {
    const input = document.getElementById('new-note-input');
    const content = input.value.trim();

    if (!content) {
        showToast('Not içeriği boş olamaz.', 'warning');
        return;
    }

    try {
        await createNote(fileId, null, content);
        input.value = '';
        showToast('Not eklendi.', 'success');
        await loadNotes();
    } catch (error) {
        console.error('Failed to add note:', error);
        showToast('Not eklenemedi.', 'error');
    }
}

// ==========================================
// Tabs
// ==========================================

function switchTab(tabName) {
    // Update tab triggers
    document.querySelectorAll('.tab-trigger').forEach(trigger => {
        trigger.classList.toggle('active', trigger.textContent.toLowerCase().includes(tabName.substring(0, 4)));
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === 'tab-' + tabName);
    });
}

// ==========================================
// Form Handlers
// ==========================================

function setupFormHandlers() {
    const form = document.getElementById('file-details-form');
    if (form) {
        form.addEventListener('submit', handleSaveDetails);
    }

    // Enter key for notes
    const noteInput = document.getElementById('new-note-input');
    if (noteInput) {
        noteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNote();
            }
        });
    }
}

async function handleSaveDetails(e) {
    e.preventDefault();

    const btn = document.getElementById('save-details-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div><span>Kaydediliyor...</span>';

    try {
        const updates = {
            plaintiff: document.getElementById('edit-plaintiff').value.trim(),
            defendant: document.getElementById('edit-defendant').value.trim(),
            court_name: document.getElementById('edit-court').value.trim(),
            claim_amount: document.getElementById('edit-amount').value.trim(),
            court_case_number: document.getElementById('edit-reg-number').value.trim(),
            court_decision_number: document.getElementById('edit-decision-number').value.trim(),
            registration_number: document.getElementById('edit-reg-number').value.trim(),
            subject: document.getElementById('edit-subject').value.trim()
        };

        await updateFileCase(fileId, updates);
        showToast('Değişiklikler kaydedildi.', 'success');
        await loadFileDetails();

    } catch (error) {
        console.error('Failed to save details:', error);
        showToast('Kaydedilemedi: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save"></i><span>Değişiklikleri Kaydet</span>';
        lucide.createIcons();
    }
}

// ==========================================
// Document Upload
// ==========================================

function setupDocumentUpload() {
    const uploadArea = document.getElementById('doc-upload-area');
    const fileInput = document.getElementById('doc-upload-input');

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
            handleDocumentUpload(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleDocumentUpload(e.target.files[0]);
        }
    });
}

async function handleDocumentUpload(file) {
    if (file.size > APP_CONFIG.maxFileSize) {
        showToast('Dosya çok büyük. Maksimum 20MB.', 'error');
        return;
    }

    const progressEl = document.getElementById('doc-upload-progress');
    const analyzeCheckbox = document.getElementById('analyze-doc-checkbox');
    const shouldAnalyze = analyzeCheckbox ? analyzeCheckbox.checked : false;

    progressEl.classList.remove('hidden');

    // Update progress text
    const progressText = progressEl.querySelector('span');
    if (progressText) progressText.textContent = shouldAnalyze ? 'Yapay zeka inceliyor...' : 'Yükleniyor...';

    try {
        let aiData = null;
        if (shouldAnalyze) {
            // Get text / analysis
            let text = '';
            const settings = await getSystemSettings();
            const apiKey = settings.gemini_api_key;

            if (apiKey) {
                if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.tiff') || file.name.toLowerCase().endsWith('.tif')) {
                    let base64 = '';
                    if (file.name.toLowerCase().endsWith('.tiff') || file.name.toLowerCase().endsWith('.tif')) {
                        base64 = await convertTiffToBase64(file);
                        // Treat as Image for OCR
                        text = await performOcrWithGemini(base64, 'image/jpeg', apiKey);
                    } else {
                        base64 = await readFileAsBase64(file);
                        text = await performOcrWithGemini(base64, file.type, apiKey);
                    }
                } else if (file.name.toLowerCase().endsWith('.odt')) {
                    text = await extractTextFromODT(file);
                } else if (file.name.toLowerCase().endsWith('.udf')) {
                    text = await extractTextFromUDF(file);
                } else if (file.type === 'application/pdf') {
                    // existing PDF logic (if any) or text extraction
                    // If extractTextFromPDF is available:
                    if (typeof extractTextFromPDF === 'function') {
                        try {
                            text = await extractTextFromPDF(file);
                        } catch (e) {
                            console.warn("PDF extraction failed:", e);
                            text = "";
                        }

                        // Fallback logic (Threshold 150)
                        if ((!text || text.length < 150) && typeof convertPDFPageToImage === 'function') {
                            showToast('Metin bulunamadı, OCR (Görsel Tarama) yapılıyor...', 'info');
                            try {
                                const imageBlob = await convertPDFPageToImage(file);
                                const base64 = await readFileAsBase64(imageBlob);
                                if (apiKey) {
                                    const ocrText = await performOcrWithGemini(base64, 'image/jpeg', apiKey);
                                    // Only replace if OCR result is substantial
                                    if (ocrText && ocrText.length > (text ? text.length : 0)) {
                                        text = ocrText;
                                    }
                                }
                            } catch (e) {
                                console.warn("OCR fallback failed:", e);
                                showToast('OCR Başarısız: ' + e.message, 'error');
                            }
                        }
                    } else {
                        text = await readFileAsText(file);
                    }
                } else {
                    text = await readFileAsText(file);
                }

                if (text && text.length > 10) {
                    aiData = await analyzeWithGemini(text, apiKey);
                }
            } else {
                showToast('AI anahtarı eksik, analiz atlandı.', 'warning');
            }
        }

        const uploadedDoc = await uploadDocument(fileId, file, aiData);
        showToast('Evrak yüklendi.', 'success');

        // Auto-Close Prompt
        if (aiData && aiData.is_final_decision === true) {
            if (await UIModals.confirm(`Bu evrakta KESİN KARAR (${aiData.decision_result || 'Nihai'}) tespit edildi.\nDosya durumu "KAPALI" olarak güncellensin mi?`)) {
                await supabase.from('file_cases').update({ status: 'CLOSED' }).eq('id', fileId);
                showToast('Dosya kapatıldı.', 'info');
                // Refresh status UI if needed or reload
                setTimeout(() => window.location.reload(), 1000);
            }
        } else {
            updateDocumentsList(fileId);
        }

        // Refresh
        await loadFileDetails();
        await loadNotes();

        // Reset input
        document.getElementById('doc-upload-input').value = '';

    } catch (error) {
        console.error('Document upload failed:', error);
        showToast('Yükleme hatası: ' + error.message, 'error');
    } finally {
        progressEl.classList.add('hidden');
        if (progressText) progressText.textContent = 'Yükleniyor...';
    }
}

// ==========================================
// Document Actions
// ==========================================

function viewDocument(docId, publicUrl) {
    if (publicUrl) {
        window.open(publicUrl, '_blank');
    } else {
        showToast('Evrak görüntülenemiyor.', 'warning');
    }
}

async function renameDocumentPrompt(docId, currentName) {
    const newName = await UIModals.prompt('Yeni isim:', currentName);
    if (newName && newName !== currentName) {
        try {
            await renameDocument(docId, newName);
            showToast('İsim güncellendi.', 'success');
            await loadFileDetails();
        } catch (error) {
            showToast('Güncellenemedi.', 'error');
        }
    }
}

async function deleteDocumentConfirm(docId) {
    if (!await UIModals.confirm('Bu evrakı silmek istediğinize emin misiniz?')) return;

    try {
        await deleteDocument(docId);
        showToast('Evrak silindi.', 'success');
        await loadFileDetails();
    } catch (error) {
        showToast('Silinemedi.', 'error');
    }
}

// ==========================================
// Delete File Modal
// ==========================================

function openDeleteModal() {
    document.getElementById('delete-modal').classList.add('active');
    lucide.createIcons();
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('active');
}

function renderTags(tags) {
    const container = document.getElementById('tags-container');
    if (!tags || tags.length === 0) {
        container.innerHTML = '<span class="text-muted" style="font-size: 0.9em;">Etiket yok.</span>';
        return;
    }

    container.innerHTML = tags.map(tag => `
        <span class="badge badge-outline" style="display:flex; align-items:center; gap:4px; padding:4px 8px;">
            <i data-lucide="tag" style="width:12px;"></i>
            ${escapeHtml(tag)}
            <i data-lucide="x" style="width:12px; cursor:pointer;" onclick="removeTag('${escapeHtml(tag)}')"></i>
        </span>
    `).join('');
    lucide.createIcons();
}

async function handleAddTag() {
    const input = document.getElementById('new-tag-input');
    const tag = input.value.trim();

    if (!tag) {
        showToast('Lütfen bir etiket yazın veya seçin.', 'warning');
        return;
    }

    try {
        const { data: file } = await supabase.from('file_cases').select('tags').eq('id', fileId).single();
        const currentTags = file.tags || [];

        if (!currentTags.includes(tag)) {
            const newTags = [...currentTags, tag];
            await supabase.from('file_cases').update({ tags: newTags }).eq('id', fileId);
            showToast('Etiket eklendi.', 'success');
            await loadFileDetails();
        } else {
            showToast('Bu etiket zaten ekli.', 'info');
        }
        input.value = ''; // Clear input
    } catch (e) {
        console.error('Tag error:', e);
        showToast('Etiket eklenemedi.', 'error');
    }
}

// PRIMARY TAG LISTENER
document.getElementById('primary-tag-select')?.addEventListener('change', async (e) => {
    const newPrimary = e.target.value;
    try {
        await supabase.from('file_cases').update({ primary_tag: newPrimary }).eq('id', fileId);
        showToast('Konu güncellendi.', 'success');
    } catch (e) {
        showToast('Konu güncellenemedi.', 'error');
    }
});


async function removeTag(tagToRemove) {
    if (!confirm(`'${tagToRemove}' etiketini kaldırmak istiyor musunuz?`)) return;
    try {
        const { data: file } = await supabase.from('file_cases').select('tags').eq('id', fileId).single();
        const currentTags = file.tags || [];
        const newTags = currentTags.filter(t => t !== tagToRemove);

        await supabase.from('file_cases').update({ tags: newTags }).eq('id', fileId);
        showToast('Etiket kaldırıldı.', 'success');
        await loadFileDetails();
    } catch (e) {
        showToast('Etiket kaldırılamadı.', 'error');
    }
}

async function confirmDeleteFile() {
    const btn = document.getElementById('confirm-delete-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div><span>Siliniyor...</span>';

    try {
        await deleteFileCase(fileId);
        showToast('Dosya silindi.', 'success');
        window.location.href = 'files.html';
    } catch (error) {
        console.error('Delete failed:', error);
        showToast('Silinemedi: ' + error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="trash-2"></i><span>Sil</span>';
        lucide.createIcons();
    }
}

// Close modal on escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDeleteModal();
        closeNotesModal();
    }
});

// ==========================================
// Notes Modal Functions
// ==========================================

function openNotesModal() {
    const modal = document.getElementById('notes-modal');
    modal.classList.add('active');
    loadNotesForModal();
    lucide.createIcons();
}

function closeNotesModal() {
    const modal = document.getElementById('notes-modal');
    modal.classList.remove('active');
}

async function loadNotesForModal() {
    const container = document.getElementById('modal-notes-list');
    try {
        const { data, error } = await supabase
            .from('activities')
            .select('*')
            .eq('file_case_id', fileId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-muted">Henüz not veya işlem kaydı bulunmuyor.</p>';
            return;
        }

        container.innerHTML = data.map(item => {
            const isNote = item.activity_type === 'NOTE';
            const icon = isNote ? 'message-square' : 'file-text';
            const date = new Date(item.created_at).toLocaleString('tr-TR');
            return `
                <div style="padding:10px; border-bottom:1px solid var(--border-color); display:flex; gap:10px;">
                    <i data-lucide="${icon}" style="width:18px; color:var(--text-muted);"></i>
                    <div style="flex:1;">
                        <div style="font-size:0.85rem; color:var(--text-primary);">${escapeHtml(item.summary || item.activity_type)}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${date}</div>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
    } catch (err) {
        console.error('Modal notes load error:', err);
        container.innerHTML = '<p class="text-muted">Notlar yüklenirken hata oluştu.</p>';
    }
}

async function addNoteFromModal() {
    const input = document.getElementById('modal-note-input');
    const content = input.value.trim();
    if (!content) {
        showToast('Not içeriği boş olamaz.', 'error');
        return;
    }

    try {
        const { error } = await supabase.from('activities').insert({
            file_case_id: fileId,
            activity_type: 'NOTE',
            summary: content,
            content: content
        });

        if (error) throw error;

        input.value = '';
        showToast('Not eklendi.', 'success');
        loadNotesForModal();
        loadNotes(); // Also refresh main page notes if visible
    } catch (err) {
        console.error('Add note error:', err);
        showToast('Not eklenemedi: ' + err.message, 'error');
    }
}

// ==========================================
// Status Toggle Function
// ==========================================

async function toggleFileStatus() {
    if (!currentFile) return;

    const newStatus = currentFile.status === 'OPEN' ? 'CLOSED' : 'OPEN';

    try {
        const { error } = await supabase
            .from('file_cases')
            .update({ status: newStatus })
            .eq('id', fileId);

        if (error) throw error;

        showToast(`Dosya durumu ${newStatus === 'OPEN' ? 'Açık' : 'Kapalı'} olarak güncellendi`, 'success');
        loadFileDetails(); // Refresh to show new status
    } catch (err) {
        console.error('Status toggle error:', err);
        showToast('Durum güncellenemedi: ' + err.message, 'error');
    }
}

// ==========================================
// Collapsible Notes Section
// ==========================================

let notesLoaded = false;

function toggleNotesSection() {
    const content = document.getElementById('notes-section-content');
    const icon = document.getElementById('notes-toggle-icon');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.setAttribute('data-lucide', 'chevron-up');
        if (!notesLoaded) {
            loadInlineNotes();
            notesLoaded = true;
        }
    } else {
        content.style.display = 'none';
        icon.setAttribute('data-lucide', 'chevron-down');
    }
    lucide.createIcons();
}

async function loadInlineNotes() {
    const container = document.getElementById('inline-notes-list');
    try {
        const { data, error } = await supabase
            .from('activities')
            .select('*')
            .eq('file_case_id', fileId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-muted" style="font-size:0.9rem;">Henüz not veya işlem kaydı yok.</p>';
            return;
        }

        container.innerHTML = data.map(item => {
            const isNote = item.activity_type === 'NOTE';
            const icon = isNote ? 'message-square' : 'file-text';
            const date = new Date(item.created_at).toLocaleString('tr-TR');
            return `
                <div style="padding:8px 0; border-bottom:1px solid var(--border-color);">
                    <div style="display:flex; align-items:flex-start; gap:8px;">
                        <i data-lucide="${icon}" style="width:14px; flex-shrink:0; margin-top:2px; color:var(--text-muted);"></i>
                        <div>
                            <div style="font-size:0.85rem;">${escapeHtml(item.summary || item.activity_type)}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${date}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
    } catch (err) {
        console.error('Inline notes load error:', err);
        container.innerHTML = '<p class="text-muted">Notlar yüklenirken hata oluştu.</p>';
    }
}

async function addNoteInline() {
    const input = document.getElementById('inline-note-input');
    const content = input.value.trim();
    if (!content) {
        showToast('Not içeriği boş olamaz.', 'error');
        return;
    }

    try {
        const { error } = await supabase.from('activities').insert({
            file_case_id: fileId,
            activity_type: 'NOTE',
            summary: content,
            content: content
        });

        if (error) throw error;

        input.value = '';
        showToast('Not eklendi.', 'success');
        loadInlineNotes();
        loadNotes();
    } catch (err) {
        console.error('Add note error:', err);
        showToast('Not eklenemedi: ' + err.message, 'error');
    }
}

// Window Exports
window.viewDocument = viewDocument;
window.renameDocumentPrompt = renameDocumentPrompt;
window.deleteDocumentConfirm = deleteDocumentConfirm;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteFile = confirmDeleteFile;
window.handleAddTag = handleAddTag;
window.removeTag = removeTag;
window.openNotesModal = openNotesModal;
window.closeNotesModal = closeNotesModal;
window.addNoteFromModal = addNoteFromModal;
window.toggleFileStatus = toggleFileStatus;
window.toggleNotesSection = toggleNotesSection;
window.addNoteInline = addNoteInline;

console.log('file-detail.js loaded successfully');
