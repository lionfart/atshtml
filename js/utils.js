// ==========================================
// Utility Functions
// ==========================================

// Format date to Turkish locale
function formatDate(dateString, options = {}) {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...options
    });
}

// Format datetime to Turkish locale
function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Truncate text with ellipsis
function truncateText(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Debounce function
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Read file as base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Read file as text
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Extract text from PDF using PDF.js
async function extractTextFromPDF(file) {
    // Set worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        text += pageText + '\n';
    }

    return text.trim();
}

// Convert PDF page to image for OCR
async function convertPDFPageToImage(file) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas to Blob failed'));
            },
            'image/jpeg',
            0.95
        );
    });
}

// Parse text for plaintiff and subject using regex
function parseTextLocally(text) {
    let plaintiff = '';
    let subject = '';

    // Extract plaintiff
    const plaintiffMatch = text.match(/(?:Davacı|Davaci|İsim)\s*(?::|-)?\\s*([^\n\r]+)/i);
    if (plaintiffMatch && plaintiffMatch[1]) {
        plaintiff = plaintiffMatch[1].trim();
    }

    // Extract subject
    const subjectMatch = text.match(/(?:Konu|Dava\s*Konusu|Dava|Özet)\s*(?::|-)?\\s*([\s\S]+?)(?:\n\s*[A-ZÜĞİŞÇÖ]|\n\n|$)/i);
    if (subjectMatch && subjectMatch[1]) {
        subject = subjectMatch[1].trim();
    } else {
        // Fallback - look for keywords
        const keywordMatch = text.match(/([^.\n\r]*?(?:talebiyle|iptali talebi|arz ve talep|talebimden ibarettir)[^.\n\r]*)/i);
        if (keywordMatch && keywordMatch[1]) {
            subject = keywordMatch[1].trim();
        }
    }

    // Clean up subject
    if (subject) {
        subject = subject.replace(/^(konu|dava konusu|özet|özeti)\s*[:|-]?\s*/i, '');

        // Remove common fluff phrases
        const fluffPhrases = [
            /fazlaya ilişkin haklarımız saklı kalmak kaydıyla/gi,
            /yukarıda arz ve izah edilen nedenlerle/gi,
            /saygılarımla arz ve talep ederim/gi,
            /gereğinin yapılmasını arz ederim/gi,
            /tarafından/gi,
            /hakkındadır/gi,
            /müvekkil/gi,
            /vekil eden/gi
        ];

        fluffPhrases.forEach(rgx => {
            subject = subject.replace(rgx, '');
        });

        subject = subject.replace(/\s+/g, ' ').trim();

        // Limit length
        if (subject.length > 200) {
            const firstSentence = subject.match(/^.*?[.?!](?:\s|$)/);
            if (firstSentence) subject = firstSentence[0].trim();
        }
    }

    return { plaintiff, subject };
}

// Get badge variant based on decision result
function getDecisionBadgeClass(result) {
    if (!result) return 'badge-outline';
    const r = result.toUpperCase();
    if (r.includes('KABUL')) return 'badge-active';
    if (r.includes('RED')) return 'badge-danger';
    if (r.includes('KISMEN')) return 'badge-warning';
    return 'badge-default';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Header & AI Model Logic
function initHeader() {
    // Model Selector
    const select = document.getElementById('header-model-select');
    if (select) {
        // defined in config.js
        const models = (typeof APP_CONFIG !== 'undefined') ? APP_CONFIG.geminiModels : ['gemini-1.5-flash'];

        select.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.text = model;
            select.appendChild(option);
        });

        // Load saved
        const saved = localStorage.getItem('preferredGeminiModel');
        if (saved && models.includes(saved)) select.value = saved;

        // Listen change
        select.addEventListener('change', () => {
            localStorage.setItem('preferredGeminiModel', select.value);
            showToast(`Model değişti: ${select.value}`, 'info');
        });
    }

    // Queue Count (if exists)
    updateHeaderQueueCount();
}

function updateHeaderQueueCount() {
    const el = document.getElementById('queue-count');
    if (!el) return;
    const saved = localStorage.getItem('adalet_upload_queue');
    if (saved) {
        try {
            const q = JSON.parse(saved);
            const count = q.filter(i => i.status === 'PROCESSING' || i.status === 'REVIEW_REQUIRED').length;
            el.textContent = count;
            if (count > 0) el.classList.add('badge-error');
        } catch (e) { }
    }
}

// Auto-run on load
document.addEventListener('DOMContentLoaded', initHeader);

// Generate UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ==========================================
// New File Format Support (ODT, UDF, TIFF)
// ==========================================

async function extractTextFromODT(file) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const contentXml = await zip.file("content.xml").async("string");

    // Simple XML text extraction
    const parser = new DOMParser();
    const doc = parser.parseFromString(contentXml, "text/xml");
    return doc.body.textContent || "";
}

async function extractTextFromUDF(file) {
    // UDF is often a zipped XML structure similar to ODT in UYAP context
    const arrayBuffer = await file.arrayBuffer();
    try {
        const zip = await JSZip.loadAsync(arrayBuffer);
        const contentXml = await zip.file("content.xml").async("string");
        const parser = new DOMParser();
        const doc = parser.parseFromString(contentXml, "text/xml");
        return doc.body.textContent || "";
    } catch (e) {
        console.warn("UDF zip parse failed, trying raw text...", e);
        return await readFileAsText(file); // Fallback
    }
}

async function convertTiffToBase64(file) {
    const arrayBuffer = await file.arrayBuffer();
    const ifds = UTIF.decode(arrayBuffer);
    UTIF.decodeImage(arrayBuffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);

    const canvas = document.createElement("canvas");
    canvas.width = ifds[0].width;
    canvas.height = ifds[0].height;

    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < rgba.length; i++) {
        imageData.data[i] = rgba[i];
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL("image/jpeg", 0.9).split(',')[1]; // Return base64 part
}

// End of utils.js
