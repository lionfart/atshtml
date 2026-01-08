// ==========================================
// Files Page - Adalet Takip Sistemi (v2.1)
// ==========================================

// Global State
let columnOrder = JSON.parse(localStorage.getItem('filesColumnOrder')) || [
    'col-no', 'col-parties', 'col-vekil', 'col-tags', 'col-subject', 'col-amount', 'col-onem', 'col-status', 'col-decision', 'col-doc', 'col-lawyer', 'col-date'
];
let loadedFilesData = []; // Store data for re-rendering without refetching
let docSearchIds = null; // Global state for document content search

// Debounced search handler
const handleSearchDebounced = debounce(() => {
    loadFiles();
}, 300);

// ==========================================
// Initialization
// ==========================================

const initPage = async () => {
    console.log('[Files] Sayfa baÅŸlatÄ±lÄ±yor v2.1...');

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
                        <i data-lucide="wifi-off"></i> VeritabanÄ± hatasÄ±.
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
    initTooltips();
    applyColumnOrder(); // Apply saved order on init
}

// Tooltip system for data-tooltip attributes
function initTooltips() {
    let tooltipBox = null;

    document.addEventListener('mouseover', function (e) {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;

        const text = target.getAttribute('data-tooltip');
        if (!text) return;

        // Create tooltip box if not exists
        if (!tooltipBox) {
            tooltipBox = document.createElement('div');
            tooltipBox.className = 'tooltip-box';
            document.body.appendChild(tooltipBox);
        }

        tooltipBox.textContent = text;
        tooltipBox.style.display = 'block';
    });

    document.addEventListener('mousemove', function (e) {
        if (tooltipBox && tooltipBox.style.display === 'block') {
            tooltipBox.style.left = (e.clientX + 15) + 'px';
            tooltipBox.style.top = (e.clientY - 40) + 'px';
        }
    });

    document.addEventListener('mouseout', function (e) {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;

        if (tooltipBox) {
            tooltipBox.style.display = 'none';
        }
    });
}

function initColumnDragging() {
    const headerRow = document.getElementById('table-headers');
    if (!headerRow) return;

    new Sortable(headerRow, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        handle: '.drag-handle', // ONLY drag by the â‹® handle, not the whole th
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
            // Only respond to LEFT click (button 0)
            if (e.button !== 0) return;

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
    const hiddenCols = JSON.parse(localStorage.getItem('filesHiddenColumns') || '[]');

    columnOrder.forEach(id => {
        // Append ALL headers but hide if in hiddenCols
        // This ensures they are still in DOM for renderColumnToggleMenu to find
        const headerEl = headers.find(h => h.getAttribute('data-id') === id);
        if (headerEl) {
            if (hiddenCols.includes(id)) {
                headerEl.style.display = 'none';
            } else {
                headerEl.style.removeProperty('display');
            }
            headerRow.appendChild(headerEl);
        }
    });

    // Update table body visibility based on hidden columns
    renderTableRows(); // Re-render table body to respect hidden columns
}

// Column Visibility Toggle Logic
function toggleColumnMenu(event) {
    const menu = document.getElementById('column-menu');

    // Move to body to ensure fixed positioning works as expected (avoiding stacking contexts)
    if (menu.parentElement !== document.body) {
        document.body.appendChild(menu);
    }

    if (menu.style.display === 'none') {
        renderColumnToggleMenu();

        // Calculate position using fixed to escape stacking contexts
        if (event) {
            const btn = event.currentTarget || document.getElementById('btn-toggle-columns');
            const rect = btn.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.top = (rect.bottom + 5) + 'px';
            menu.style.left = 'auto'; // Clear any left
            menu.style.right = (window.innerWidth - rect.right) + 'px';
            menu.style.zIndex = '99999';
        }

        menu.style.display = 'block';
    } else {
        menu.style.display = 'none';
        menu.innerHTML = ''; // Clear for fresh render next time
    }
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('column-menu');
    const btn = e.target.closest('#btn-toggle-columns');
    if (menu && menu.style.display === 'block' && !menu.contains(e.target) && !btn) {
        menu.style.display = 'none';
    }
});

function renderColumnToggleMenu() {
    const menu = document.getElementById('column-menu');
    const allHeaders = Array.from(document.querySelectorAll('#table-headers th'));
    const hiddenCols = JSON.parse(localStorage.getItem('filesHiddenColumns') || '[]');

    menu.innerHTML = allHeaders.map(th => {
        const id = th.getAttribute('data-id');
        const label = th.childNodes[1] ? th.childNodes[1].textContent.trim() : th.textContent.trim();
        const isChecked = !hiddenCols.includes(id);

        return `
            <label style="display:flex; align-items:center; gap:8px; padding:4px 8px; cursor:pointer; font-size:0.85rem; color:var(--text-primary);">
                <input type="checkbox" onchange="toggleColumn('${id}', this.checked)" ${isChecked ? 'checked' : ''}>
                ${label}
            </label>
        `;
    }).join('');
}

function toggleColumn(colId, isVisible) {
    let hiddenCols = JSON.parse(localStorage.getItem('filesHiddenColumns') || '[]');

    if (isVisible) {
        hiddenCols = hiddenCols.filter(id => id !== colId);
    } else {
        if (!hiddenCols.includes(colId)) hiddenCols.push(colId);
    }

    localStorage.setItem('filesHiddenColumns', JSON.stringify(hiddenCols));

    // Re-apply column order/visibility logic
    // We reuse reorderColumns() logic but we need to ensure it respects hidden cols
    // Since reorderColumns logic above is modified to check hiddenCols, we just call it.
    // However, reorderColumns assumes headers are currently in the row.
    // If a header is completely removed, reorderColumns needs access to original headers.
    // Better strategy: Reload page or simpler: 
    // Just toggle display:none on th and td? No, reorderColumns actually removes valid th from DOM.
    // To restore, we need to reload or keep a hidden cache of headers.
    // Simpler approach for now: Reload page to restore columns cleanly, 
    // OR smarter: modify loadFiles() to hide columns.

    // Let's modify loadFiles render logic to skip hidden columns.
    // And modify reorderColumns to just re-append everything but toggle display.

    location.reload(); // Simplest way to restore removed elements correctly without complex state management
}


// ==========================================
// Data Rendering
// ==========================================

// Helper to get cell content by column ID
function getCellContent(file, colId) {
    const esc = escapeHtml;
    switch (colId) {
        case 'col-onem':
            const uVal = (file.urgency || 'Orta').toLowerCase();
            let onemColor = 'var(--text-muted)';
            let onemBg = 'rgba(255,255,255,0.1)';
            let displayVal = file.urgency || 'Orta';

            if (uVal.includes('yüksek') || uVal.includes('high')) {
                onemColor = '#fff'; onemBg = 'var(--accent-danger)'; displayVal = 'Yüksek';
            } else if (uVal.includes('orta') || uVal.includes('medium')) {
                onemColor = '#fff'; onemBg = 'var(--accent-warning)'; displayVal = 'Orta';
            } else if (uVal.includes('düşük') || uVal.includes('low')) {
                onemColor = '#fff'; onemBg = 'var(--accent-success)'; displayVal = 'Düşük';
            }
            return `<span class="badge" style="background:${onemBg}; color:${onemColor}; font-size:0.7em; padding:2px 6px;">${esc(displayVal)}</span>`;
        case 'col-no': return `<span style="font-weight:600; color:var(--accent-primary);">${esc(file.registration_number || file.court_case_number || '-')}</span>`;
        case 'col-parties': return `<div style="font-weight:500;">${esc(file.plaintiff || '-')}</div><div style="font-size:0.8em; opacity:0.7;">vs ${esc(file.defendant || '-')}</div>`;
        case 'col-vekil':
            const pAtty = file.plaintiff_attorney || '-';
            const dAtty = file.defendant_attorney || '-';
            return `<div style="font-size:0.8em;">${esc(pAtty)}</div><div style="font-size:0.75em; opacity:0.7;">vs ${esc(dAtty)}</div>`;
        case 'col-subject': return `<div class="cell-subject" title="${esc(file.subject)}">${esc(file.subject || '-')}</div>`;
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
                const res = file.latest_decision_result.toLowerCase();
                let color = 'var(--text-primary)';

                // YD Kabul and regular kabul = green, YD Red and regular red = red
                if (res.includes('yd red')) color = 'var(--accent-danger)';
                else if (res.includes('yd kabul')) color = 'var(--accent-success)';
                else if (res.includes('red') || res.includes('bozma')) color = 'var(--accent-danger)';
                else if (res.includes('kabul') || res.includes('onama')) color = 'var(--accent-success)';
                else if (res.includes('kısmen')) color = 'var(--accent-warning)';
                else if (res.includes('iptal')) color = 'var(--accent-success)';

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
            let dateIcons = '';
            // DuruÅŸma/KeÅŸif (Yellow calendar)
            if (file.next_hearing_date) {
                dateIcons += `<span class="date-icon" style="cursor:pointer; color:var(--accent-warning); margin-right:6px;" onclick="editHearingDateFromList('${file.id}', event)" title="Duruşma/Keşif: ${formatDate(file.next_hearing_date)}"><i data-lucide="calendar" style="width:16px; height:16px;"></i></span>`;
            }
            // İşlem Süresi (Red alarm-clock)
            if (file.deadline_date) {
                dateIcons += `<span class="date-icon" style="cursor:pointer; color:var(--accent-danger);" onclick="editDeadlineFromList('${file.id}', event)" title="İşlem Süresi: ${formatDate(file.deadline_date)}"><i data-lucide="alarm-clock" style="width:16px; height:16px;"></i></span>`;
            }
            // Show icons if any, else show creation date
            if (dateIcons) {
                return `<div style="display:flex; align-items:center; gap:4px;">${dateIcons}</div>`;
            }
            return `<span style="font-family:monospace; font-size:0.85em; opacity:0.5;">${formatDate(file.created_at)}</span>`;
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

    const hiddenCols = JSON.parse(localStorage.getItem('filesHiddenColumns') || '[]');

    const html = loadedFilesData.map(file => {
        // Build TD cells based on columnOrder
        const cells = columnOrder.map(colId => {
            if (hiddenCols.includes(colId)) return '';
            return `<td class="${colId}">${getCellContent(file, colId)}</td>`;
        }).join('');

        // Add special class for favorite rows
        const rowClass = file.is_favorite ? 'favorite-row' : '';
        return `<tr data-file-id="${file.id}" class="${rowClass}">${cells}</tr>`;
    }).join('');

    tbody.innerHTML = html;
    lucide.createIcons();
}

// Helper to populate lawyer dropdown
function populateLawyerDropdown(data) {
    const dropdown = document.getElementById('filter-lawyer');
    if (!dropdown || dropdown.options.length > 1) return; // Already populated

    const uniqueLawyers = {};
    data.forEach(item => {
        if (item.lawyers?.id && item.lawyers?.name) {
            uniqueLawyers[item.lawyers.id] = item.lawyers.name;
        }
    });

    Object.entries(uniqueLawyers).forEach(([id, name]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        dropdown.appendChild(option);
    });
}

window.searchDocuments = async (term) => {
    const input = document.getElementById('doc-search-input');
    // Allow clearing if empty
    if (!term) {
        docSearchIds = null;
        input.style.borderColor = '';
        input.style.borderWidth = '';
        loadFiles();
        return;
    }

    if (term.trim().length < 3) {
        showToast('En az 3 karakter giriniz.', 'warning');
        return;
    }

    showToast('Evrak Ã¶zetlerinde aranÄ±yor...', 'info');
    input.disabled = true;

    try {
        // Search in JSONB (Postgres)
        // Uses Supabase filter for JSONB text search
        const { data: docs, error } = await supabase
            .from('documents')
            .select('file_case_id')
            .filter('analysis->>summary', 'ilike', `%${term}%`);

        if (error) throw error;

        if (!docs || docs.length === 0) {
            showToast('Bu iÃ§eriÄŸe sahip evrak bulunamadÄ±.', 'warning');
            docSearchIds = []; // Force empty table
        } else {
            // Extract Unique IDs
            docSearchIds = [...new Set(docs.map(d => d.file_case_id))];
            showToast(`${docSearchIds.length} dosyada eÅŸleÅŸen evrak bulundu.`, 'success');
        }

        input.style.borderColor = 'var(--accent-primary)';
        input.style.borderWidth = '2px';
        loadFiles(); // Reload table

    } catch (e) {
        console.error('Search error:', e);
        showToast('Arama hatasÄ±: ' + e.message, 'error');
    } finally {
        input.disabled = false;
        input.focus();
    }
};

async function loadFiles(retryCount = 0) {
    const tbody = document.getElementById('files-table-body');
    if (!tbody) return;

    if (retryCount === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:40px;"><div class="loading-placeholder"><i data-lucide="loader" class="spin"></i> <span>YÃ¼kleniyor...</span></div></td></tr>`;
        lucide.createIcons();
    }

    try {
        const searchTerm = document.getElementById('search-input')?.value || '';
        const statusFilter = document.getElementById('filter-status')?.value || '';
        const sortFilter = document.getElementById('filter-sort')?.value || 'date-desc';
        const lawyerFilter = document.getElementById('filter-lawyer')?.value || '';
        const primaryTagFilter = document.getElementById('filter-primary-tag')?.value || '';

        let query = supabase
            .from('file_cases')
            .select(`
                *,
                lawyers (id, name, status)
            `)
            .order('created_at', { ascending: false });

        // Apply Document Search Filter (if active)
        if (docSearchIds !== null) {
            if (docSearchIds.length > 0) {
                query = query.in('id', docSearchIds);
            } else {
                // Search was performed but no results found
                query = query.in('id', ['00000000-0000-0000-0000-000000000000']); // Force empty
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        // Populate lawyer dropdown once
        populateLawyerDropdown(data);

        // Client-side filtering for search with ADVANCED PREFIX SUPPORT
        let filteredData = data;
        if (searchTerm) {
            // Parse for field-specific prefix
            const prefixMatch = searchTerm.match(/^(adres|davacÄ±|davalÄ±|vekil|konu|esas|mahkeme)\.(.+)$/i);

            if (prefixMatch) {
                // Field-specific search
                const prefix = prefixMatch[1].toLowerCase();
                const term = normalizeTurkish(prefixMatch[2].trim());

                filteredData = data.filter(item => {
                    let fieldValue = '';
                    switch (prefix) {
                        case 'adres': fieldValue = item.address || ''; break;
                        case 'davacÄ±': fieldValue = item.plaintiff || ''; break;
                        case 'davalÄ±': fieldValue = item.defendant || ''; break;
                        case 'vekil': fieldValue = (item.plaintiff_attorney || '') + ' ' + (item.defendant_attorney || ''); break;
                        case 'konu': fieldValue = item.subject || ''; break;
                        case 'esas': fieldValue = item.court_case_number || ''; break;
                        case 'mahkeme': fieldValue = item.court_name || ''; break;
                    }
                    return normalizeTurkish(fieldValue).includes(term);
                });
            } else {
                // General search across all fields (including address)
                const normalizedTerm = normalizeTurkish(searchTerm);
                filteredData = data.filter(item => {
                    const searchableFields = [
                        item.registration_number,
                        item.court_case_number,
                        item.plaintiff,
                        item.defendant,
                        item.subject,
                        item.court_name,
                        item.primary_tag,
                        item.address, // [NEW] Include address in general search
                        item.plaintiff_attorney,
                        item.defendant_attorney,
                        ...(item.tags || []),
                        item.lawyers?.name
                    ];
                    return searchableFields.some(field => field && normalizeTurkish(field).includes(normalizedTerm));
                });
            }
        }

        if (statusFilter) {
            filteredData = filteredData.filter(item => item.status === statusFilter);
        }

        // Lawyer filter
        if (lawyerFilter) {
            filteredData = filteredData.filter(item => item.lawyers?.id === lawyerFilter);
        }

        // Primary tag filter
        if (primaryTagFilter) {
            filteredData = filteredData.filter(item => item.primary_tag === primaryTagFilter);
        }

        // Date range filter
        const dateStart = document.getElementById('filter-date-start')?.value;
        const dateEnd = document.getElementById('filter-date-end')?.value;
        if (dateStart) {
            filteredData = filteredData.filter(item => new Date(item.created_at) >= new Date(dateStart));
        }
        if (dateEnd) {
            const endDate = new Date(dateEnd);
            endDate.setHours(23, 59, 59); // Include entire end day
            filteredData = filteredData.filter(item => new Date(item.created_at) <= endDate);
        }

        // Sorting
        filteredData.sort((a, b) => {
            const dateA = new Date(a.created_at || 0);
            const dateB = new Date(b.created_at || 0);
            if (sortFilter === 'date-asc') return dateA - dateB;
            if (sortFilter === 'date-desc') return dateB - dateA;
            if (sortFilter === 'plaintiff-asc') return (a.plaintiff || '').localeCompare(b.plaintiff || '');
            if (sortFilter === 'hearing-asc') {
                const hA = a.next_hearing_date ? new Date(a.next_hearing_date) : new Date('9999-12-31');
                const hB = b.next_hearing_date ? new Date(b.next_hearing_date) : new Date('9999-12-31');
                return hA - hB;
            }
            if (sortFilter === 'amount-desc') return (parseFloat(b.claim_amount) || 0) - (parseFloat(a.claim_amount) || 0);
            if (sortFilter === 'reg-desc') return (b.court_case_number || '').localeCompare(a.court_case_number || '');
            return 0;
        });

        loadedFilesData = filteredData; // Cache data

        // Update count
        if (document.getElementById('file-count-info'))
            document.getElementById('file-count-info').textContent = `Toplam: ${filteredData.length} dosya`;

        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 40px;"><p style="opacity:0.7;">Dosya bulunamadÄ±.</p></td></tr>`;
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
                alert('HATA: GeÃ§ersiz Dosya ID! LÃ¼tfen sayfayÄ± yenileyin.');
                console.error('[Files] Invalid ID clicked:', id);
            }
        }
    });
}

window.loadFiles = loadFiles;
window.handleSearchDebounced = handleSearchDebounced;

// Status toggle handler
document.addEventListener('click', async function (e) {
    const toggle = e.target.closest('.status-toggle');
    if (!toggle) return;

    e.stopPropagation(); // Prevent row click

    const fileId = toggle.getAttribute('data-file-id');
    const currentStatus = toggle.getAttribute('data-current-status');
    const newStatus = currentStatus === 'OPEN' ? 'CLOSED' : 'OPEN';

    try {
        toggle.textContent = '...';
        const { error } = await supabase
            .from('file_cases')
            .update({ status: newStatus })
            .eq('id', fileId);

        if (error) throw error;

        showToast(`Dosya durumu ${newStatus === 'OPEN' ? 'AÃ§Ä±k' : 'KapalÄ±'} olarak gÃ¼ncellendi`, 'success');
        loadFiles(); // Refresh list
    } catch (err) {
        console.error('Status toggle error:', err);
        showToast('Durum gÃ¼ncellenemedi: ' + err.message, 'error');
        toggle.textContent = currentStatus === 'OPEN' ? 'AÃ§Ä±k' : 'KapalÄ±';
    }
});

// Favorite Toggle Handler
document.addEventListener('click', async function (e) {
    const favToggle = e.target.closest('.fav-toggle');
    if (!favToggle) return;

    e.stopPropagation();

    const fileId = favToggle.getAttribute('data-id');
    const row = favToggle.closest('tr');
    const isFavorite = row.classList.contains('favorite-row');
    const newValue = !isFavorite;

    try {
        favToggle.style.opacity = '0.5';
        const { error } = await supabase
            .from('file_cases')
            .update({ is_favorite: newValue })
            .eq('id', fileId);

        if (error) throw error;

        showToast(newValue ? 'Favorilere eklendi â­' : 'Favorilerden Ã§Ä±karÄ±ldÄ±', 'success');
        loadFiles(); // Refresh
    } catch (err) {
        console.error('Favorite toggle error:', err);
        showToast('Favori gÃ¼ncellenemedi: ' + err.message, 'error');
        favToggle.style.opacity = '1';
    }
});

// Ä°ÅŸlem SÃ¼resi (deadline_date) Edit Modal
window.editDeadlineFromList = async function (fileId, event) {
    event.stopPropagation();

    const { data: file, error } = await supabase.from('file_cases').select('deadline_date').eq('id', fileId).single();
    if (error) {
        showToast('Hata: ' + error.message, 'error');
        return;
    }

    const currentDate = file?.deadline_date ? (file.deadline_date || '').split('T')[0] : '';

    const modalHtml = `
        <div id="date-edit-modal" class="modal active" style="z-index:9999;">
            <div class="modal-content" style="max-width:320px;">
                <div class="modal-header" style="border-left:3px solid var(--accent-danger);">
                    <h3 style="display:flex; align-items:center; gap:8px;"><i data-lucide="alarm-clock" style="color:var(--accent-danger);"></i> Ä°ÅŸlem SÃ¼resi</h3>
                    <button class="icon-btn" onclick="closeDateEditModal()"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Tarih</label>
                        <input type="date" id="date-edit-input" class="form-control" value="${currentDate}">
                    </div>
                </div>
                <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end;">
                    <button class="btn btn-ghost" onclick="clearDateField('${fileId}', 'deadline_date')">Temizle</button>
                    <button class="btn btn-primary" onclick="saveDateField('${fileId}', 'deadline_date')">Kaydet</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
};

// DuruÅŸma/KeÅŸif (next_hearing_date) Edit Modal
window.editHearingDateFromList = async function (fileId, event) {
    event.stopPropagation();

    const { data: file, error } = await supabase.from('file_cases').select('next_hearing_date').eq('id', fileId).single();
    if (error) {
        showToast('Hata: ' + error.message, 'error');
        return;
    }

    const currentDate = file?.next_hearing_date ? (file.next_hearing_date || '').split('T')[0] : '';

    const modalHtml = `
        <div id="date-edit-modal" class="modal active" style="z-index:9999;">
            <div class="modal-content" style="max-width:320px;">
                <div class="modal-header" style="border-left:3px solid var(--accent-warning);">
                    <h3 style="display:flex; align-items:center; gap:8px;"><i data-lucide="calendar" style="color:var(--accent-warning);"></i> DuruÅŸma/KeÅŸif</h3>
                    <button class="icon-btn" onclick="closeDateEditModal()"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Tarih</label>
                        <input type="date" id="date-edit-input" class="form-control" value="${currentDate}">
                    </div>
                </div>
                <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end;">
                    <button class="btn btn-ghost" onclick="clearDateField('${fileId}', 'next_hearing_date')">Temizle</button>
                    <button class="btn btn-primary" onclick="saveDateField('${fileId}', 'next_hearing_date')">Kaydet</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
};

window.closeDateEditModal = function () {
    const modal = document.getElementById('date-edit-modal');
    if (modal) modal.remove();
};

window.saveDateField = async function (fileId, fieldName) {
    const date = document.getElementById('date-edit-input').value || null;

    try {
        const updates = {};
        updates[fieldName] = date;

        const { error } = await supabase.from('file_cases').update(updates).eq('id', fileId);
        if (error) throw error;

        showToast('Tarih gÃ¼ncellendi.', 'success');
        closeDateEditModal();
        loadFiles();
    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
};

window.clearDateField = async function (fileId, fieldName) {
    try {
        const updates = {};
        updates[fieldName] = null;

        const { error } = await supabase.from('file_cases').update(updates).eq('id', fileId);
        if (error) throw error;

        showToast('Tarih temizlendi.', 'success');
        closeDateEditModal();
        loadFiles();
    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
};

/* ========================================================== */
/* NEW DOCUMENT SEARCH LOGIC (MODAL BASED)                   */
/* ========================================================== */

window.closeDocSearchModal = () => {
    const modal = document.getElementById('doc-search-results-modal');
    if (modal) modal.classList.remove('active');
};

window.searchDocumentsNew = async (term) => {
    const input = document.getElementById('doc-search-input');

    // Clear if empty
    if (!term) return;

    if (term.trim().length < 3) {
        showToast('En az 3 karakter giriniz.', 'warning');
        return;
    }

    showToast('Evraklar taranıyor...', 'info');
    input.disabled = true;

    try {
        // Step 1: Search Documents (Separate query to avoid Join errors)
        const { data: docs, error: docError } = await supabase
            .from('documents')
            .select('id, name, analysis, upload_date, file_case_id, public_url')
            .filter('analysis->>summary', 'ilike', `%${term}%`)
            .order('upload_date', { ascending: false })
            .limit(20);

        if (docError) throw docError;

        if (!docs || docs.length === 0) {
            showToast('Sonuç bulunamadı.', 'warning');
        } else {
            // Step 2: Fetch related File Cases manually
            const fileIds = [...new Set(docs.map(d => d.file_case_id))];

            let fileMap = {};
            if (fileIds.length > 0) {
                const { data: files, error: fileError } = await supabase
                    .from('file_cases')
                    .select('id, court_case_number, plaintiff')
                    .in('id', fileIds);

                if (fileError) throw fileError;

                files.forEach(f => fileMap[f.id] = f);
            }

            // Attach file info
            const enrichedDocs = docs.map(doc => ({
                ...doc,
                file_cases: fileMap[doc.file_case_id] || { court_case_number: '?', plaintiff: '?' }
            }));

            // Always show modal for search results (single or multiple)
            const modal = document.getElementById('doc-search-results-modal');
            const list = document.getElementById('doc-search-list');
            const info = document.getElementById('doc-search-info');

            if (list && info && modal) {
                list.innerHTML = '';
                info.textContent = `"${term}" araması için ${enrichedDocs.length} evrak bulundu:`;

                enrichedDocs.forEach(doc => {
                    const summary = doc.analysis?.summary || '';
                    const termIdx = summary.toLowerCase().indexOf(term.toLowerCase());
                    let snippet = summary;
                    if (termIdx !== -1) {
                        const start = Math.max(0, termIdx - 40);
                        const end = Math.min(summary.length, termIdx + 120);
                        snippet = '...' + summary.substring(start, end) + '...';
                    } else if (summary.length > 150) {
                        snippet = summary.substring(0, 150) + '...';
                    }

                    const regex = new RegExp(`(${term})`, 'gi');
                    const highlitSnippet = snippet.replace(regex, '<span style="background:rgba(59, 130, 246, 0.4); color:#fff; padding:0 2px; border-radius:2px;">$1</span>');

                    const item = document.createElement('div');
                    item.style.cssText = 'padding:14px; background:var(--bg-card); cursor:pointer; border:1px solid var(--border-color); border-radius:8px; display:flex; flex-direction:column; gap:6px; transition:background 0.2s; margin-bottom: 8px;';
                    item.onmouseover = () => item.style.background = 'var(--bg-hover)';
                    item.onmouseout = () => item.style.background = 'var(--bg-card)';

                    let isExpanded = false;

                    item.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <span style="font-weight:600; color:var(--accent-primary); display:flex; align-items:center; gap:6px;">
                                <i data-lucide="file-text" style="width:16px;"></i> ${doc.name}
                            </span>
                            <span style="font-size:0.75rem; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">${new Date(doc.upload_date).toLocaleDateString('tr-TR')}</span>
                        </div>
                        <div style="font-size:0.85rem; color:var(--text-primary);">
                            <span style="color:var(--text-secondary);">Dosya:</span> <strong>${doc.file_cases?.court_case_number || 'No'}</strong> - ${doc.file_cases?.plaintiff || '?'}
                        </div>
                        <div id="summary-${doc.id}" style="font-size:0.85rem; color:var(--text-secondary); line-height:1.5; border-top:1px solid var(--border-color); padding-top:8px; margin-top:4px;">
                            ${highlitSnippet} <span style="font-size:0.7em; opacity:0.6;">(Devamı...)</span>
                        </div>
                        
                        <div style="display:flex; gap:10px; margin-top:12px; justify-content:flex-end; border-top: 1px dashed var(--border-color); padding-top: 10px;">
                             <button class="icon-btn" style="border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;" 
                                onclick="event.stopPropagation(); if('${doc.public_url}') window.open('${doc.public_url}', '_blank'); else showToast('Evrak linki yok', 'warning');">
                                <i data-lucide="eye" style="width:14px;"></i> Evrakı Göster
                            </button>
                            <button class="icon-btn" style="border: 1px solid var(--accent-primary); background: rgba(59, 130, 246, 0.1); padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px; color: var(--accent-primary);"
                                onclick="event.stopPropagation(); window.open('file-detail.html?id=${doc.file_case_id}&openDoc=${doc.id}', '_blank');">
                                <i data-lucide="folder-open" style="width:14px;"></i> Dosyaya Git
                            </button>
                        </div>
                    `;

                    item.onclick = (e) => {
                        const summaryDiv = item.querySelector(`#summary-${doc.id}`);
                        if (!summaryDiv) return;

                        isExpanded = !isExpanded;
                        if (isExpanded) {
                            const fullText = (doc.analysis?.summary || '').replace(/\\n/g, '<br>');
                            summaryDiv.innerHTML = fullText + ' <span style="font-size:0.7em; opacity:0.6;">(Gizle)</span>';
                            summaryDiv.style.color = 'var(--text-primary)';
                        } else {
                            summaryDiv.innerHTML = `${highlitSnippet} <span style="font-size:0.7em; opacity:0.6;">(Devamı...)</span>`;
                            summaryDiv.style.color = 'var(--text-secondary)';
                        }
                    };

                    list.appendChild(item);
                });

                lucide.createIcons();
                modal.classList.add('active');
            }
        }

    } catch (e) {
        console.error('Search error:', e);
        showToast('Arama hatası: ' + (e.message || 'Bilinmeyen hata'), 'error');
    } finally {
        input.disabled = false;
        input.focus();
        input.value = ''; // Clear input
    }
};
