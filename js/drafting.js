let currentDraftDocId = null;

function openDraftingModal(docId) {
    currentDraftDocId = docId;
    const modal = document.getElementById('drafting-modal');
    modal.classList.add('active');
}

function closeDraftingModal() {
    document.getElementById('drafting-modal').classList.remove('active');
    currentDraftDocId = null;
}

async function startDrafting() {
    if (!currentDraftDocId) return;

    const type = document.getElementById('draft-type').value;
    const instructions = document.getElementById('draft-instructions').value;
    const btn = document.querySelector('#drafting-modal .btn-primary');
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Oluşturuluyor...';

    try {
        // 1. Get Document & Case Info
        const { data: doc } = await supabase.from('documents').select('*, file_cases(*)').eq('id', currentDraftDocId).single();

        let textContext = "";
        if (doc.analysis && doc.analysis.viz_text) {
            textContext = doc.analysis.viz_text; // Or full text if we stored it
        } else {
            // Re-fetch? For now assume analysis exists or visual text is enough
            textContext = "Analiz verisi bulunamadı. Lütfen önce evrakı analiz edin.";
        }

        // 2. Build Prompt
        const settings = await getSystemSettings();
        const apiKey = settings.gemini_api_key;

        const systemPrompt = `DO NOT USE MARKDOWN. SEN TÜRK HUKUKUNDA UZMAN BİR AVUKATSIN.
        Aşağıdaki dava/evrak bilgilerine dayanarak profesyonel bir '${type} DİLEKÇESİ' taslağı yaz.
        
        DAVA BİLGİLERİ:
        Mahkeme: ${doc.file_cases.court_name}
        Esas No: ${doc.file_cases.court_case_number}
        Davacı: ${doc.file_cases.plaintiff}
        Davalı: ${doc.file_cases.defendant}
        Konu: ${doc.file_cases.subject}
        
        EVRAK ÖZETİ/İÇERİĞİ:
        ${textContext}
        
        KULLANICI NOTU: ${instructions}
        
        KURALLAR:
        1. Resmi bir dilekçe formatında olsun (Başlık, Taraflar, Konu, Açıklamalar, Hukuki Nedenler, Sonuç ve İstem).
        2. Markdown kullanma, düz metin yaz.
        3. Boşlukları [....] şeklinde bırak.
        `;

        // 3. Call AI
        const contentBody = { contents: [{ parts: [{ text: systemPrompt }] }] };
        const responseText = await callGeminiWithFallback(apiKey, contentBody); // Reuse existing function

        // 4. Generate DOCX
        await generateDocxFile(responseText, `${type}_Taslak.docx`);

        showToast('Dilekçe taslağı indirildi.', 'success');
        closeDraftingModal();

    } catch (e) {
        console.error(e);
        showToast('Hata: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function generateDocxFile(text, filename) {
    const { Document, Packer, Paragraph, TextRun } = docx;

    // Split text by newlines to create paragraphs
    const lines = text.split('\n');
    const children = lines.map(line => new Paragraph({
        children: [new TextRun({
            text: line,
            font: "Times New Roman",
            size: 24 // 12pt
        })],
        spacing: { after: 200 }
    }));

    const doc = new Document({
        sections: [{
            properties: {},
            children: children
        }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, filename);
}
