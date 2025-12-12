// ==========================================
// Lawyer Management Logic
// ==========================================

let lawyers = [];
let selectedLawyerId = null;
let currentFiles = [];

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    await fetchLawyers();
    setupFilters();
    lucide.createIcons();
});

// 1. Fetch & Render Sidebar
async function fetchLawyers() {
    const list = document.getElementById('lawyers-sidebar');
    try {
        lawyers = await getLawyers();
        if (lawyers.length === 0) list.innerHTML = '<div class="p-4 text-center">Kayıtlı avukat yok.</div>';
        else {
            list.innerHTML = lawyers.map(l => `
                <div class="lawyer-list-item ${selectedLawyerId === l.id ? 'active' : ''}" onclick="selectLawyer('${l.id}')">
                    <div>
                        <div class="font-medium">${escapeHtml(l.name)}</div>
                        <div class="text-xs text-muted">@${escapeHtml(l.username)}</div>
                    </div>
                    <span class="badge ${l.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}" style="font-size:0.7em;">
                        ${l.status === 'ACTIVE' ? 'Aktif' : 'İzinde'}
                    </span>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error(e);
        showToast('Avukat listesi yüklenemedi.', 'error');
    }
}

// 2. Select Lawyer & Load Details
async function selectLawyer(id) {
    selectedLawyerId = id;
    const l = lawyers.find(x => x.id === id);
    if (!l) return;

    // UI Updates
    document.getElementById('empty-selection').classList.add('hidden');
    document.getElementById('lawyer-content').classList.remove('hidden');

    document.getElementById('selected-lawyer-name').textContent = l.name;
    const statusText = l.status === 'ACTIVE' ? '🟢 Şu an Aktif (Dosya Alıyor)' : '🔴 İzinde / Pasif (Dosya Almıyor)';
    document.getElementById('selected-lawyer-status').textContent = statusText;
    document.getElementById('lbl-status-action').textContent = l.status === 'ACTIVE' ? 'İzne Çıkar' : 'Aktif Et';

    // Highlight sidebar
    fetchLawyers(); // simpler to redraw to update active class

    // Load Files
    loadLawyerFiles(id);
}

async function loadLawyerFiles(id) {
    const tbody = document.getElementById('lawyer-files-list');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Yükleniyor...</td></tr>';

    try {
        const files = await getFileCases({ lawyerId: id });
        currentFiles = files; // Store for filtering

        // Calculate Stats
        const total = files.length;
        const open = files.filter(f => f.status === 'OPEN').length;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-open').textContent = open;
        document.getElementById('stat-closed').textContent = total - open;

        renderFilesTable(files);

    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Dosyalar yüklenemedi.</td></tr>';
    }
}

// 3. Render Table & Filters
function renderFilesTable(data) {
    const tbody = document.getElementById('lawyer-files-list');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">Dosya bulunamadı.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(f => `
        <tr onclick="window.location.href='file-detail.html?id=${f.id}'" style="cursor:pointer">
            <td>
                <div class="font-medium">${f.registration_number}</div>
                <div class="text-xs text-muted">${f.court_case_number || '-'}</div>
            </td>
            <td>
                <div class="text-sm">${escapeHtml(f.plaintiff || '?')}</div>
                <div class="text-xs text-muted">vs ${escapeHtml(f.defendant || '?')}</div>
            </td>
            <td class="text-sm">${escapeHtml(f.court_name || '-')}</td>
            <td><span class="badge ${f.status === 'OPEN' ? 'badge-active' : 'badge-inactive'}">${f.status}</span></td>
            <td class="text-sm text-right">${formatDate(f.created_at)}</td>
        </tr>
    `).join('');
}

function setupFilters() {
    const searchInput = document.getElementById('filter-search');
    const sortSelect = document.getElementById('filter-sort');

    const applyFilters = () => {
        let filtered = [...currentFiles];
        const term = searchInput.value.toLowerCase();

        if (term) {
            filtered = filtered.filter(f =>
                (f.registration_number || '').toLowerCase().includes(term) ||
                (f.plaintiff || '').toLowerCase().includes(term) ||
                (f.defendant || '').toLowerCase().includes(term) ||
                (f.subject || '').toLowerCase().includes(term) ||
                (f.court_name || '').toLowerCase().includes(term)
            );
        }

        const sortMode = sortSelect.value;
        filtered.sort((a, b) => {
            const dateA = new Date(a.created_at);
            const dateB = new Date(b.created_at);
            return sortMode === 'date-desc' ? dateB - dateA : dateA - dateB;
        });

        renderFilesTable(filtered);
    };

    searchInput.addEventListener('input', applyFilters);
    sortSelect.addEventListener('change', applyFilters);
}

// 4. Actions
async function toggleLawyerStatus() {
    if (!selectedLawyerId) return;
    const l = lawyers.find(x => x.id === selectedLawyerId);
    const newStatus = l.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    if (!confirm(`Avukatın durumunu ${newStatus === 'ACTIVE' ? 'AKTİF' : 'PASİF'} yapmak istiyor musunuz?`)) return;

    try {
        await updateLawyerStatus(selectedLawyerId, newStatus);
        showToast('Durum güncellendi.', 'success');
        // Refresh
        await fetchLawyers(); // Update sidebar
        selectLawyer(selectedLawyerId); // Update header
    } catch (e) {
        showToast('Güncellenemedi.', 'error');
    }
}

async function handleCreateLawyer(e) {
    e.preventDefault();
    const name = document.getElementById('new-name').value;
    const user = document.getElementById('new-username').value;
    const pass = document.getElementById('new-password').value;

    try {
        await createLawyer(name, user, pass);
        showToast('Avukat oluşturuldu.', 'success');
        document.getElementById('add-lawyer-modal').classList.remove('active');
        e.target.reset();
        fetchLawyers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
