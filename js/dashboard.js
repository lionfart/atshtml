// ==========================================
// Dashboard - Adalet Takip Sistemi
// ==========================================

let dashboardData = { files: [], lawyers: [] };

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    initHeader(); // AI model
    await loadDashboardData();
});

async function loadDashboardData() {
    try {
        // 1. Fetch File Cases
        const { data: files, error } = await supabase.from('file_cases').select('*, lawyers(id, name)');
        if (error) throw error;

        // 2. Fetch Lawyers
        const { data: lawyers } = await supabase.from('lawyers').select('*');

        dashboardData.files = files || [];
        dashboardData.lawyers = lawyers || [];

        // --- Calculate Summary ---
        const total = files.length;
        const closed = files.filter(f => f.status === 'CLOSED' || f.decision_result).length;
        const active = total - closed;
        const lawyerCount = lawyers ? lawyers.length : 0;

        document.getElementById('total-files').textContent = total;
        document.getElementById('closed-files').textContent = closed;
        document.getElementById('active-files').textContent = active;
        document.getElementById('total-lawyers').textContent = lawyerCount;

        // --- Calculate Primary Tags ---
        const tagCounts = {};
        files.forEach(f => {
            const tag = f.primary_tag || 'Belirsiz';
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });

        // --- Calculate Lawyer Workload ---
        const lawyerStats = {};
        lawyers?.forEach(l => {
            lawyerStats[l.id] = { name: l.name || l.full_name, active: 0, closed: 0 };
        });
        lawyerStats['unassigned'] = { name: 'Atanmamış', active: 0, closed: 0 };

        files.forEach(f => {
            const lawyerId = f.lawyers?.id || f.assigned_lawyer_id || 'unassigned';
            if (!lawyerStats[lawyerId]) {
                lawyerStats[lawyerId] = { name: f.lawyers?.name || 'Bilinmeyen', active: 0, closed: 0 };
            }
            if (f.status === 'CLOSED' || f.decision_result) {
                lawyerStats[lawyerId].closed++;
            } else {
                lawyerStats[lawyerId].active++;
            }
        });

        // --- Render Tables ---
        renderTagsTable(tagCounts, total);
        renderLawyersTable(lawyerStats);

        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (e) {
        console.error('Dashboard load failed:', e);
    }
}

function renderTagsTable(data, total) {
    const tbody = document.getElementById('tags-table-body');
    if (!tbody) return;

    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; opacity:0.6;">Veri bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(([tag, count]) => {
        const percent = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        return `<tr>
            <td><span class="badge" style="background:var(--accent-primary); color:white;">${escapeHtml(tag)}</span></td>
            <td><strong>${count}</strong></td>
            <td>${percent}%</td>
        </tr>`;
    }).join('');
}

function renderLawyersTable(data) {
    const tbody = document.getElementById('lawyers-table-body');
    if (!tbody) return;

    const sorted = Object.values(data)
        .filter(l => l.active + l.closed > 0)
        .sort((a, b) => (b.active + b.closed) - (a.active + a.closed));

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; opacity:0.6;">Veri bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(lawyer => {
        return `<tr>
            <td><strong>${escapeHtml(lawyer.name)}</strong></td>
            <td>${lawyer.active}</td>
            <td>${lawyer.closed}</td>
            <td><strong>${lawyer.active + lawyer.closed}</strong></td>
        </tr>`;
    }).join('');
}

// Excel Export using SheetJS
function exportToExcel() {
    try {
        const wb = XLSX.utils.book_new();

        // Sheet 1: Summary
        const summaryData = [
            ['Toplam Dosya', dashboardData.files.length],
            ['Devam Eden', dashboardData.files.filter(f => f.status !== 'CLOSED' && !f.decision_result).length],
            ['Tamamlanan', dashboardData.files.filter(f => f.status === 'CLOSED' || f.decision_result).length],
            ['Avukat Sayısı', dashboardData.lawyers.length]
        ];
        const ws1 = XLSX.utils.aoa_to_sheet([['Metrik', 'Değer'], ...summaryData]);
        XLSX.utils.book_append_sheet(wb, ws1, 'Özet');

        // Sheet 2: Tag Distribution
        const tagCounts = {};
        dashboardData.files.forEach(f => {
            const tag = f.primary_tag || 'Belirsiz';
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
        const tagData = Object.entries(tagCounts).map(([tag, count]) => [tag, count]);
        const ws2 = XLSX.utils.aoa_to_sheet([['Etiket', 'Dosya Sayısı'], ...tagData]);
        XLSX.utils.book_append_sheet(wb, ws2, 'Etiket Dağılımı');

        // Sheet 3: All Files
        const fileRows = dashboardData.files.map(f => [
            f.court_case_number || f.registration_number || '-',
            f.plaintiff || '-',
            f.defendant || '-',
            f.court_name || '-',
            f.primary_tag || '-',
            f.status || '-',
            f.lawyers?.name || 'Atanmamış'
        ]);
        const ws3 = XLSX.utils.aoa_to_sheet([
            ['Dosya No', 'Davacı', 'Davalı', 'Mahkeme', 'Etiket', 'Durum', 'Avukat'],
            ...fileRows
        ]);
        XLSX.utils.book_append_sheet(wb, ws3, 'Tüm Dosyalar');

        // Download
        const fileName = `Adalet_Takip_Rapor_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        showToast('Excel dosyası indirildi!', 'success');
    } catch (e) {
        console.error('Excel export error:', e);
        showToast('Excel dışa aktarma hatası: ' + e.message, 'error');
    }
}
