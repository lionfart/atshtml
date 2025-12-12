// ==========================================
// Files Page - Adalet Takip Sistemi (v2.0)
// ==========================================

// Debounced search handler
const handleSearchDebounced = debounce(() => {
    loadFiles();
}, 300);

// ==========================================
// Initialization
// ==========================================

const initPage = async () => {
    console.log('[Files] Sayfa başlatılıyor...');

    // Initialize Supabase
    const supabaseReady = initSupabase();
    console.log('[Files] Supabase hazır:', supabaseReady);

    if (supabaseReady) {
        // Load immediately
        loadFiles();
    } else {
        // Retry after delay
        setTimeout(() => {
            console.log('[Files] Supabase tekrar deneniyor...');
            if (initSupabase()) {
                loadFiles();
            } else {
                document.getElementById('files-table-body').innerHTML = `
                    <tr><td colspan="9" class="text-center" style="padding:40px; color:var(--accent-danger);">
                        <i data-lucide="wifi-off" style="width:32px; height:32px;"></i>
                        <div style="margin-top:10px;">Veritabanına bağlanılamadı. Lütfen sayfayı yenileyin.</div>
                    </td></tr>`;
                lucide.createIcons();
            }
        }, 1000);
    }
};

// Robust initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
} else {
    initPage();
}

// Also try on window load as fallback
window.addEventListener('load', () => {
    const tbody = document.getElementById('files-table-body');
    if (tbody && tbody.querySelector('.loading-placeholder')) {
        console.log('[Files] Window load fallback triggered');
        loadFiles();
    }
});

// ==========================================
// Load Files with Enhanced Columns
// ==========================================

async function loadFiles(retryCount = 0) {
    const tbody = document.getElementById('files-table-body');
    if (!tbody) return;

    console.log('[Files] loadFiles called, attempt:', retryCount);

    // Show loader only on first try
    if (retryCount === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 40px;">
                    <div class="loading-placeholder" style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                        <i data-lucide="loader" class="spin" style="width:32px; height:32px; color:var(--accent-primary);"></i>
                        <span style="color:var(--text-muted);">Dosyalar Yükleniyor...</span>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();
    }

    try {
        const searchTerm = document.getElementById('search-input')?.value || '';
        const statusFilter = document.getElementById('filter-status')?.value || '';
        const sortFilter = document.getElementById('filter-sort')?.value || 'date-desc';

        console.log('[Files] Fetching with filters:', { searchTerm, statusFilter, sortFilter });

        const files = await getFileCases({
            search: searchTerm,
            status: statusFilter,
            sort: sortFilter
        });

        console.log('[Files] Received files:', files?.length || 0);

        // Update count
        const countEl = document.getElementById('file-count-info');
        if (countEl) countEl.textContent = `Toplam: ${files?.length || 0} dosya`;

        // Handle empty state with retry logic removed (trust the data)
        if (!files || files.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center" style="padding: 40px;">
                        <div class="empty-state" style="opacity:0.7;">
                            <i data-lucide="folder-open" style="width:48px; height:48px; margin-bottom:10px; color:var(--text-muted);"></i>
                            <p style="color:var(--text-muted);">Henüz dosya yok veya kriterlere uygun dosya bulunamadı.</p>
                            <a href="index.html" class="btn btn-primary btn-sm" style="margin-top:15px;">
                                <i data-lucide="plus"></i> Yeni Evrak Yükle
                            </a>
                        </div>
                    </td>
                </tr>
            `;
            lucide.createIcons();
            return;
        }

        // Render enhanced table
        tbody.innerHTML = files.map(file => {
            const displayNo = escapeHtml(file.registration_number || file.court_case_number || '-');
            const plaintiff = escapeHtml(file.plaintiff || '-');
            const defendant = escapeHtml(file.defendant || '-');
            const subject = escapeHtml(truncateText(file.subject, 40) || '-');
            const amount = escapeHtml(file.claim_amount || '-');
            const statusClass = file.status === 'OPEN' ? 'badge-active' : 'badge-inactive';
            const statusText = file.status === 'OPEN' ? 'Açık' : 'Kapalı';
            const decision = file.latest_decision_result ? escapeHtml(file.latest_decision_result) : '<span style="opacity:0.4">-</span>';
            const lastDocType = file.latest_activity_type ? escapeHtml(file.latest_activity_type) : '<span style="opacity:0.4">-</span>';
            const lawyer = escapeHtml(file.lawyer_name || 'Atanmamış');
            const date = formatDate(file.created_at);

            return `
            <tr onclick="window.location.href='file-detail.html?id=${file.id}'">
                <td class="col-no" style="font-weight:600; color:var(--accent-primary);">${displayNo}</td>
                <td class="col-parties">
                    <div style="font-weight:500;">${plaintiff}</div>
                    <div style="font-size:0.8em; opacity:0.7;">vs ${defendant}</div>
                </td>
                <td class="col-subject cell-truncate" title="${escapeHtml(file.subject || '')}">${subject}</td>
                <td class="col-amount" style="font-family:monospace;">${amount}</td>
                <td class="col-status"><span class="badge ${statusClass}">${statusText}</span></td>
                <td class="col-decision">${decision}</td>
                <td class="col-doc" style="font-size:0.85em;">${lastDocType}</td>
                <td class="col-lawyer">${lawyer}</td>
                <td class="col-date" style="font-family:monospace; font-size:0.85em;">${date}</td>
            </tr>
        `}).join('');

        lucide.createIcons();

    } catch (error) {
        console.error('[Files] Load Error:', error);

        // Retry on error
        if (retryCount < 3) {
            console.log('[Files] Retrying in 1s...');
            setTimeout(() => loadFiles(retryCount + 1), 1000);
            return;
        }

        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 40px; color:var(--accent-danger);">
                    <i data-lucide="alert-circle" style="width:32px; height:32px; margin-bottom:10px;"></i>
                    <div>Yükleme Hatası: ${escapeHtml(error.message)}</div>
                    <button onclick="loadFiles()" class="btn btn-outline btn-sm" style="margin-top:15px;">
                        <i data-lucide="refresh-cw"></i> Tekrar Dene
                    </button>
                </td>
            </tr>
        `;
        lucide.createIcons();
    }
}

// Make loadFiles globally accessible
window.loadFiles = loadFiles;
window.handleSearchDebounced = handleSearchDebounced;
