
// ==========================================
// Custom Modal System (Replaces alert/confirm/prompt)
// ==========================================

const UIModals = {
    init() {
        if (document.getElementById('custom-modal-container')) return;

        const modalHTML = `
        <div id="custom-modal-container" class="modal-overlay hidden" style="z-index: 99999; position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;">
            <div class="modal-card" style="background: var(--bg-secondary, #1f1f2e); border: 1px solid var(--border-color, #333); padding: 25px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); transform: scale(0.95); transition: transform 0.2s;">
                <h3 id="custom-modal-title" style="margin-top:0; margin-bottom: 15px; font-size: 1.1em; color: var(--text-primary, #fff);"></h3>
                <div id="custom-modal-body" style="color: var(--text-secondary, #aaa); margin-bottom: 20px; font-size: 0.95em; line-height: 1.5;"></div>
                <div id="custom-modal-input-container" class="hidden" style="margin-bottom: 20px;">
                    <input type="text" id="custom-modal-input" class="form-control" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color, #444); color: white; border-radius: 6px;">
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="custom-modal-cancel" class="btn btn-secondary" style="padding: 8px 16px; border-radius: 6px; cursor: pointer;">İptal</button>
                    <button id="custom-modal-confirm" class="btn btn-primary" style="padding: 8px 16px; border-radius: 6px; cursor: pointer; background: var(--accent-primary, #7c3aed); color: white; border: none;">Tamam</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    show(options) {
        return new Promise((resolve) => {
            this.init();
            const container = document.getElementById('custom-modal-container');
            const card = container.querySelector('.modal-card');
            const titleEl = document.getElementById('custom-modal-title');
            const bodyEl = document.getElementById('custom-modal-body');
            const inputContainer = document.getElementById('custom-modal-input-container');
            const inputEl = document.getElementById('custom-modal-input');
            const cancelBtn = document.getElementById('custom-modal-cancel');
            const confirmBtn = document.getElementById('custom-modal-confirm');

            titleEl.textContent = options.title || 'Bilgi';
            bodyEl.innerHTML = options.message || ''; // Allow HTML

            // Setup Type
            inputContainer.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            inputEl.value = '';

            if (options.type === 'confirm') {
                cancelBtn.classList.remove('hidden');
                cancelBtn.textContent = options.cancelText || 'İptal';
                confirmBtn.textContent = options.confirmText || 'Evet';
            } else if (options.type === 'prompt') {
                cancelBtn.classList.remove('hidden');
                inputContainer.classList.remove('hidden');
                inputEl.value = options.defaultValue || '';
                cancelBtn.textContent = options.cancelText || 'İptal';
                confirmBtn.textContent = options.confirmText || 'Tamam';
            } else {
                confirmBtn.textContent = 'Tamam';
            }

            // Animation Display
            container.classList.remove('hidden');
            // Trigger reflow
            void container.offsetWidth;
            container.style.opacity = '1';
            card.style.transform = 'scale(1)';

            if (options.type === 'prompt') setTimeout(() => inputEl.focus(), 100);

            // Handlers
            const close = (result) => {
                container.style.opacity = '0';
                card.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    container.classList.add('hidden');
                    resolve(result);
                }, 200);
            };

            const onConfirm = () => {
                cleanup();
                if (options.type === 'prompt') close(inputEl.value);
                else close(true);
            };

            const onCancel = () => {
                cleanup();
                close(options.type === 'prompt' ? null : false);
            };

            const onKey = (e) => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape') onCancel();
            };

            const cleanup = () => {
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                inputEl.removeEventListener('keyup', onKey);
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            inputEl.addEventListener('keyup', onKey);
        });
    },

    async alert(message, title = 'Bilgi') {
        return this.show({ type: 'alert', title, message });
    },

    async confirm(message, title = 'Onay') {
        return this.show({ type: 'confirm', title, message });
    },

    async prompt(message, defaultValue = '', title = 'Giriş') {
        return this.show({ type: 'prompt', title, message, defaultValue });
    }
};

// Expose globally
window.UIModals = UIModals;
