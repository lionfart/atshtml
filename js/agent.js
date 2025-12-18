// ==========================================
// AI Agent - Adalet Takip Sistemi
// ==========================================

const AGENT_STYLES = `
#ai-agent-fab {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #6366f1, #a855f7);
    border-radius: 50%;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    cursor: pointer;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition: transform 0.2s;
}
#ai-agent-fab:hover { transform: scale(1.05); }

#ai-agent-window {
    position: fixed;
    bottom: 90px;
    right: 20px;
    width: 350px;
    height: 500px;
    background: var(--bg-card, #1e1e1e);
    border: 1px solid var(--border-color, #333);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    z-index: 9999;
    display: none;
    flex-direction: column;
    overflow: hidden;
}
#ai-agent-window.active { display: flex; }

.agent-header {
    padding: 15px;
    background: var(--bg-secondary, #252525);
    border-bottom: 1px solid var(--border-color, #333);
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.agent-messages {
    flex: 1;
    padding: 15px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.agent-input-area {
    padding: 10px;
    border-top: 1px solid var(--border-color, #333);
    display: flex;
    gap: 10px;
}
.agent-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 20px;
    border: 1px solid var(--border-color, #555);
    background: var(--bg-primary, #111);
    color: white;
}
.agent-msg {
    padding: 8px 12px;
    border-radius: 12px;
    max-width: 80%;
    font-size: 0.9em;
}
.agent-msg.user {
    background: var(--accent-primary, #3b82f6);
    color: white;
    align-self: flex-end;
}
.agent-msg.ai {
    background: var(--bg-tertiary, #333);
    color: var(--text-primary, #ddd);
    align-self: flex-start;
}
.typing-indicator { font-size: 0.8em; color: #888; margin-left: 10px; display:none; }
`;

class AiAgent {
    constructor() {
        this.isOpen = false;
        this.history = []; // Conversation history (not used in implementation yet)
        this.apiKey = localStorage.getItem('gemini_api_key');
        this.init();
    }

    init() {
        this.injectStyles();
        this.createUI();
        this.addEventListeners();
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = AGENT_STYLES;
        document.head.appendChild(style);
    }

    createUI() {
        const fab = document.createElement('div');
        fab.id = 'ai-agent-fab';
        fab.innerHTML = '<i data-lucide="bot" width="32" height="32"></i>';

        const window = document.createElement('div');
        window.id = 'ai-agent-window';
        window.innerHTML = `
            <div class="agent-header">
                <span style="font-weight:600;">⚖️ Adalet Asistanı</span>
                <button id="agent-close-btn" style="background:none;border:none;color:#aaa;cursor:pointer;"><i data-lucide="x"></i></button>
            </div>
            <div class="agent-messages" id="agent-messages">
                <div class="agent-msg ai">Merhaba! Ben hukuk asistanınızım. Dosyalar arasında gezinebilirim, arama yapabilirim veya sorularınızı yanıtlayabilirim.</div>
            </div>
            <div class="typing-indicator" id="agent-typing">Yazıyor...</div>
            <div class="agent-input-area">
                <input type="text" id="agent-input" class="agent-input" placeholder="Bir şey yazın...">
                <button id="agent-send-btn" style="background:var(--accent-primary); color:white; border:none; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i data-lucide="send" width="16"></i></button>
            </div>
        `;

        document.body.appendChild(fab);
        document.body.appendChild(window);

        // Lucide icons might need refresh if script loaded late
        if (window.lucide) lucide.createIcons();
    }

    addEventListeners() {
        document.getElementById('ai-agent-fab').addEventListener('click', () => this.toggle());
        document.getElementById('agent-close-btn').addEventListener('click', () => this.toggle());

        const input = document.getElementById('agent-input');
        const sendBtn = document.getElementById('agent-send-btn');

        const send = () => {
            const txt = input.value.trim();
            if (!txt) return;
            this.handleUserMessage(txt);
            input.value = '';
        };

        sendBtn.addEventListener('click', send);
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') send(); });
    }

    toggle() {
        this.isOpen = !this.isOpen;
        document.getElementById('ai-agent-window').classList.toggle('active', this.isOpen);
        if (this.isOpen) document.getElementById('agent-input').focus();
    }

    addMessage(text, sender) {
        const div = document.createElement('div');
        div.className = `agent-msg ${sender}`;
        div.innerHTML = text.replace(/\n/g, '<br>'); // Simple formatting
        const container = document.getElementById('agent-messages');
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    async handleUserMessage(text) {
        this.addMessage(text, 'user');

        const typing = document.getElementById('agent-typing');
        typing.style.display = 'block';

        try {
            if (!this.apiKey) {
                // Try getting from global config or system settings
                // 1. Try Config Default
                if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEFAULT_GEMINI_KEY) {
                    this.apiKey = APP_CONFIG.DEFAULT_GEMINI_KEY;
                }

                // 2. Try LocalStorage (User entered)
                if (!this.apiKey) {
                    this.apiKey = localStorage.getItem('gemini_api_key_agent');
                }

                if (!this.apiKey) {
                    this.addMessage("Gemini API Anahtarı bulunamadı. Lütfen ayarlardan kaydedin veya config.js kontrol edin.", 'ai');
                    typing.style.display = 'none';
                    return;
                }
            }

            // 1. INTENT RECOGNITION via Gemini
            const intention = await this.decideIntention(text);

            // 2. EXECUTE ACTION
            await this.executeAction(intention);

        } catch (e) {
            console.error(e);
            this.addMessage("Bir hata oluştu: " + e.message, 'ai');
        } finally {
            typing.style.display = 'none';
        }
    }

    async decideIntention(userText) {
        const prompt = `
        Sen bir web sitesi asistanısın (Adalet Takip Sistemi). 
        Kullanıcı: "${userText}"
        
        Mevcut Eylemler:
        1. NAVIGATE: Sayfa değiştir. Args: "index.html" (Yükle), "files.html" (Dosyalar), "lawyers.html" (Avukatlar).
        2. SEARCH_DB: Veritabanında (dosyalar/avukatlar) ara. Args: arama terimi.
        3. WEB_SEARCH: Kullanıcı genel bilgi soruyorsa veya site dışı konuysa. Args: Google arama terimi.
        4. CHAT: Genel sohbet veya site içi yardım. Args: Cevap metni.

        Yanıt YALNIZCA JSON olsun: { "tool": "NAVIGATE|SEARCH_DB|WEB_SEARCH|CHAT", "args": "...", "reply": "Kullanıcıya gösterilecek kısa mesaj" }
        `;

        try {
            // Re-use callGeminiWithFallback logic or fetch directly
            // Since this is a standalone class, let's fetch directly to avoid deps on supabase-client.js if not loaded?
            // Ideally should use window.callGeminiWithFallback if available.

            if (typeof window.callGeminiWithFallback === 'function') {
                const contentBody = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } };
                const resText = await window.callGeminiWithFallback(this.apiKey, contentBody);
                const jsonMatch = resText.match(/\{[\s\S]*\}/);
                return jsonMatch ? JSON.parse(jsonMatch[0]) : { tool: 'CHAT', args: null, reply: resText };
            } else {
                throw new Error("AI Client not loaded");
            }
        } catch (e) {
            return { tool: 'CHAT', args: null, reply: "Bağlantı sorunu, isteğinizi anlayamadım." };
        }
    }

    async executeAction(intention) {
        const { tool, args, reply } = intention;

        if (reply) this.addMessage(reply, 'ai');

        switch (tool) {
            case 'NAVIGATE':
                setTimeout(() => window.location.href = args, 1000);
                break;
            case 'SEARCH_DB':
                // Check current page
                if (!window.location.href.includes('files.html') && !window.location.href.includes('lawyers.html')) {
                    // Go to files first
                    this.addMessage("Arama yapmak için Dosyalar sayfasına yönlendiriyorum...", 'ai');
                    localStorage.setItem('auto_search_term', args); // Pass state
                    setTimeout(() => window.location.href = 'files.html', 1000);
                } else {
                    // We are on a list page, try to feed input
                    const searchInput = document.getElementById('filter-search') || document.getElementById('search-input');
                    if (searchInput) {
                        searchInput.value = args;
                        searchInput.dispatchEvent(new Event('input'));
                        this.addMessage(`"${args}" için sonuçlar filtrelendi.`, 'ai');
                    } else {
                        this.addMessage("Bu sayfada arama yapılamıyor.", 'ai');
                    }
                }
                break;
            case 'WEB_SEARCH':
                this.addMessage(`<a href="https://www.google.com/search?q=${encodeURIComponent(args)}" target="_blank" style="color:#6366f1;text-decoration:underline;">"${args}" için Google Araması yap (Yeni Sekme)</a>`, 'ai');
                break;
            case 'CHAT':
            default:
                // Already handled reply
                break;
        }
    }
}

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setTimeout(() => new AiAgent(), 1000); }); // Delay to let icons load
} else {
    setTimeout(() => new AiAgent(), 1000);
}

// Handle auto-search state from navigation
document.addEventListener('DOMContentLoaded', () => {
    const term = localStorage.getItem('auto_search_term');
    if (term) {
        localStorage.removeItem('auto_search_term');
        setTimeout(() => {
            const searchInput = document.getElementById('filter-search') || document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = term;
                searchInput.dispatchEvent(new Event('input'));
            }
        }, 1500); // Wait for Agent init
    }
});
