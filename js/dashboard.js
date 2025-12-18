document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    initHeader(); // AI model
    await loadDashboardData();
});

async function loadDashboardData() {
    try {
        // 1. Fetch File Cases
        const { data: files, error } = await supabase.from('file_cases').select('*');
        if (error) throw error;

        // 2. Fetch Lawyers (for names)
        const { data: lawyers } = await supabase.from('lawyers').select('*');
        const lawyerMap = {};
        if (lawyers) lawyers.forEach(l => lawyerMap[l.id] = l.full_name);

        // --- Calculate Summary ---
        const total = files.length;
        const closed = files.filter(f => f.status === 'CLOSED' || f.decision_result).length;
        const active = total - closed;

        document.getElementById('total-files').textContent = total;
        document.getElementById('closed-files').textContent = closed;
        document.getElementById('active-files').textContent = active;

        // --- Calculate Tags ---
        const tagCounts = {};
        files.forEach(f => {
            if (f.tags && Array.isArray(f.tags)) {
                f.tags.forEach(t => {
                    tagCounts[t] = (tagCounts[t] || 0) + 1;
                });
            }
        });

        // --- Calculate Lawyers ---
        const lawyerCounts = {};
        files.forEach(f => {
            if (f.assigned_lawyer_id) {
                const name = lawyerMap[f.assigned_lawyer_id] || 'Bilinmeyen';
                lawyerCounts[name] = (lawyerCounts[name] || 0) + 1;
            } else {
                lawyerCounts['Atanmamış'] = (lawyerCounts['Atanmamış'] || 0) + 1;
            }
        });

        // --- Render Charts ---
        renderTagsChart(tagCounts);
        renderStatusChart(active, closed);
        renderLawyerChart(lawyerCounts);

    } catch (e) {
        console.error('Dashboard load failed:', e);
    }
}

function renderTagsChart(data) {
    const ctx = document.getElementById('tagsChart').getContext('2d');
    const labels = Object.keys(data);
    const values = Object.values(data);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Dosya Sayısı',
                data: values,
                backgroundColor: [
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(153, 102, 255, 0.6)',
                    'rgba(255, 159, 64, 0.6)'
                ],
                borderColor: [
                    'rgba(54, 162, 235, 1)',
                    'rgba(75, 192, 192, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(153, 102, 255, 1)',
                    'rgba(255, 159, 64, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

function renderStatusChart(active, closed) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Devam Eden', 'Karara Çıkan'],
            datasets: [{
                data: [active, closed],
                backgroundColor: ['#f59e0b', '#10b981'],
                hoverOffset: 4
            }]
        }
    });
}

function renderLawyerChart(data) {
    const ctx = document.getElementById('lawyerChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: [
                    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'
                ]
            }]
        }
    });
}
