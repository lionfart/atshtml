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
        dayMaxEvents: 3, // Shows "+X more" if more than 3
        moreLinkContent: function (args) { return '+' + args.num; }, // Custom format: "+7"
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

    // Global Helper for Filter
    window.refetchCalendarEvents = () => {
        if (calendarInstance) calendarInstance.refetchEvents();
    };
});

async function loadLawyersForDropdown() {
    try {
        const { data: lawyers } = await supabase.from('lawyers').select('id, name');

        // Populate New Event Modal Dropdown
        const modalDropdown = document.getElementById('event-lawyer');
        if (modalDropdown && lawyers) {
            modalDropdown.innerHTML = '<option value="">-- Seçiniz --</option>'; // Reset
            lawyers.forEach(l => {
                const option = document.createElement('option');
                option.value = l.id;
                option.textContent = l.name;
                modalDropdown.appendChild(option);
            });
        }

        // Populate Filter Dropdown
        const filterDropdown = document.getElementById('calendar-filter-lawyer');
        if (filterDropdown && lawyers) {
            filterDropdown.innerHTML = '<option value="">Tüm Dosyalar</option>'; // Reset
            lawyers.forEach(l => {
                const fOption = document.createElement('option');
                fOption.value = l.id;
                fOption.textContent = l.name;
                filterDropdown.appendChild(fOption);
            });
        }
    } catch (e) {
        console.error('Error loading lawyers:', e);
    }
}

async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const filterLawyerId = document.getElementById('calendar-filter-lawyer')?.value;

        // FETCH FILES with Relation
        // Using strict select to avoid 'column does not exist' for explicit columns
        // Relying on mapped relationship for lawyers.
        const { data: files, error } = await supabase
            .from('file_cases')
            .select('id, plaintiff, court_case_number, next_hearing_date, deadline_date, subject, lawyers(id, name)');

        if (error) throw error;

        const events = [];

        files?.forEach(file => {
            // CLIENT-SIDE FILTERING
            if (filterLawyerId) {
                // If file has no lawyer or ID doesn't match, skip it
                if (!file.lawyers || file.lawyers.id !== filterLawyerId) return;
            }

            // Hearing Event
            if (file.next_hearing_date) {
                events.push({
                    id: file.id,
                    title: `${file.court_case_number || 'Dosya No Yok'} - ${file.lawyers?.name || 'Avukat Yok'} (Duruşma)`,
                    start: file.next_hearing_date,
                    backgroundColor: '#4f46e5', // Indigo
                    borderColor: '#4338ca',
                    textColor: '#ffffff',
                    extendedProps: { type: 'hearing', caseNumber: file.court_case_number }
                });
            }

            // Deadline Event
            if (file.deadline_date) {
                events.push({
                    id: file.id,
                    title: `${file.court_case_number || 'Dosya No Yok'} - ${file.lawyers?.name || 'Avukat Yok'} (Süre)`,
                    start: file.deadline_date,
                    backgroundColor: '#e11d48', // Rose
                    borderColor: '#be123c',
                    textColor: '#ffffff',
                    extendedProps: { type: 'deadline', caseNumber: file.court_case_number }
                });
            }
        });

        // FETCH MANUAL EVENTS
        // Manual events table has explicit 'lawyer_id' column usuallly? 
        // Or relationships. Let's assume standard 'lawyers(id, name)' works.
        const { data: manualEvents } = await supabase
            .from('calendar_events')
            .select('*, lawyers(name, id)');

        manualEvents?.forEach(evt => {
            // Filter
            if (filterLawyerId) {
                // Check relationship OR direct column if available
                const lId = evt.lawyers?.id || evt.lawyer_id;
                if (!lId || lId !== filterLawyerId) return;
            }

            const lawyerName = evt.lawyers?.name ? ` (${evt.lawyers.name})` : '';
            events.push({
                id: 'manual-' + evt.id,
                title: evt.title + lawyerName,
                start: evt.event_date + (evt.event_time ? 'T' + evt.event_time : ''),
                backgroundColor: '#059669', // Emerald
                borderColor: '#047857',
                textColor: '#ffffff',
                extendedProps: { type: 'manual', notes: evt.notes, lawyer: evt.lawyers?.name }
            });
        });

        successCallback(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        // showToast('Takvim verileri yüklenirken hata oluştu.', 'error'); // Silent fail better for UX sometimes
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
