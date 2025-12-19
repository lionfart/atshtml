// ==========================================
// Files Page - Adalet Takip Sistemi (v2.1)
// ==========================================

// Global State
let columnOrder = JSON.parse(localStorage.getItem('filesColumnOrder')) || [
    'col-no', 'col-parties', 'col-tags', 'col-subject', 'col-amount', 'col-status', 'col-decision', 'col-doc', 'col-lawyer', 'col-date'
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
    initTableResizing();
    initRowClicks();
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
        preventOnFilter: true, // CRITICAL: Prevent drag when clicking resize handle
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

// Rename to match usage in loadFiles
function initTableResizing() {
    const headers = document.querySelectorAll('th');
    console.log('[Resizing] Initializing for', headers.length, 'headers');

    headers.forEach(th => {
        const handle = th.querySelector('.resize-handle');
        if (!handle) return;

        // Remove old listener to prevent duplicates (cloning)
        const newHandle = handle.cloneNode(true);
        handle.parentNode.replaceChild(newHandle, handle);

        let startX, startWidth;

        // Use CAPTURE phase to intercept event BEFORE SortableJS
        newHandle.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            startX = e.pageX;
            startWidth = th.offsetWidth;
            console.log('[Resizing] Started on', th.getAttribute('data-id'), 'width:', startWidth);

            newHandle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none'; // Prevent text selection while dragging

            function onMouseMove(e) {
                e.preventDefault();
                const diff = e.pageX - startX;
                const newWidth = Math.max(50, startWidth + diff);
                th.style.width = newWidth + 'px';
                th.style.minWidth = newWidth + 'px';
            }

            function onMouseUp() {
                console.log('[Resizing] Ended. New width:', th.style.width);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                newHandle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Save widths to localStorage
                const widths = {};
                document.querySelectorAll('th').forEach(h => {
                    const id = h.getAttribute('data-id');
                    if (id) widths[id] = h.style.width;
                });
                localStorage.setItem('filesColumnWidths', JSON.stringify(widths));
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }, true); // CAPTURE PHASE - runs before SortableJS bubble phase
    });

    // Apply saved widths
    const savedWidths = JSON.parse(localStorage.getItem('filesColumnWidths'));
    if (savedWidths) {
        headers.forEach(th => {
            const id = th.getAttribute('data-id');
            if (savedWidths[id]) {
                th.style.width = savedWidths[id];
                th.style.minWidth = savedWidths[id];
            }
        });
    }
}

function applyColumnOrder() {
    const headerRow = document.getElementById('table-headers');
    if (!headerRow) return;

    // Detach all headers
    const headers = Array.from(headerRow.children);
    const headerMap = {};
    headers.forEach(h => headerMap[h.getAttribute('data-id')] = h);

    // Append any missing headers (if schema changed)
    headers.forEach(h => {
        const id = h.getAttribute('data-id');
        if (!columnOrder.includes(id)) {
            // Special handling for col-tags: insert after col-parties if possible
            if (id === 'col-tags') {
                const partiesIndex = columnOrder.indexOf('col-parties');
                if (partiesIndex !== -1) {
                    columnOrder.splice(partiesIndex + 1, 0, id);
                } else {
                    columnOrder.push(id);
                }
            } else {
                columnOrder.push(id);
            }
        }
    });

    // Save updated order
    localStorage.setItem('filesColumnOrder', JSON.stringify(columnOrder));

    // Clear and append in order
    headerRow.innerHTML = '';
    columnOrder.forEach(id => {
        // Only append if the header element actually exists in the DOM
        const headerEl = headers.find(h => h.getAttribute('data-id') === id);
        if (headerEl) headerRow.appendChild(headerEl);
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
        case 'col-tags':
            let tagsHtml = '';
            if (file.primary_tag) tagsHtml += `<span class="badge" style="background:var(--accent-primary); color:white; font-size:0.7em; margin-right:4px;">${esc(file.primary_tag)}</span>`;
            if (file.tags && Array.isArray(file.tags)) {
                file.tags.forEach(t => {
                    tagsHtml += `<span class="badge" style="background:#e5e7eb; color:#374151; font-size:0.7em; margin-right:2px;">${esc(t)}</span>`;
                });
            }
            return tagsHtml || '<span style="opacity:0.4">-</span>';
        case 'col-amount': return `<span style="font-family:monospace;">${esc(file.claim_amount || '-')}</span>`;
        case 'col-status':
            const sClass = file.status === 'OPEN' ? 'badge-active' : 'badge-inactive';
            const sText = file.status === 'OPEN' ? 'Açık' : 'Kapalı';
            return `<span class="badge ${sClass}">${sText}</span>`;
        case 'col-decision':
            if (file.latest_decision_result) {
                const color = file.latest_decision_result.toLowerCase().includes('red') ? 'var(--accent-danger)' :
                    file.latest_decision_result.toLowerCase().includes('kabul') ? 'var(--accent-success)' : 'var(--text-primary)';
                return `<span style="font-weight:600; color:${color}">${esc(file.latest_decision_result)}</span>`;
            }
            return '<span style="opacity:0.4">-</span>';
        case 'col-doc':
            if (!file.latest_activity_type) return '<span style="opacity:0.4">-</span>';
            const tooltip = file.latest_activity_summary ? `data-tooltip="${escapeHtml(file.latest_activity_summary.substring(0, 200)) + (file.latest_activity_summary.length > 200 ? '...' : '')}"` : '';
            return `<span style="font-size:0.85em;" ${tooltip}>${esc(file.latest_activity_type)}</span>`;
        case 'col-lawyer':
            const lName = file.lawyers?.name || 'Atanmamış';
            const lStatus = file.lawyers?.status;
            let lStyle = 'color:var(--text-primary);';
            if (lStatus === 'ON_LEAVE') lStyle = 'color:var(--text-muted); opacity:0.7;'; // Pale gray
            else if (lStatus === 'ACTIVE') lStyle = 'color:var(--accent-success); opacity:0.9;'; // Pale green
            return `<span style="${lStyle}">${esc(lName)}</span>`;
        case 'col-date':
            if (file.next_hearing_date) {
                return `<div style="color:var(--accent-warning); font-size:0.85em; font-weight:600;"><i data-lucide="calendar" style="width:12px;display:inline;"></i> ${formatDate(file.next_hearing_date)}</div>`;
            } else if (file.deadline_date) {
                return `<div style="color:var(--accent-danger); font-size:0.85em; font-weight:600;"><i data-lucide="alarm-clock" style="width:12px;display:inline;"></i> ${formatDate(file.deadline_date)}</div>`;
            }
            return `<span style="font-family:monospace; font-size:0.85em;">${formatDate(file.created_at)}</span>`;
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

        return `<tr data-file-id="${file.id}">${cells}</tr>`;
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

        let query = supabase
            .from('file_cases')
            .select(`
                *,
                lawyers (id, name, status)
            `)
            .order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        // Client-side filtering for search (simpler than complex OR query)
        let filteredData = data;
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filteredData = data.filter(item => {
                const searchableFields = [
                    item.court_case_number,
                    item.plaintiff,
                    item.defendant,
                    item.subject,
                    item.court_name,
                    item.primary_tag,
                    ...(item.tags || [])
                ];
                return searchableFields.some(field => field && String(field).toLowerCase().includes(lowerTerm));
            });
        }

        if (statusFilter) {
            filteredData = filteredData.filter(item => item.status === statusFilter);
        }

        // Sorting
        filteredData.sort((a, b) => {
            const dateA = new Date(a.created_at || 0);
            const dateB = new Date(b.created_at || 0);
            if (sortFilter === 'date-asc') return dateA - dateB;
            if (sortFilter === 'date-desc') return dateB - dateA;
            // Add more sort options if needed
            return 0;
        });

        loadedFilesData = filteredData; // Cache data

        // Update count
        if (document.getElementById('file-count-info'))
            document.getElementById('file-count-info').textContent = `Toplam: ${filteredData.length} dosya`;

        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 40px;"><p style="opacity:0.7;">Dosya bulunamadı.</p></td></tr>`;
            return;
        }

        renderTableRows(); // Render using stored column order
        initTableResizing(); // Re-init resizing after render

    } catch (error) {
        console.error('[Files] Load Error:', error);
        if (retryCount < 3) {
            setTimeout(() => loadFiles(retryCount + 1), 1000);
        } else {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:red;">Hata: ${escapeHtml(error.message)}</td></tr>`;
        }
    }
}

function initRowClicks() {
    const tbody = document.getElementById('files-table-body');
    if (!tbody) return;
    tbody.addEventListener('click', (e) => {
        const tr = e.target.closest('tr');
        if (tr) {
            const id = tr.getAttribute('data-file-id');
            console.log('[Files] Row clicked, ID:', id);

            if (id && id !== 'undefined' && id !== 'null') {
                sessionStorage.setItem('currentFileId', id);
                window.location.href = `file-detail.html?id=${id}`;
            } else {
                alert('HATA: Geçersiz Dosya ID! Lütfen sayfayı yenileyin.');
                console.error('[Files] Invalid ID clicked:', id);
            }
        }
    });
}

window.loadFiles = loadFiles;
window.handleSearchDebounced = handleSearchDebounced;
