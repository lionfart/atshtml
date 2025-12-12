// Shared Types/Interfaces (Client-Safe)
// This file should NOT contain any server-only code like getDb or fs operations.

export interface CaseNote {
    id: string;
    file_case_id: string;
    lawyer_id: string | null;
    content: string;
    created_at: string;
}

export interface Document {
    id: string;
    name: string;
    type: string;
    upload_date: string;
    file_case_id: string;
    path: string;
    analysis?: {
        type: string;
        summary: string;
        subject?: string;
    };
}

export interface FileCase {
    id: string;
    registration_number: string;
    plaintiff: string;
    subject: string;
    lawyer_id: string | null;
    created_at: string;
    status: 'OPEN' | 'CLOSED';
    latest_activity_type?: string;
    latest_activity_date?: string;
    latest_decision_result?: string;
}

export interface Lawyer {
    id: string;
    name: string;
    username?: string;
    password_hash?: string;
    role?: 'ADMIN' | 'LAWYER';
    email?: string;
    status: 'ACTIVE' | 'ON_LEAVE';
    leave_return_date?: string;
    missed_assignments_count: number;
    assigned_files_count: number;
    deficit?: number;
}

export interface SystemSettings {
    last_assignment_index: number;
    catchup_burst_limit: number;
    catchup_sequence_count: number;
    gemini_api_key?: string;
}

export interface DbSchema {
    lawyers: Lawyer[];
    file_cases: FileCase[];
    documents: Document[];
    notes: CaseNote[];
    system_settings: SystemSettings;
}
