// opinion-detail.js - Opinion Detail Page Logic

let opinionId = null;
let currentOpinion = null;

async function initOpinionDetail() {
    // Get ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    opinionId = urlParams.get('id');

    if (!opinionId) {
        showToast('Görüş ID bulunamadı.', 'error');
        return;
    }

    // Init Supabase
    if (typeof initSupabase === 'function') await initSupabase();

    await loadOpinionDetails();
    setupForm();
}

async function loadOpinionDetails() {
    try {
        const { data: opinion, error } = await supabase
            .from('legal_opinions')
            .select('*')
            .eq('id', opinionId)
            .single();

        if (error) throw error;
        if (!opinion) throw new Error('Görüş bulunamadı.');

        currentOpinion = opinion;

        // Update header
        document.getElementById('opinion-number').textContent = opinion.registration_number || 'Numara Yok';
        document.getElementById('opinion-created-date').textContent = 'Oluşturulma: ' + formatDate(opinion.created_at);
        document.querySelector('title').textContent = opinion.registration_number + ' - Görüş Detayı';

        // Update form fields
        document.getElementById('edit-institution').value = opinion.requesting_institution || '';
        document.getElementById('edit-subject').value = opinion.subject || '';
        document.getElementById('edit-deadline').value = opinion.deadline_date || '';
        document.getElementById('display-ai-suggestion').textContent = opinion.ai_suggestion || 'Öneri yok.';

        // Update status card
        document.getElementById('display-lawyer').textContent = opinion.lawyer_name || 'Atanmadı';
        document.getElementById('display-urgency').textContent = getUrgencyLabel(opinion.urgency);
        document.getElementById('display-urgency').className = 'font-semibold urgency-' + (opinion.urgency || 'medium').toLowerCase();

        const statusBadge = document.getElementById('status-badge');
        statusBadge.textContent = opinion.status === 'OPEN' ? 'Açık' : 'Kapalı';
        statusBadge.className = 'badge ' + (opinion.status === 'OPEN' ? 'badge-active' : 'badge-inactive');

        // Load documents
        await loadOpinionDocuments();

        lucide.createIcons();

    } catch (error) {
        console.error('Load opinion error:', error);
        showToast('Hata: ' + error.message, 'error');
        document.getElementById('opinion-number').innerHTML = '<span style="color:red">Yükleme Hatası</span>';
    }
}

async function loadOpinionDocuments() {
    const container = document.getElementById('documents-list');
    const countEl = document.getElementById('docs-count');

    try {
        const { data: docs, error } = await supabase
            .from('opinion_documents')
            .select('*')
            .eq('opinion_id', opinionId)
            .order('upload_date', { ascending: false });

        if (error) throw error;

        countEl.textContent = `(${docs?.length || 0})`;

        if (!docs || docs.length === 0) {
            container.innerHTML = '<p class="text-muted">Henüz evrak yok.</p>';
            return;
        }

        container.innerHTML = docs.map(doc => `
            <div class="document-item" style="display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid var(--border-color);">
                <i data-lucide="file-text" style="width:20px; color:var(--accent-primary);"></i>
                <div style="flex:1;">
                    <div style="font-weight:500;">${escapeHtml(doc.name)}</div>
                    <div class="text-muted" style="font-size:0.8rem;">${formatDate(doc.upload_date)}</div>
                </div>
                <a href="${doc.public_url}" target="_blank" class="btn btn-ghost btn-sm"><i data-lucide="external-link" style="width:14px;"></i></a>
            </div>
        `).join('');

        lucide.createIcons();

    } catch (error) {
        console.error('Load docs error:', error);
        container.innerHTML = '<p class="text-muted" style="color:red;">Evraklar yüklenemedi.</p>';
    }
}

function setupForm() {
    const form = document.getElementById('opinion-details-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-opinion-btn');
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div> Kaydediliyor...';

        try {
            const updates = {
                requesting_institution: document.getElementById('edit-institution').value,
                subject: document.getElementById('edit-subject').value,
                deadline_date: document.getElementById('edit-deadline').value || null,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('legal_opinions')
                .update(updates)
                .eq('id', opinionId);

            if (error) throw error;

            showToast('Değişiklikler kaydedildi.', 'success');
            await loadOpinionDetails();

        } catch (error) {
            showToast('Hata: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="save"></i> Kaydet';
            lucide.createIcons();
        }
    });
}

async function toggleOpinionStatus() {
    if (!currentOpinion) return;

    const newStatus = currentOpinion.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    const confirmMsg = newStatus === 'CLOSED' ? 'Bu görüşü kapatmak istiyor musunuz?' : 'Bu görüşü yeniden açmak istiyor musunuz?';

    if (!confirm(confirmMsg)) return;

    try {
        const { error } = await supabase
            .from('legal_opinions')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', opinionId);

        if (error) throw error;

        showToast(newStatus === 'CLOSED' ? 'Görüş kapatıldı.' : 'Görüş yeniden açıldı.', 'success');
        await loadOpinionDetails();

    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
    }
}

async function handleDocUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showToast('Evrak yükleniyor...', 'info');

    try {
        const ext = file.name.split('.').pop();
        const fileName = `opinions/${opinionId}/${Date.now()}.${ext}`;

        const { error: upErr } = await supabase.storage.from(APP_CONFIG.storageBucket).upload(fileName, file);
        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage.from(APP_CONFIG.storageBucket).getPublicUrl(fileName);

        const { error: docErr } = await supabase.from('opinion_documents').insert([{
            opinion_id: opinionId,
            name: file.name,
            type: file.type,
            storage_path: fileName,
            public_url: urlData.publicUrl
        }]);

        if (docErr) throw docErr;

        showToast('Evrak yüklendi.', 'success');
        await loadOpinionDocuments();

    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
    }

    event.target.value = ''; // Reset input
}

function openDeleteModal() {
    document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('active');
}

async function confirmDeleteOpinion() {
    try {
        // Delete documents first (cascade should handle but be safe)
        await supabase.from('opinion_documents').delete().eq('opinion_id', opinionId);

        const { error } = await supabase.from('legal_opinions').delete().eq('id', opinionId);
        if (error) throw error;

        showToast('Görüş silindi.', 'success');
        window.location.href = 'opinions.html';

    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
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

// Export for global access
window.initOpinionDetail = initOpinionDetail;
window.toggleOpinionStatus = toggleOpinionStatus;
window.handleDocUpload = handleDocUpload;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteOpinion = confirmDeleteOpinion;
