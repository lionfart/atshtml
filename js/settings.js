// ==========================================
// Settings Modal Logic (Shared)
// ==========================================

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.add('active');
        loadSettingsData();
        populateModelOrderList();
        showRateLimitedModels();
        if (typeof lucide !== 'undefined') lucide.createIcons();
        if (typeof updateAdminUI === 'function') updateAdminUI();
    }
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('active');
}

// Get user's model order or default from config
function getModelOrder() {
    const stored = localStorage.getItem('openrouter_model_order');
    if (stored) {
        try { return JSON.parse(stored); } catch (e) { }
    }
    return (typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.openRouterModels : []) || [];
}

// Populate the draggable model order list
function populateModelOrderList() {
    const list = document.getElementById('model-order-list');
    if (!list) return;

    const models = getModelOrder();
    const rateLimited = JSON.parse(sessionStorage.getItem('openrouter_rate_limited') || '[]');

    list.innerHTML = models.map((model, idx) => {
        const isLimited = rateLimited.includes(model);
        const shortName = model.split('/').pop().replace(':free', '');

        // Capabilities Check
        const caps = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.modelCapabilities && APP_CONFIG.modelCapabilities[model])
            ? APP_CONFIG.modelCapabilities[model]
            : ['text'];

        const isVision = caps.includes('vision');
        const capBadge = isVision
            ? '<span title="Görsel Analiz Yeteneği (Vision)" style="font-size:0.8em; margin-right:5px; cursor:help;">👁️</span>'
            : '<span title="Metin Analizi" style="font-size:0.8em; margin-right:5px; opacity:0.3; cursor:help;">📝</span>';

        return `<li draggable="true" data-model="${model}" data-idx="${idx}" 
            style="padding:8px 12px; border-bottom:1px solid var(--border-color); cursor:move; display:flex; align-items:center; gap:8px; background:${isLimited ? 'rgba(255,150,0,0.1)' : 'transparent'};">
            <span style="color:var(--text-muted);">☰</span>
            ${capBadge}
            <span style="flex:1; font-size:0.85em;">${shortName}</span>
            ${isLimited ? '<span style="font-size:0.7em; color:var(--accent-warning);">⏳</span>' : ''}
        </li>`;
    }).join('');

    // Add drag-drop event listeners
    setupDragDrop(list);
}

// Setup drag-drop for model reordering
function setupDragDrop(list) {
    let draggedItem = null;

    list.addEventListener('dragstart', (e) => {
        draggedItem = e.target.closest('li');
        if (draggedItem) {
            draggedItem.style.opacity = '0.5';
        }
    });

    list.addEventListener('dragend', (e) => {
        if (draggedItem) {
            draggedItem.style.opacity = '1';
            draggedItem = null;
        }
    });

    list.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(list, e.clientY);
        if (draggedItem) {
            if (afterElement == null) {
                list.appendChild(draggedItem);
            } else {
                list.insertBefore(draggedItem, afterElement);
            }
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Save model order from current DOM order
function saveModelOrderFromDOM() {
    const list = document.getElementById('model-order-list');
    if (!list) return;
    const items = list.querySelectorAll('li[data-model]');
    const order = Array.from(items).map(li => li.dataset.model);
    localStorage.setItem('openrouter_model_order', JSON.stringify(order));
}

// Reset model order to default
function resetModelOrder() {
    localStorage.removeItem('openrouter_model_order');
    sessionStorage.removeItem('openrouter_rate_limited');
    populateModelOrderList();
    showRateLimitedModels();
    showToast('Model sırası sıfırlandı', 'info');
}

// Show rate-limited models section
function showRateLimitedModels() {
    const section = document.getElementById('rate-limited-section');
    const listDiv = document.getElementById('rate-limited-list');
    if (!section || !listDiv) return;

    const rateLimited = JSON.parse(sessionStorage.getItem('openrouter_rate_limited') || '[]');
    if (rateLimited.length > 0) {
        section.style.display = 'block';
        listDiv.textContent = rateLimited.map(m => m.split('/').pop().replace(':free', '')).join(', ');
    } else {
        section.style.display = 'none';
    }
}

async function loadSettingsData() {
    try {
        const s = await getSystemSettings();
        const burstInput = document.getElementById('burst-limit');
        if (burstInput) burstInput.value = s.catchup_burst_limit || 2;

        // Load OpenRouter Key from settings or LocalStorage
        const orKey = s.openrouter_api_key || localStorage.getItem('openrouter_api_key') || '';
        const orInput = document.getElementById('openrouter-api-key');
        if (orInput) orInput.value = orKey;
    } catch (e) { }
}

async function saveSettings() {
    try {
        const orKeyEl = document.getElementById('openrouter-api-key');
        const orKey = orKeyEl ? orKeyEl.value.trim() : '';
        const burstEl = document.getElementById('burst-limit');

        // Save model order from DOM
        saveModelOrderFromDOM();

        await updateSystemSettings({
            openrouter_api_key: orKey,
            catchup_burst_limit: burstEl ? parseInt(burstEl.value) : 2
        });

        // Also save to LocalStorage for quick access
        if (orKey) localStorage.setItem('openrouter_api_key', orKey);
        else localStorage.removeItem('openrouter_api_key');

        showToast('Ayarlar Kaydedildi', 'success');
        closeSettingsModal();
    } catch (e) { showToast('Hata: ' + e.message, 'error'); }
}

// Expose to window
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.resetModelOrder = resetModelOrder;
