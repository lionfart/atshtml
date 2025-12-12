import { getDb, Lawyer, FileCase } from '../database';
import { v4 as uuidv4 } from 'uuid';

export async function assignLawyerToFile(fileAttributes: Pick<FileCase, 'plaintiff' | 'subject'>): Promise<FileCase> {
    const db = await getDb();
    if (!db.data) {
        throw new Error('Database not initialized');
    }

    const { lawyers, system_settings, file_cases } = db.data;

    // --- 0. Auto-Activate Scheduled Lawyers ---
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let rosterChanged = false;

    lawyers.forEach(l => {
        if (l.status === 'ON_LEAVE' && l.leave_return_date) {
            // Compare dates (simple string compare works for ISO YYYY-MM-DD)
            if (today >= l.leave_return_date) {
                console.log(`[Auto-Activate] Lawyer ${l.name} returned from leave.`);
                l.status = 'ACTIVE';
                l.leave_return_date = undefined; // Clear date
                rosterChanged = true;
            }
        }
    });

    if (rosterChanged) {
        await db.write(); // Save status changes immediately
    }

    const activeLawyers = lawyers.filter(l => l.status === 'ACTIVE');

    if (activeLawyers.length === 0) {
        throw new Error('No active lawyers available for assignment');
    }

    let selectedLawyerId: string | null = null;

    // --- ALGORITHM START: Global Phase-Based Balance ---

    // 1. Calculate Average
    const totalFilesAssigned = activeLawyers.reduce((sum, l) => sum + l.assigned_files_count, 0);
    const targetAverage = totalFilesAssigned / activeLawyers.length;

    // 2. Identify Deficit Lawyers
    const neededLawyers = activeLawyers
        .map(l => ({ ...l, deficit: targetAverage - l.assigned_files_count }))
        .filter(l => l.deficit > 0)
        .sort((a, b) => b.deficit - a.deficit);

    // 3. Determine Phase (Burst vs Maintenance)
    const burstLimit = system_settings.catchup_burst_limit || 2;
    const currentSeq = system_settings.catchup_sequence_count || 0;

    // Rule: We allow 'burstLimit' number of catch-up assignments in a row.
    // Then we force 1 Maintenance (Round Robin) assignment.

    // Check if we are in "Catch-up Mode" AND have candidates
    if (neededLawyers.length > 0 && currentSeq < burstLimit) {
        // Assign to highest deficit
        const candidate = neededLawyers[0];
        selectedLawyerId = candidate.id;

        // Increment sequence count
        system_settings.catchup_sequence_count = currentSeq + 1;
        console.log(`[Phase: CATCH-UP ${currentSeq + 1}/${burstLimit}] Assigned to ${candidate.name} (Deficit: ${candidate.deficit.toFixed(2)})`);
    } else {
        // Either no deficit, OR we hit the burst limit.
        // Proceed to Standard Round Robin (Maintenance Turn)
        console.log(`[Phase: MAINTENANCE] forcing normal rotation.`);

        // Reset sequence count only if we *had* a deficit group waiting (meaning we just finished a burst)
        // OR always reset? Alway resetting ensures that after 1 maintenance file, we go back to catch-up if needed.
        system_settings.catchup_sequence_count = 0;
    }

    // 4. Standard Round Robin (Fallback or Maintenance Phase)
    if (!selectedLawyerId) {
        const count = lawyers.length;
        let found = false;
        let cycles = 0;

        let currentIndex = (system_settings.last_assignment_index + 1) % count;

        while (!found && cycles < 2) {
            const candidate = lawyers[currentIndex];

            if (candidate.status === 'ACTIVE') {
                selectedLawyerId = candidate.id;
                system_settings.last_assignment_index = currentIndex;
                found = true;
                console.log(`[Rotation] Assigned to ${candidate.name}`);
            } else {
                currentIndex = (currentIndex + 1) % count;
                if (currentIndex === (system_settings.last_assignment_index + 1) % count) {
                    cycles++;
                }
            }
        }
    }

    // --- ALGORITHM END ---

    if (!selectedLawyerId) {
        selectedLawyerId = activeLawyers[0].id;
    }

    // Update Stats
    const lawyerRef = lawyers.find(l => l.id === selectedLawyerId);
    if (lawyerRef) {
        lawyerRef.assigned_files_count++;
    }

    const year = new Date().getFullYear();
    const countForYear = file_cases.filter(f => f.created_at.startsWith(year.toString())).length + 1;
    const regNum = `${year}/${countForYear.toString().padStart(4, '0')}`;

    const newFile: FileCase = {
        id: uuidv4(),
        registration_number: regNum,
        plaintiff: fileAttributes.plaintiff,
        subject: fileAttributes.subject,
        lawyer_id: selectedLawyerId,
        created_at: new Date().toISOString(),
        status: 'OPEN',
    };

    db.data.file_cases.push(newFile);
    await db.write();

    return newFile;
}
