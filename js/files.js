// ==========================================
// Files Page - Adalet Takip Sistemi
// ==========================================

// Debounced search handler
const handleSearchDebounced = debounce(() => {
    loadFiles();
}, 300);

// ==========================================
// Initialization
// ==========================================

const initPage = async () => {
    // Initialize Supabase
    const supabaseReady = initSupabase();

    if (supabaseReady) {
        await loadFiles();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
} else {
    initPage();
}

// ==========================================
// Load Files
// ==========================================

// ==========================================
// Load Files
// ==========================================

async function loadFiles() {
    const tbody = document.getElementById('files-table-body');
    if (!tbody) return;

    // Show loading
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center" style="padding: 40px;">
                <div class="loading-placeholder" style="display:flex; flex-direction:column; align-items:center; gap:10px; color:var(--text-muted);">
                    <i data-lucide="loader" class="spin" style="width:32px; height:32px;"></i>
                    <span>Dosyalar Yükleniyor...</span>
                </div>
            </td>
        </tr>
    `;
    lucide.createIcons();

    try {
        const searchTerm = document.getElementById('search-input')?.value || '';
        const statusFilter = document.getElementById('filter-status')?.value || '';
        const sortFilter = document.getElementById('filter-sort')?.value || 'date-desc';

        // Fetch all (Supabase JS client might not support complex OR+Sort easily in one go without RPC, 
        // but let's try to do basic filtering on client side if result < 100, 
        // or improve getFileCases for server side)

        // Let's pass options to getFileCases
        const files = await getFileCases({
            search: searchTerm,
            status: statusFilter,
            sort: sortFilter
        });

        if (files.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center" style="padding: 40px;">
                        <div class="empty-state" style="opacity:0.7;">
                            <i data-lucide="folder-open" style="width:48px; height:48px; margin-bottom:10px;"></i>
                            <p>Kriterlere uygun dosya bulunamadı.</p>
                        </div>
                    </td>
                </tr>
            `;
            lucide.createIcons();
            return;
        }

        tbody.innerHTML = files.map(file => `
            <tr onclick="window.location.href='file-detail.html?id=${file.id}'" style="cursor:pointer;">
                <td class="font-semibold" style="color:var(--accent-primary);">${escapeHtml(file.registration_number)}</td>
                <td>
                    <div style="font-weight:500;">${escapeHtml(file.plaintiff || '-')}</div>
                    <div style="font-size:0.8em; opacity:0.7;">vs ${escapeHtml(file.defendant || '-')}</div>
                </td>
                <td class="hide-mobile td-truncate" style="max-width:200px;">
                    <div class="text-truncate">${escapeHtml(file.subject || '-')}</div>
                </td>
                <td>
                     <div class="flex items-center gap-2" style="flex-direction: row; flex-wrap:wrap;">
                        <span class="badge ${file.status === 'OPEN' ? 'badge-active' : 'badge-inactive'}">
                            ${file.status === 'OPEN' ? 'Açık' : 'Kapalı'}
                        </span>
                        ${file.court_decision_number ? `<span class="badge" style="background:rgba(139, 92, 246, 0.2); color:var(--accent-primary); font-size:0.7em;">${escapeHtml(file.court_decision_number)}</span>` : ''}
                    </div>
                </td>
                <td>${escapeHtml(file.lawyer_name || 'Atanmamış')}</td>
                <td style="font-family:monospace; font-size:0.9em;">${formatDate(file.created_at)}</td>
                <td class="text-right">
                    <button class="btn btn-ghost btn-sm">
                        <i data-lucide="chevron-right"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        lucide.createIcons();

    } catch (error) {
        console.error('Failed to load files:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: 20px; color:var(--accent-danger);">
                    <i data-lucide="alert-circle" style="vertical-align:middle; margin-right:5px;"></i>
                    Yükleme Hatası: ${error.message}
                </td>
            </tr>
        `;
        lucide.createIcons();
    }
}
