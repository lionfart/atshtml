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

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Supabase
    const supabaseReady = initSupabase();

    if (supabaseReady) {
        await loadFiles();
    }
});

// ==========================================
// Load Files
// ==========================================

async function loadFiles() {
    const tbody = document.getElementById('files-table-body');
    if (!tbody) return;

    // Show loading
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center" style="padding: var(--space-8);">
                <div class="loading-placeholder">
                    <div class="spinner"></div>
                    <span>Yükleniyor...</span>
                </div>
            </td>
        </tr>
    `;

    try {
        const searchTerm = document.getElementById('search-input')?.value || '';

        const files = await getFileCases({
            search: searchTerm
        });

        if (files.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center" style="padding: var(--space-8);">
                        <div class="empty-state">
                            <i data-lucide="folder-open"></i>
                            <p>Dosya bulunamadı.</p>
                        </div>
                    </td>
                </tr>
            `;
            lucide.createIcons();
            return;
        }

        tbody.innerHTML = files.map(file => `
            <tr>
                <td class="font-semibold">${escapeHtml(file.registration_number)}</td>
                <td>${escapeHtml(file.plaintiff)}</td>
                <td class="hide-mobile td-truncate">${escapeHtml(file.subject || '')}</td>
                <td>
                    <div class="flex items-center gap-2" style="flex-direction: column; align-items: flex-start;">
                        ${file.latest_activity_type ? `
                            <span class="text-muted" style="font-size: var(--font-size-xs);">
                                ${escapeHtml(file.latest_activity_type)}
                            </span>
                        ` : ''}
                        ${file.latest_decision_result ? `
                            <span class="badge ${getDecisionBadgeClass(file.latest_decision_result)}">
                                ${escapeHtml(file.latest_decision_result)}
                            </span>
                        ` : ''}
                    </div>
                </td>
                <td>${escapeHtml(file.lawyer_name || 'Atanmamış')}</td>
                <td>${formatDate(file.created_at)}</td>
                <td class="text-right">
                    <a href="file-detail.html?id=${file.id}" class="btn btn-ghost btn-sm">
                        <i data-lucide="eye"></i>
                        <span class="hide-mobile">İncele</span>
                    </a>
                </td>
            </tr>
        `).join('');

        lucide.createIcons();

    } catch (error) {
        console.error('Failed to load files:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: var(--space-8);">
                    <div class="empty-state">
                        <i data-lucide="alert-circle"></i>
                        <p>Dosyalar yüklenemedi: ${error.message}</p>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();
    }
}
