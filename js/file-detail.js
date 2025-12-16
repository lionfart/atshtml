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
        showToast('Dosya ID bulunamadı.', 'error');
        // window.location.href = 'files.html';
        console.error('Missing File ID in URL');
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
        if (document.getElementById('edit-subject')) document.getElementById('edit-subject').value = currentFile.subject || '';

        // Update status card
        updateStatusCard(currentFile);

        // Update documents list
        updateDocumentsList(currentFile.documents || []);

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
            const updates = {
                plaintiff: document.getElementById('edit-plaintiff').value,
                defendant: document.getElementById('edit-defendant').value,
                court_name: document.getElementById('edit-court').value,
                claim_amount: document.getElementById('edit-amount').value,
                court_case_number: document.getElementById('edit-reg-number').value,
                // Also update registration number to match if user edited it
                registration_number: document.getElementById('edit-reg-number').value,
                court_decision_number: document.getElementById('edit-decision-number').value,
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
            <span class="badge ${file.status === 'OPEN' ? 'badge-active' : 'badge-inactive'}">
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
                <div class="document-name" onclick="viewDocument('${doc.id}', '${doc.public_url || ''}')">${escapeHtml(doc.name)}</div>
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
    progressEl.classList.remove('hidden');

    try {
        await uploadDocument(fileId, file, true);
        showToast('Evrak yüklendi.', 'success');

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
    const newName = prompt('Yeni isim:', currentName);
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
    if (!confirm('Bu evrakı silmek istediğinize emin misiniz?')) return;

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
    }
});
