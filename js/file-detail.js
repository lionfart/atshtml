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

        // [NEW] Display Decision Result if available
        const statusContainer = document.getElementById('file-number').parentNode;
        // Remove old badge if exists
        const oldBadge = statusContainer.querySelector('.decision-badge');
        if (oldBadge) oldBadge.remove();

        if (currentFile.latest_decision_result) {
            const res = currentFile.latest_decision_result;
            const badge = document.createElement('span');
            badge.className = 'decision-badge badge';
            badge.style.fontSize = '0.8rem';
            badge.style.marginLeft = '10px';
            badge.style.verticalAlign = 'middle';

            // Colors logic (same as files.js)
            if (['Kabul', 'Onama', 'Düzelterek Onama', 'İptal', 'Tazminat Kabul'].some(x => res.includes(x))) {
                badge.className += ' badge-active'; // Greenish
                badge.style.backgroundColor = 'var(--accent-success)';
                badge.style.color = '#fff';
            } else if (['Red', 'Bozma'].some(x => res.includes(x))) {
                badge.className += ' badge-inactive'; // Redish
                badge.style.backgroundColor = 'var(--accent-danger)';
                badge.style.color = '#fff';
            } else {
                badge.style.backgroundColor = 'var(--accent-warning)';
                badge.style.color = '#000';
            }

            badge.textContent = res;
            document.getElementById('file-number').appendChild(badge);
        }

        // Update form fields
        if (document.getElementById('edit-plaintiff')) document.getElementById('edit-plaintiff').value = currentFile.plaintiff || '';
        if (document.getElementById('edit-defendant')) document.getElementById('edit-defendant').value = currentFile.defendant || '';
        if (document.getElementById('edit-court')) document.getElementById('edit-court').value = currentFile.court_name || '';
        if (document.getElementById('edit-amount')) document.getElementById('edit-amount').value = currentFile.claim_amount || '';
        if (document.getElementById('edit-reg-number')) document.getElementById('edit-reg-number').value = currentFile.court_case_number || currentFile.registration_number || '';
        if (document.getElementById('edit-decision-number')) document.getElementById('edit-decision-number').value = currentFile.court_decision_number || '';
        if (document.getElementById('edit-subject')) document.getElementById('edit-subject').value = currentFile.subject || '';
        if (document.getElementById('edit-address')) document.getElementById('edit-address').value = currentFile.address || '';

        // Populate Date Badges (Hearing + Deadline)
        updateDateBadges(currentFile);

        // Vekil fields
        if (document.getElementById('edit-plaintiff-attorney')) document.getElementById('edit-plaintiff-attorney').value = currentFile.plaintiff_attorney || '';
        if (document.getElementById('edit-defendant-attorney')) document.getElementById('edit-defendant-attorney').value = currentFile.defendant_attorney || '';

        // [NEW] Populate Favorite button and Urgency dropdown
        updateFavoriteButton(currentFile.is_favorite);
        if (document.getElementById('urgency-select')) {
            document.getElementById('urgency-select').value = currentFile.urgency || 'Orta';
        }


        // Note: Decision history is now loaded via loadDecisions() after this function

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

        // Load decision history
        loadDecisions();

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
                subject: document.getElementById('edit-subject').value,
                address: document.getElementById('edit-address')?.value || null // [NEW] Address field
                // Note: deadline is now managed separately via badge
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
            <div style="display:flex; align-items:center; gap:8px;">
                <div class="font-semibold" style="font-size: var(--font-size-lg);">
                    ${escapeHtml(file.lawyer_name || 'Bilinmiyor')}
                </div>
                <button class="icon-btn btn-xs" onclick="editAssignedLawyer()" title="Avukatı Değiştir">
                    <i data-lucide="edit-2" style="width:14px; opacity:0.7;"></i>
                </button>
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
                    <span class="badge ${getDecisionBadgeClass(file.latest_decision_result)}" 
                          style="margin-top: var(--space-2); cursor:pointer; border:1px dashed rgba(255,255,255,0.3);" 
                          onclick="editDecisionResult()"
                          title="Düzenlemek için tıklayın">
                        ${escapeHtml(file.latest_decision_result)} <i data-lucide="edit-2" style="width:10px; height:10px; margin-left:4px; opacity:0.7;"></i>
                    </span>
                ` : `
                    <button class="btn btn-xs btn-ghost" style="margin-top:5px; font-size:0.7rem; opacity:0.6;" onclick="editDecisionResult()">+ Sonuç Ekle</button>
                `}
                ${file.latest_activity_date ? `
                    <div class="text-muted" style="font-size: var(--font-size-xs); margin-top: var(--space-1);">
                        ${formatDate(file.latest_activity_date)}
                    </div>
                ` : ''}
            </div>
        `;
    }

    container.innerHTML = html;
    container.innerHTML = html;
}

// [NEW] Edit Decision Result via SweetAlert or Prompt
async function editDecisionResult() {
    // Determine current result index
    const options = [
        "Onama", "Düzelterek Onama", "Bozma", "Red", "İptal",
        "Tazminat Kabul", "Kısmen Kabul Kısmen Red", "Gönderme"
    ];

    // Simple Prompt for now (or a custom modal if preferred)
    // Using a simple prompt loop for robustness without external deps if Swal misses
    let selection = null;

    // Create a temporary modal for selection
    const modalId = 'temp-decision-modal';
    const modalHtml = `
        <div id="${modalId}" class="modal active" style="z-index:9999;">
            <div class="modal-content" style="max-width:300px;">
                <div class="modal-header">
                    <h3>Karar Sonucu Düzenle</h3>
                    <button class="icon-btn" onclick="document.getElementById('${modalId}').remove()"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body">
                    ${options.map(o => `<button class="btn btn-secondary w-full" style="margin-bottom:5px; text-align:left;" onclick="saveDecisionResult('${o}')">${o}</button>`).join('')}
                    <button class="btn btn-ghost w-full" style="margin-top:10px; color:var(--accent-danger);" onclick="saveDecisionResult(null)">Temizle (Sil)</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}

window.saveDecisionResult = async function (newResult) {
    document.getElementById('temp-decision-modal').remove();

    try {
        const { error } = await supabase.from('file_cases').update({ latest_decision_result: newResult }).eq('id', fileId);
        if (error) throw error;
        showToast('Karar sonucu güncellendi.', 'success');
        loadFileDetails(); // Refresh UI
    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
};

window.editDecisionResult = editDecisionResult; // Export for onclick
window.editDecisionResultInDetails = editDecisionResult; // Alias for file details section badge

// [NEW] Edit Assigned Lawyer
async function editAssignedLawyer() {
    try {
        showToast('Avukat listesi yükleniyor...', 'info');
        const { data: lawyers, error } = await supabase.from('lawyers').select('id, name').order('name');

        if (error) throw error;
        if (!lawyers || lawyers.length === 0) {
            showToast('Sistemde kayıtlı avukat bulunamadı.', 'warning');
            return;
        }

        const modalId = 'temp-lawyer-modal';
        const modalHtml = `
            <div id="${modalId}" class="modal active" style="z-index:9999;">
                <div class="modal-content" style="max-width:300px;">
                    <div class="modal-header">
                        <h3>Avukat Değiştir</h3>
                        <button class="icon-btn" onclick="document.getElementById('${modalId}').remove()"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body" style="max-height: 400px; overflow-y: auto;">
                        ${lawyers.map(l => `<button class="btn btn-secondary w-full" style="margin-bottom:5px; text-align:left;" onclick="saveAssignedLawyer('${l.id}', '${l.name.replace(/'/g, "\\'")}')">${l.name}</button>`).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        lucide.createIcons();

    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
}

window.saveAssignedLawyer = async function (id, name) {
    document.getElementById('temp-lawyer-modal').remove();
    try {
        const { error } = await supabase.from('file_cases').update({ lawyer_id: id, lawyer_name: name }).eq('id', fileId);
        if (error) throw error;
        showToast('Avukat güncellendi.', 'success');
        loadFileDetails();
    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
};

window.editAssignedLawyer = editAssignedLawyer;

// ==========================================
// Date Badge Functions (Two Separate Fields)
// ==========================================

function updateDateBadges(file) {
    // Duruşma/Keşif Badge
    const hearingBadge = document.getElementById('display-hearing');
    const hearingText = document.getElementById('hearing-text');
    if (hearingBadge && hearingText) {
        if (file.next_hearing_date) {
            hearingText.textContent = formatDate((file.next_hearing_date || '').split('T')[0]);
            hearingBadge.style.background = 'var(--accent-warning)';
            hearingBadge.style.color = 'white';
        } else {
            hearingText.textContent = 'Belirlenmedi';
            hearingBadge.style.background = 'rgba(255,255,255,0.1)';
            hearingBadge.style.color = 'var(--text-muted)';
        }
    }

    // İşlem Süresi Badge
    const deadlineBadge = document.getElementById('display-deadline');
    const deadlineText = document.getElementById('deadline-text');
    if (deadlineBadge && deadlineText) {
        if (file.deadline_date) {
            deadlineText.textContent = formatDate((file.deadline_date || '').split('T')[0]);
            deadlineBadge.style.background = 'var(--accent-danger)';
            deadlineBadge.style.color = 'white';
        } else {
            deadlineText.textContent = 'Belirlenmedi';
            deadlineBadge.style.background = 'rgba(255,255,255,0.1)';
            deadlineBadge.style.color = 'var(--text-muted)';
        }
    }

    lucide.createIcons();
}

// Duruşma/Keşif Edit
async function editHearingDate() {
    const currentDate = currentFile?.next_hearing_date ? (currentFile.next_hearing_date || '').split('T')[0] : '';

    const modalHtml = `
        <div id="date-edit-modal" class="modal active" style="z-index:9999;">
            <div class="modal-content" style="max-width:320px;">
                <div class="modal-header" style="border-left:3px solid var(--accent-warning);">
                    <h3 style="display:flex; align-items:center; gap:8px;"><i data-lucide="calendar" style="color:var(--accent-warning);"></i> Duruşma/Keşif</h3>
                    <button class="icon-btn" onclick="closeDateEditModal()"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Tarih</label>
                        <input type="date" id="date-edit-input" class="form-control" value="${currentDate}">
                    </div>
                </div>
                <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end;">
                    <button class="btn btn-ghost" onclick="clearDateFieldDetail('next_hearing_date')">Temizle</button>
                    <button class="btn btn-primary" onclick="saveDateFieldDetail('next_hearing_date')">Kaydet</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}

// İşlem Süresi Edit
async function editDeadlineDate() {
    const currentDate = currentFile?.deadline_date ? (currentFile.deadline_date || '').split('T')[0] : '';

    const modalHtml = `
        <div id="date-edit-modal" class="modal active" style="z-index:9999;">
            <div class="modal-content" style="max-width:320px;">
                <div class="modal-header" style="border-left:3px solid var(--accent-danger);">
                    <h3 style="display:flex; align-items:center; gap:8px;"><i data-lucide="alarm-clock" style="color:var(--accent-danger);"></i> İşlem Süresi</h3>
                    <button class="icon-btn" onclick="closeDateEditModal()"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Tarih</label>
                        <input type="date" id="date-edit-input" class="form-control" value="${currentDate}">
                    </div>
                </div>
                <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end;">
                    <button class="btn btn-ghost" onclick="clearDateFieldDetail('deadline_date')">Temizle</button>
                    <button class="btn btn-primary" onclick="saveDateFieldDetail('deadline_date')">Kaydet</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}

window.closeDateEditModal = function () {
    const modal = document.getElementById('date-edit-modal');
    if (modal) modal.remove();
};

window.saveDateFieldDetail = async function (fieldName) {
    const date = document.getElementById('date-edit-input').value || null;

    try {
        const updates = {};
        updates[fieldName] = date;

        const { error } = await supabase.from('file_cases').update(updates).eq('id', fileId);
        if (error) throw error;

        showToast('Tarih güncellendi.', 'success');
        closeDateEditModal();
        loadFileDetails();
    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
};

window.clearDateFieldDetail = async function (fieldName) {
    try {
        const updates = {};
        updates[fieldName] = null;

        const { error } = await supabase.from('file_cases').update(updates).eq('id', fileId);
        if (error) throw error;

        showToast('Tarih temizlendi.', 'success');
        closeDateEditModal();
        loadFileDetails();
    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
};

window.editHearingDate = editHearingDate;
window.editDeadlineDate = editDeadlineDate;

// ==========================================
// Decision History Functions
// ==========================================

const DECISION_TYPES = {
    'ILK_DERECE': { label: 'İlk Derece', icon: 'building-2', color: 'var(--accent-primary)' },
    'ISTINAF': { label: 'İstinaf', icon: 'scale', color: 'var(--accent-warning)' },
    'TEMYIZ': { label: 'Temyiz', icon: 'landmark', color: 'var(--accent-danger)' }
};

const DECISION_RESULTS = ['Red', 'İptal', 'Onama', 'Bozma', 'Kısmen Kabul Kısmen Red', 'Gönderme', 'Kabul', 'YD Kabul', 'YD Red', 'Diğer'];

async function loadDecisions() {
    const decisions = await getDecisionsByFileId(fileId);
    renderDecisionsList(decisions);
}

function renderDecisionsList(decisions) {
    const container = document.getElementById('decisions-list');
    if (!container) return;

    if (!decisions || decisions.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--text-muted); opacity:0.6; padding:15px;">Henüz karar eklenmedi</div>`;
        return;
    }

    // Sort by date ascending
    decisions.sort((a, b) => new Date(a.decision_date || 0) - new Date(b.decision_date || 0));

    const html = decisions.map(d => {
        const typeInfo = DECISION_TYPES[d.decision_type] || { label: d.decision_type, icon: 'file-text', color: 'var(--text-muted)' };
        const dateStr = d.decision_date ? formatDate(d.decision_date) : '-';
        const resultColor = getResultColor(d.decision_result);

        return `
            <div class="decision-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:8px; background:rgba(255,255,255,0.05); border-radius:6px; border-left:3px solid ${typeInfo.color};">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <i data-lucide="${typeInfo.icon}" style="width:14px; color:${typeInfo.color};"></i>
                        <span style="font-weight:600; color:${typeInfo.color};">${typeInfo.label}</span>
                        <span style="font-weight:600; color:${resultColor};">${d.decision_result || '-'}</span>
                    </div>
                    ${d.court_name ? `<div style="font-size:0.75em; color:var(--accent-secondary); margin-bottom:2px;">${escapeHtml(d.court_name)}</div>` : ''}
                    <div style="font-size:0.8em; color:var(--text-muted);">
                        ${dateStr}${d.decision_number ? ' | Karar: ' + d.decision_number : ''}${d.court_case_number ? ' | Esas: ' + d.court_case_number : ''}
                    </div>
                    ${d.notes ? `<div style="font-size:0.75em; color:var(--text-secondary); margin-top:4px; font-style:italic;">${escapeHtml(d.notes)}</div>` : ''}
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="icon-btn" onclick="editDecision('${d.id}')" title="Düzenle">
                        <i data-lucide="edit-2" style="width:14px;"></i>
                    </button>
                    <button class="icon-btn" onclick="deleteDecisionConfirm('${d.id}')" title="Sil" style="color:var(--accent-danger);">
                        <i data-lucide="trash-2" style="width:14px;"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
    lucide.createIcons();
}

function getResultColor(result) {
    if (!result) return 'var(--text-muted)';
    const r = result.toLowerCase();
    if (r.includes('kabul') && !r.includes('kısmen')) return 'var(--accent-success)';
    if (r.includes('red') || r.includes('bozma')) return 'var(--accent-danger)';
    if (r.includes('kısmen') || r.includes('onama')) return 'var(--accent-warning)';
    return 'var(--text-primary)';
}

function openAddDecisionModal(editData = null) {
    const isEdit = !!editData;
    const title = isEdit ? 'Kararı Düzenle' : 'Yeni Karar Ekle';

    const modalHtml = `
        <div id="decision-modal" class="modal active" style="z-index:9999;">
            <div class="modal-content" style="max-width:400px;">
                <div class="modal-header">
                    <h3><i data-lucide="gavel"></i> ${title}</h3>
                    <button class="icon-btn" onclick="closeDecisionModal()"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Karar Türü</label>
                        <select id="decision-type-input" class="form-control">
                            <option value="ILK_DERECE" ${editData?.decision_type === 'ILK_DERECE' ? 'selected' : ''}>İlk Derece Mahkemesi</option>
                            <option value="ISTINAF" ${editData?.decision_type === 'ISTINAF' ? 'selected' : ''}>İstinaf Mahkemesi</option>
                            <option value="TEMYIZ" ${editData?.decision_type === 'TEMYIZ' ? 'selected' : ''}>Temyiz (Yargıtay/Danıştay)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Karar Sonucu</label>
                        <select id="decision-result-input" class="form-control">
                            <option value="">Seçiniz</option>
                            ${DECISION_RESULTS.map(r => `<option value="${r}" ${editData?.decision_result === r ? 'selected' : ''}>${r}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Karar Tarihi</label>
                        <input type="date" id="decision-date-input" class="form-control" value="${editData?.decision_date || ''}">
                    </div>
                    <div class="form-group">
                        <label>Mahkeme Adı</label>
                        <input type="text" id="decision-court-input" class="form-control" placeholder="Örn: Ankara 1. Asliye Hukuk" value="${editData?.court || ''}">
                    </div>
                    <div class="form-group">
                        <label>Esas Numarası</label>
                        <input type="text" id="decision-basis-input" class="form-control" placeholder="Örn: 2024/123 E." value="${editData?.basis_number || ''}">
                    </div>
                    <div class="form-group">
                        <label>Karar Numarası (Opsiyonel)</label>
                        <input type="text" id="decision-number-input" class="form-control" placeholder="2024/123 K." value="${editData?.decision_number || ''}">
                    </div>
                    <div class="form-group">
                        <label>Notlar (Opsiyonel)</label>
                        <textarea id="decision-notes-input" class="form-control" rows="2" placeholder="Kısa açıklama...">${editData?.notes || ''}</textarea>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end;">
                    <button class="btn btn-ghost" onclick="closeDecisionModal()">İptal</button>
                    <button class="btn btn-primary" onclick="saveDecisionFromModal('${editData?.id || ''}')">${isEdit ? 'Güncelle' : 'Kaydet'}</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}

window.closeDecisionModal = function () {
    const modal = document.getElementById('decision-modal');
    if (modal) modal.remove();
};

window.openAddDecisionModal = openAddDecisionModal;

window.saveDecisionFromModal = async function (editId) {
    const data = {
        decision_type: document.getElementById('decision-type-input').value,
        decision_result: document.getElementById('decision-result-input').value,
        decision_date: document.getElementById('decision-date-input').value || null,
        decision_number: document.getElementById('decision-number-input').value || null,
        court: document.getElementById('decision-court-input').value || null,
        basis_number: document.getElementById('decision-basis-input').value || null,
        notes: document.getElementById('decision-notes-input').value || null
    };

    if (!data.decision_type || !data.decision_result) {
        showToast('Karar türü ve sonucu zorunludur.', 'error');
        return;
    }

    try {
        if (editId) {
            await updateDecision(editId, data);
            showToast('Karar güncellendi.', 'success');
        } else {
            data.file_case_id = fileId;
            await createDecision(data);
            showToast('Karar eklendi.', 'success');
        }
        closeDecisionModal();
        loadDecisions();

        // Also update latest_decision_result in file_cases for list display
        await updateLatestDecision();
    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
};

window.editDecision = async function (id) {
    const decisions = await getDecisionsByFileId(fileId);
    const decision = decisions.find(d => d.id === id);
    if (decision) {
        openAddDecisionModal(decision);
    }
};

window.deleteDecisionConfirm = function (id) {
    if (confirm('Bu kararı silmek istediğinize emin misiniz?')) {
        deleteDecisionAction(id);
    }
};

async function deleteDecisionAction(id) {
    try {
        await deleteDecision(id);
        showToast('Karar silindi.', 'success');
        loadDecisions();
        await updateLatestDecision();
    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
}

// Update file_cases.latest_decision_result with most recent decision
async function updateLatestDecision() {
    const decisions = await getDecisionsByFileId(fileId);
    let latestResult = null;

    if (decisions.length > 0) {
        // Get most recent by date
        decisions.sort((a, b) => new Date(b.decision_date || 0) - new Date(a.decision_date || 0));
        latestResult = decisions[0].decision_result;
    }

    await supabase.from('file_cases').update({ latest_decision_result: latestResult }).eq('id', fileId);
}

function updateDocumentsList(documents) {
    const container = document.getElementById('documents-list');
    const countEl = document.getElementById('documents-count');

    // Ensure documents is an array
    if (!Array.isArray(documents)) {
        documents = [];
    }

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
    // File-detail uploads are available for all users

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
            // Check if decision is one of the final types
            const finalDecisions = ['Red', 'İptal', 'Tazminat Kabul', 'Kısmen Kabul Kısmen Red', 'Gönderme', 'Onama', 'Bozma'];
            // Normalize for comparison
            const decision = aiData.decision_result;
            const isListed = finalDecisions.some(d => d.toLowerCase() === (decision || '').toLowerCase());

            if (isListed || aiData.decision_result) {
                const confirmMsg = `Bu evrakta KESİN KARAR (${aiData.decision_result}) tespit edildi.\n\nDosyayı 'KAPALI' statüsüne alıp pasifize etmek ister misiniz?`;
                if (await UIModals.confirm(confirmMsg)) {
                    await supabase.from('file_cases').update({ status: 'CLOSED' }).eq('id', fileId);
                    showToast('Dosya durumu KAPALI olarak güncellendi.', 'success');
                    // Reload to reflect status change
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showToast('Dosya açık kalmaya devam edecek.', 'info');
                    updateDocumentsList(fileId);
                }
            } else {
                updateDocumentsList(fileId);
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

    // Admin check
    if (typeof isAdmin === 'function' && !isAdmin()) {
        showToast('Bu işlem için admin yetkisi gerekli!', 'error');
        return;
    }

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

// Toggle Notes Panel (collapsible)
function toggleNotesPanel() {
    const content = document.getElementById('notes-panel-content');
    const icon = document.getElementById('notes-panel-icon');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.setAttribute('data-lucide', 'chevron-up');
        loadNotes(); // Load notes when opened
    } else {
        content.style.display = 'none';
        icon.setAttribute('data-lucide', 'chevron-down');
    }
    lucide.createIcons();
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
window.toggleNotesPanel = toggleNotesPanel;

// ==========================================
// Favorite and Urgency Functions
// ==========================================

function updateFavoriteButton(isFavorite) {
    const btn = document.getElementById('favorite-btn');
    const icon = document.getElementById('fav-icon');
    const text = document.getElementById('fav-text');
    if (!btn) return;

    if (isFavorite) {
        btn.style.background = 'var(--accent-warning)';
        btn.style.borderColor = 'var(--accent-warning)';
        btn.style.color = '#000';
        if (text) text.textContent = 'Favori ⭐';
    } else {
        btn.style.background = 'var(--bg-card)';
        btn.style.borderColor = 'var(--border-color)';
        btn.style.color = 'var(--text-primary)';
        if (text) text.textContent = 'Favorile';
    }
}

async function toggleFavorite() {
    if (!currentFile || !fileId) return;

    const newValue = !currentFile.is_favorite;
    const btn = document.getElementById('favorite-btn');
    btn.disabled = true;

    try {
        const { error } = await supabase
            .from('file_cases')
            .update({ is_favorite: newValue })
            .eq('id', fileId);

        if (error) throw error;

        currentFile.is_favorite = newValue;
        updateFavoriteButton(newValue);
        showToast(newValue ? 'Favorilere eklendi ⭐' : 'Favorilerden çıkarıldı', 'success');
    } catch (err) {
        console.error('Toggle favorite error:', err);
        showToast('Hata: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function updateUrgency() {
    if (!currentFile || !fileId) return;

    const newValue = document.getElementById('urgency-select').value;

    try {
        const { error } = await supabase
            .from('file_cases')
            .update({ urgency: newValue })
            .eq('id', fileId);

        if (error) throw error;

        currentFile.urgency = newValue;
        showToast('Önem derecesi güncellendi: ' + newValue, 'success');
    } catch (err) {
        console.error('Update urgency error:', err);
        showToast('Hata: ' + err.message, 'error');
    }
}

window.toggleFavorite = toggleFavorite;
window.updateUrgency = updateUrgency;

console.log('file-detail.js loaded successfully');
