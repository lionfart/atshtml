// ==========================================
// Lawyer Dashboard - Adalet Takip Sistemi
// ==========================================

let lawyerId = null;

// ==========================================
// Initialization
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Get lawyer ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    lawyerId = urlParams.get('id');

    if (!lawyerId) {
        showToast('Avukat ID bulunamadı.', 'error');
        window.location.href = 'index.html';
        return;
    }

    // Initialize Supabase
    const supabaseReady = initSupabase();

    if (supabaseReady) {
        await loadLawyerData();
    }
});

// ==========================================
// Load Lawyer Data
// ==========================================

async function loadLawyerData() {
    try {
        // Get lawyer info
        const lawyer = await getLawyerById(lawyerId);

        if (!lawyer) {
            showToast('Avukat bulunamadı.', 'error');
            window.location.href = 'index.html';
            return;
        }

        // Update header
        document.getElementById('lawyer-name').textContent = lawyer.name;
        document.title = lawyer.name + ' - Adalet Takip Sistemi';

        const statusEl = document.getElementById('lawyer-status');
        statusEl.textContent = lawyer.status === 'ACTIVE' ? 'Aktif' : 'İzinli';
        statusEl.className = 'badge ' + (lawyer.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive');

        if (lawyer.status === 'ON_LEAVE' && lawyer.leave_return_date) {
            document.getElementById('lawyer-return-date').textContent = 'Dönüş: ' + formatDate(lawyer.leave_return_date);
        }

        // Get lawyer's files
        const files = await getFileCases({ lawyerId: lawyerId });

        // Calculate stats
        const totalFiles = files.length;
        const openFiles = files.filter(f => f.status === 'OPEN').length;
        const closedFiles = files.filter(f => f.status === 'CLOSED').length;

        document.getElementById('stat-total').textContent = totalFiles;
        document.getElementById('stat-open-closed').textContent = `${openFiles} Açık, ${closedFiles} Kapalı`;

        // Calculate decision stats
        const decisions = {};
        files.forEach(f => {
            if (f.latest_decision_result) {
                const key = f.latest_decision_result.toUpperCase();
                decisions[key] = (decisions[key] || 0) + 1;
            }
        });

        const decisionsEl = document.getElementById('decisions-content');
        const decisionEntries = Object.entries(decisions);

        if (decisionEntries.length > 0) {
            decisionsEl.innerHTML = decisionEntries.slice(0, 4).map(([key, val]) => `
                <div class="flex justify-between" style="font-size: var(--font-size-sm); margin-bottom: var(--space-1);">
                    <span class="text-secondary" style="text-transform: capitalize;">
                        ${key.replace('DAVA ', '').replace('TAZMİNAT ', '').toLowerCase()}
                    </span>
                    <span class="font-semibold">${val}</span>
                </div>
            `).join('');
        } else {
            decisionsEl.innerHTML = '<p class="text-muted" style="font-size: var(--font-size-sm);">Henüz karar yok.</p>';
        }

        // Recent files table
        const recentFiles = files.slice(0, 5);
        const tbody = document.getElementById('recent-files-body');

        if (recentFiles.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center" style="padding: var(--space-8);">
                        <div class="empty-state">
                            <i data-lucide="folder-open"></i>
                            <p>Dosya yok.</p>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = recentFiles.map(file => `
                <tr>
                    <td class="font-semibold">${escapeHtml(file.registration_number)}</td>
                    <td>${escapeHtml(file.plaintiff)}</td>
                    <td class="hide-mobile td-truncate">${escapeHtml(file.subject || '')}</td>
                    <td>
                        <span class="badge badge-outline">${escapeHtml(file.latest_activity_type || 'Yeni')}</span>
                    </td>
                    <td class="text-right">
                        <a href="file-detail.html?id=${file.id}" class="btn btn-ghost btn-sm">
                            İncele
                        </a>
                    </td>
                </tr>
            `).join('');
        }

        lucide.createIcons();

    } catch (error) {
        console.error('Failed to load lawyer data:', error);
        showToast('Veriler yüklenemedi: ' + error.message, 'error');
    }
}
