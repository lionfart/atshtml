// opinions.js - Legal Opinions (Hukuki Mütalaa) Module
// Manages loading, creating, and displaying legal opinions

let currentOpinionData = null;
let currentOpinionFile = null;

async function initOpinions() {
    setupDropZone();
    await loadOpinions();
}

function setupDropZone() {
    const dropZone = document.getElementById('opinion-drop-zone');
    if (!dropZone) return;

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processOpinionFile(files[0]);
        }
    });
}

function handleOpinionFile(event) {
    const file = event.target.files[0];
    if (file) processOpinionFile(file);
}

async function processOpinionFile(file) {
    showToast('Dosya analiz ediliyor...', 'info');

    try {
        // Extract text from file
        let text = '';
        if (file.type === 'application/pdf') {
            text = await extractTextFromPDF(file);
        } else {
            text = await readFileAsText(file);
        }

        if (!text || text.length < 10) {
            showToast('Dosyadan metin okunamadı.', 'error');
            return;
        }

        // Analyze with AI
        const settings = await getSystemSettings();
        const apiKey = settings?.gemini_api_key;
        if (!apiKey) {
            showToast('API anahtarı bulunamadı.', 'error');
            return;
        }

        const analysisData = await analyzeOpinionWithGemini(text, apiKey);
        currentOpinionData = analysisData;
        currentOpinionFile = file;

        openOpinionReviewModal(analysisData);

    } catch (error) {
        console.error('Opinion processing error:', error);
        showToast('Hata: ' + error.message, 'error');
    }
}

function openOpinionReviewModal(data) {
    const content = `
        <div style="display:grid; gap:15px;">
            <div class="form-group">
                <label>Görüş İsteyen Kurum</label>
                <input type="text" id="opinion-institution" value="${escapeHtml(data.requesting_institution || '')}" class="form-control">
            </div>
            <div class="form-group">
                <label>Görüş Konusu</label>
                <textarea id="opinion-subject" rows="3" class="form-control">${escapeHtml(data.subject || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Aciliyet</label>
                <select id="opinion-urgency" class="form-control">
                    <option value="LOW" ${data.urgency === 'LOW' ? 'selected' : ''}>Düşük</option>
                    <option value="MEDIUM" ${data.urgency === 'MEDIUM' || !data.urgency ? 'selected' : ''}>Orta</option>
                    <option value="HIGH" ${data.urgency === 'HIGH' ? 'selected' : ''}>Yüksek (Acil)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Kesin Süre</label>
                <input type="date" id="opinion-deadline" value="${data.deadline_date || ''}" class="form-control">
            </div>
            <div class="form-group" style="background:rgba(6, 182, 212, 0.1); padding:10px; border-radius:8px;">
                <label style="color:var(--accent-secondary);">AI Görüş Önerisi</label>
                <p style="font-size:0.9rem; font-style:italic; color:var(--text-secondary);">${escapeHtml(data.ai_suggestion || 'Öneri yok.')}</p>
            </div>
        </div>
    `;

    document.getElementById('opinion-review-content').innerHTML = content;
    document.getElementById('opinion-review-modal').classList.add('active');
    lucide.createIcons();
}

function closeOpinionReviewModal() {
    document.getElementById('opinion-review-modal').classList.remove('active');
    currentOpinionData = null;
    currentOpinionFile = null;
}

async function approveOpinion() {
    if (!currentOpinionData) return;

    const institution = document.getElementById('opinion-institution').value;
    const subject = document.getElementById('opinion-subject').value;
    const urgency = document.getElementById('opinion-urgency').value;
    const deadline = document.getElementById('opinion-deadline').value;

    if (!institution || !subject) {
        showToast('Kurum ve Konu alanları zorunludur.', 'warning');
        return;
    }

    try {
        // Assign lawyer using separate queue
        const lawyer = await assignOpinionLawyer();

        // Generate registration number
        const year = new Date().getFullYear();
        const { count } = await supabase.from('legal_opinions').select('*', { count: 'exact', head: true }).gte('created_at', `${year}-01-01`);
        const regNumber = `G-${year}/${String((count || 0) + 1).padStart(4, '0')}`;

        // Insert opinion
        const { data: newOpinion, error } = await supabase.from('legal_opinions').insert([{
            registration_number: regNumber,
            requesting_institution: institution,
            subject: subject,
            urgency: urgency,
            deadline_date: deadline || null,
            lawyer_id: lawyer?.id || null,
            lawyer_name: lawyer?.name || 'Atanmadı',
            ai_suggestion: currentOpinionData.ai_suggestion || null,
            summary: currentOpinionData.summary || null,
            status: 'OPEN'
        }]).select().single();

        if (error) throw error;

        // Upload document if exists
        if (currentOpinionFile) {
            await uploadOpinionDocument(newOpinion.id, currentOpinionFile, currentOpinionData);
        }

        showToast(`Görüş kaydedildi: ${regNumber}`, 'success');
        closeOpinionReviewModal();
        loadOpinions();

    } catch (error) {
        console.error('Save opinion error:', error);
        showToast('Hata: ' + error.message, 'error');
    }
}

async function assignOpinionLawyer() {
    try {
        const { data: lawyers } = await supabase.from('lawyers').select('*').eq('status', 'ACTIVE').order('name');
        if (!lawyers || lawyers.length === 0) return null;

        const { data: settings } = await supabase.from('system_settings').select('opinions_assignment_index').limit(1).single();
        let currentIndex = settings?.opinions_assignment_index || 0;

        const nextIndex = (currentIndex + 1) % lawyers.length;
        const selectedLawyer = lawyers[nextIndex];

        // Update index
        await supabase.from('system_settings').update({ opinions_assignment_index: nextIndex }).eq('id', settings.id);

        // Update lawyer count (optional, can use separate counter)
        await supabase.from('lawyers').update({
            assigned_files_count: (selectedLawyer.assigned_files_count || 0) + 1
        }).eq('id', selectedLawyer.id);

        return selectedLawyer;
    } catch (e) {
        console.error('Assign opinion lawyer error:', e);
        return null;
    }
}

async function uploadOpinionDocument(opinionId, file, aiData) {
    const ext = file.name.split('.').pop();
    const fileName = `opinions/${opinionId}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(APP_CONFIG.storageBucket).upload(fileName, file);
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from(APP_CONFIG.storageBucket).getPublicUrl(fileName);

    await supabase.from('opinion_documents').insert([{
        opinion_id: opinionId,
        name: file.name,
        type: aiData?.type || file.type,
        storage_path: fileName,
        public_url: urlData.publicUrl,
        analysis: aiData
    }]);
}

async function loadOpinions() {
    const tbody = document.getElementById('opinions-table-body');
    const countEl = document.getElementById('opinions-count');
    const statusFilter = document.getElementById('filter-status')?.value;

    try {
        let query = supabase.from('legal_opinions').select('*').order('created_at', { ascending: false });
        if (statusFilter) query = query.eq('status', statusFilter);

        const { data: opinions, error } = await query;
        if (error) throw error;

        countEl.textContent = `(${opinions?.length || 0})`;

        if (!opinions || opinions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:40px;">
                        <i data-lucide="inbox" style="width:48px; height:48px; color:var(--text-muted); margin-bottom:10px;"></i>
                        <p class="text-muted">Henüz görüş kaydı yok.</p>
                    </td>
                </tr>
            `;
            lucide.createIcons();
            return;
        }

        tbody.innerHTML = opinions.map(op => `
            <tr onclick="viewOpinion('${op.id}')" style="cursor:pointer;">
                <td><strong>${escapeHtml(op.registration_number || '-')}</strong></td>
                <td>${escapeHtml(op.requesting_institution || '-')}</td>
                <td style="max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(op.subject || '-')}</td>
                <td>${escapeHtml(op.lawyer_name || 'Atanmadı')}</td>
                <td><span class="urgency-${(op.urgency || 'MEDIUM').toLowerCase()}">${getUrgencyLabel(op.urgency)}</span></td>
                <td><span class="badge ${op.status === 'OPEN' ? 'badge-active' : 'badge-inactive'}">${op.status === 'OPEN' ? 'Açık' : 'Kapalı'}</span></td>
                <td>${formatDate(op.created_at)}</td>
            </tr>
        `).join('');

        lucide.createIcons();

    } catch (error) {
        console.error('Load opinions error:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="color:red;">Hata: ${error.message}</td></tr>`;
    }
}

function getUrgencyLabel(urgency) {
    switch (urgency) {
        case 'HIGH': return 'Yüksek';
        case 'MEDIUM': return 'Orta';
        case 'LOW': return 'Düşük';
        default: return 'Orta';
    }
}

function viewOpinion(id) {
    // For now, just show a toast. Can be expanded to a detail page.
    showToast('Görüş detay sayfası henüz eklenmedi.', 'info');
}

function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Helper functions (from supabase-client.js, duplicated for standalone use if needed)
async function extractTextFromPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
        }
        return text;
    } catch (e) {
        console.error('PDF extraction error:', e);
        return '';
    }
}

async function readFileAsText(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve('');
        reader.readAsText(file);
    });
}

// Export for global access
window.initOpinions = initOpinions;
window.handleOpinionFile = handleOpinionFile;
window.closeOpinionReviewModal = closeOpinionReviewModal;
window.approveOpinion = approveOpinion;
window.viewOpinion = viewOpinion;
