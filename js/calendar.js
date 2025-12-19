let calendarInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    initHeader(); // For AI model selector

    await loadLawyersForDropdown();

    const calendarEl = document.getElementById('calendar');

    // Initialize FullCalendar
    calendarInstance = new FullCalendar.Calendar(calendarEl, {
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
            if (info.event.extendedProps.type === 'manual') {
                showToast(`Etkinlik: ${info.event.title}`, 'info');
            } else if (info.event.id) {
                window.location.href = `file-detail.html?id=${info.event.id}`;
            }
        },
        height: 'auto',
        aspectRatio: 1.5
    });

    calendarInstance.render();
});

async function loadLawyersForDropdown() {
    try {
        const { data: lawyers } = await supabase.from('lawyers').select('id, name');
        const dropdown = document.getElementById('event-lawyer');
        if (!dropdown || !lawyers) return;

        lawyers.forEach(l => {
            const option = document.createElement('option');
            option.value = l.id;
            option.textContent = l.name;
            dropdown.appendChild(option);
        });
    } catch (e) {
        console.error('Error loading lawyers:', e);
    }
}

async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        // Fetch file-based events
        const { data: files, error } = await supabase
            .from('file_cases')
            .select('id, plaintiff, court_case_number, next_hearing_date, deadline_date, subject');

        if (error) throw error;

        const events = [];

        files?.forEach(file => {
            // Hearing Event
            if (file.next_hearing_date) {
                events.push({
                    id: file.id,
                    title: `Duruşma: ${file.plaintiff}`,
                    start: file.next_hearing_date,
                    backgroundColor: '#3b82f6', // Blue
                    borderColor: '#2563eb',
                    extendedProps: { type: 'hearing', caseNumber: file.court_case_number }
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
                    extendedProps: { type: 'deadline', caseNumber: file.court_case_number }
                });
            }
        });

        // Fetch manual events
        const { data: manualEvents } = await supabase
            .from('calendar_events')
            .select('*');

        manualEvents?.forEach(evt => {
            events.push({
                id: 'manual-' + evt.id,
                title: evt.title,
                start: evt.event_date + (evt.event_time ? 'T' + evt.event_time : ''),
                backgroundColor: '#10b981', // Green for manual
                borderColor: '#059669',
                extendedProps: { type: 'manual', notes: evt.notes }
            });
        });

        successCallback(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        showToast('Takvim verileri yüklenirken hata oluştu.', 'error');
        failureCallback(error);
    }
}

// Modal Functions
function openNewEventModal() {
    const modal = document.getElementById('new-event-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Set default date to today
        document.getElementById('event-date').value = new Date().toISOString().split('T')[0];
        lucide.createIcons();
    }
}

function closeNewEventModal() {
    const modal = document.getElementById('new-event-modal');
    if (modal) {
        modal.style.display = 'none';
        // Clear form
        document.getElementById('event-date').value = '';
        document.getElementById('event-time').value = '';
        document.getElementById('event-lawyer').value = '';
        document.getElementById('event-title').value = '';
        document.getElementById('event-notes').value = '';
    }
}

async function saveNewEvent() {
    const eventDate = document.getElementById('event-date').value;
    const eventTime = document.getElementById('event-time').value;
    const lawyerId = document.getElementById('event-lawyer').value;
    const title = document.getElementById('event-title').value.trim();
    const notes = document.getElementById('event-notes').value.trim();

    if (!eventDate || !title) {
        showToast('Tarih ve başlık zorunludur!', 'error');
        return;
    }

    try {
        const { error } = await supabase.from('calendar_events').insert({
            event_date: eventDate,
            event_time: eventTime || null,
            lawyer_id: lawyerId || null,
            title: title,
            notes: notes || null
        });

        if (error) throw error;

        showToast('Etkinlik başarıyla eklendi!', 'success');
        closeNewEventModal();

        // Refresh calendar
        if (calendarInstance) {
            calendarInstance.refetchEvents();
        }

    } catch (e) {
        console.error('Error saving event:', e);
        showToast('Etkinlik kaydedilemedi: ' + e.message, 'error');
    }
}
