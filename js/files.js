// ==========================================
// Files Page - Adalet Takip Sistemi (v2.1)
// ==========================================

// Global State
let columnOrder = JSON.parse(localStorage.getItem('filesColumnOrder')) || [
    'col-no', 'col-parties', 'col-subject', 'col-amount', 'col-status', 'col-decision', 'col-doc', 'col-lawyer', 'col-date'
];
let loadedFilesData = []; // Store data for re-rendering without refetching

// Debounced search handler
const handleSearchDebounced = debounce(() => {
    loadFiles();
}, 300);

// ==========================================
// Initialization
// ==========================================

const initPage = async () => {
    console.log('[Files] Sayfa başlatılıyor v2.1...');

    // Initialize Column Features (Drag & Resize)
    initTableFeatures();

    // Initialize Supabase
    const supabaseReady = initSupabase();

    if (supabaseReady) {
        loadFiles();
    } else {
        setTimeout(() => {
            if (initSupabase()) loadFiles();
            else {
                document.getElementById('files-table-body').innerHTML = `
                    <tr><td colspan="9" class="text-center" style="padding:40px; color:var(--accent-danger);">
                        <i data-lucide="wifi-off"></i> Veritabanı hatası.
                    </td></tr>`;
                lucide.createIcons();
            }
        }, 1000);
    }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPage);
else initPage();

// ==========================================
// Smart Table Features (Drag & Resize)
// ==========================================

function initTableFeatures() {
    initColumnDragging();
    initColumnResizing();
    applyColumnOrder(); // Apply saved order on init
}

function initColumnDragging() {
    const headerRow = document.getElementById('table-headers');
    if (!headerRow) return;

    new Sortable(headerRow, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        handle: 'th', // Drag by whole header
        filter: '.resize-handle', // Don't drag when resizing
        onEnd: function (evt) {
            // Update column order array based on DOM
            const newOrder = [];
            headerRow.querySelectorAll('th').forEach(th => {
                newOrder.push(th.getAttribute('data-id'));
            });
            columnOrder = newOrder;
            localStorage.setItem('filesColumnOrder', JSON.stringify(columnOrder));

            // Re-render body rows to match new header order
            renderTableRows();
        }
    });
}

function initColumnResizing() {
    const headers = document.querySelectorAll('th');

    headers.forEach(th => {
        const handle = th.querySelector('.resize-handle');
        if (!handle) return;

        let startX, startWidth;

        handle.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation(); // Stop sorting

            startX = e.pageX;
            startWidth = th.offsetWidth;

            handle.classList.add('active');
            document.body.style.cursor = 'col-resize';

            function onMouseMove(e) {
                const diff = e.pageX - startX;
                // Min width 50px
                const newWidth = Math.max(50, startWidth + diff);
                th.style.width = newWidth + 'px';
                th.style.minWidth = newWidth + 'px'; // Enforce
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                handle.classList.remove('active');
                document.body.style.cursor = '';

                // Save widths (optional - for now just resizing session based)
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
}

function applyColumnOrder() {
    const headerRow = document.getElementById('table-headers');
    if (!headerRow) return;

    // Detach all headers
    const headers = Array.from(headerRow.children);
    const headerMap = {};
    headers.forEach(h => headerMap[h.getAttribute('data-id')] = h);

    // Clear and append in order
    headerRow.innerHTML = '';
    columnOrder.forEach(id => {
        if (headerMap[id]) headerRow.appendChild(headerMap[id]);
    });

    // Append any missing headers (if schema changed)
    headers.forEach(h => {
        if (!columnOrder.includes(h.getAttribute('data-id'))) {
            headerRow.appendChild(h);
            columnOrder.push(h.getAttribute('data-id'));
        }
    });
}

// ==========================================
// Data Rendering
// ==========================================

// Helper to get cell content by column ID
function getCellContent(file, colId) {
    const esc = escapeHtml;
    switch (colId) {
        case 'col-no': return `<span style="font-weight:600; color:var(--accent-primary);">${esc(file.registration_number || file.court_case_number || '-')}</span>`;
        case 'col-parties': return `<div style="font-weight:500;">${esc(file.plaintiff || '-')}</div><div style="font-size:0.8em; opacity:0.7;">vs ${esc(file.defendant || '-')}</div>`;
        case 'col-subject': return `<div class="cell-truncate" title="${esc(file.subject)}">${esc(file.subject || '-')}</div>`;
        case 'col-amount': return `<span style="font-family:monospace;">${esc(file.claim_amount || '-')}</span>`;
        case 'col-status':
            const sClass = file.status === 'OPEN' ? 'badge-active' : 'badge-inactive';
            const sText = file.status === 'OPEN' ? 'Açık' : 'Kapalı';
            return `<span class="badge ${sClass}">${sText}</span>`;
        case 'col-decision': return file.latest_decision_result ? esc(file.latest_decision_result) : '<span style="opacity:0.4">-</span>';
        case 'col-doc': return file.latest_activity_type ? `<span style="font-size:0.85em;">${esc(file.latest_activity_type)}</span>` : '<span style="opacity:0.4">-</span>';
        case 'col-lawyer': return esc(file.lawyer_name || 'Atanmamış');
        case 'col-date': return `<span style="font-family:monospace; font-size:0.85em;">${formatDate(file.created_at)}</span>`;
        default: return '-';
    }
}

function renderTableRows() {
    const tbody = document.getElementById('files-table-body');
    if (!tbody) return;

    if (loadedFilesData.length === 0) {
        // Empty state logic handled in loadFiles
        return;
    }

    const html = loadedFilesData.map(file => {
        // Build TD cells based on columnOrder
        const cells = columnOrder.map(colId => {
            return `<td class="${colId}">${getCellContent(file, colId)}</td>`;
        }).join('');

        return `<tr onclick="window.location.href='file-detail.html?id=${file.id}'">${cells}</tr>`;
    }).join('');

    tbody.innerHTML = html;
    lucide.createIcons();
}

async function loadFiles(retryCount = 0) {
    const tbody = document.getElementById('files-table-body');
    if (!tbody) return;

    if (retryCount === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:40px;"><div class="loading-placeholder"><i data-lucide="loader" class="spin"></i> <span>Yükleniyor...</span></div></td></tr>`;
        lucide.createIcons();
    }

    try {
        const searchTerm = document.getElementById('search-input')?.value || '';
        const statusFilter = document.getElementById('filter-status')?.value || '';
        const sortFilter = document.getElementById('filter-sort')?.value || 'date-desc';

        const files = await getFileCases({ search: searchTerm, status: statusFilter, sort: sortFilter });

        loadedFilesData = files; // Cache data

        // Update count
        if (document.getElementById('file-count-info'))
            document.getElementById('file-count-info').textContent = `Toplam: ${files.length} dosya`;

        if (files.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 40px;"><p style="opacity:0.7;">Dosya bulunamadı.</p></td></tr>`;
            return;
        }

        renderTableRows(); // Render using stored column order

    } catch (error) {
        console.error('[Files] Load Error:', error);
        if (retryCount < 3) {
            setTimeout(() => loadFiles(retryCount + 1), 1000);
        } else {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:red;">Hata: ${escapeHtml(error.message)}</td></tr>`;
        }
    }
}

window.loadFiles = loadFiles;
window.handleSearchDebounced = handleSearchDebounced;
