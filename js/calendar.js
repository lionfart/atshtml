document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    initHeader(); // For AI model selector

    const calendarEl = document.getElementById('calendar');

    // Initialize FullCalendar
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'tr',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        buttonText: {
            today: 'Bugün',
            month: 'Ay',
            week: 'Hafta',
            day: 'Gün',
            list: 'Liste'
        },
        events: fetchCalendarEvents,
        eventClick: function (info) {
            if (info.event.id) {
                window.location.href = `file-detail.html?id=${info.event.id}`;
            }
        },
        height: 'auto',
        aspectRatio: 1.5
    });

    calendar.render();
});

async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const { data, error } = await supabase
            .from('file_cases')
            .select('id, plaintiff, court_case_number, next_hearing_date, deadline_date, subject')
            .or('next_hearing_date.neq.null,deadline_date.neq.null');

        if (error) throw error;

        const events = [];

        data.forEach(file => {
            // Hearing Event
            if (file.next_hearing_date) {
                events.push({
                    id: file.id,
                    title: `Duruşma: ${file.plaintiff}`,
                    start: file.next_hearing_date,
                    backgroundColor: '#3b82f6', // Blue
                    borderColor: '#2563eb',
                    extendedProps: {
                        type: 'hearing',
                        caseNumber: file.court_case_number
                    }
                });
            }

            // Deadline Event
            if (file.deadline_date) {
                events.push({
                    id: file.id,
                    title: `Süre Bitişi: ${file.subject ? file.subject.substring(0, 20) + '...' : 'Dosya'}`,
                    start: file.deadline_date,
                    backgroundColor: '#ef4444', // Red
                    borderColor: '#dc2626',
                    extendedProps: {
                        type: 'deadline',
                        caseNumber: file.court_case_number
                    }
                });
            }
        });

        successCallback(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        showToast('Takvim verileri yüklenirken hata oluştu.', 'error');
        failureCallback(error);
    }
}
