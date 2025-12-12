import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';

// Re-export types for backward compatibility with server-side code
export type { CaseNote, Document, FileCase, Lawyer, DbSchema, SystemSettings } from './types';
import type { DbSchema } from './types';

// --- Database Setup ---

// Define the path for the JSON database file
const DB_FILE_NAME = 'db.json';
const DB_DIR_PATH = process.env.DATABASE_DIR || './data'; // Allows configuring DB directory via env
const DB_FULL_PATH = path.resolve(process.cwd(), DB_DIR_PATH, DB_FILE_NAME);

let dbInstance: Low<DbSchema> | null = null;

/**
 * Initializes and returns a singleton Lowdb database instance.
 * If the database file doesn't exist, it will be created with default data.
 */
export async function getDb(): Promise<Low<DbSchema>> {
  if (!dbInstance) {
    // Ensure directory exists
    const dirname = path.dirname(DB_FULL_PATH);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }

    const adapter = new JSONFile<DbSchema>(DB_FULL_PATH);
    dbInstance = new Low<DbSchema>(adapter, {
      lawyers: [],
      file_cases: [],
      documents: [],
      notes: [],
      system_settings: { last_assignment_index: -1, catchup_burst_limit: 2, catchup_sequence_count: 0, gemini_api_key: "" }
    });

    // Read data from JSON file
    await dbInstance.read();

    // Initialize defaults if empty
    if (!dbInstance.data) {
      dbInstance.data = {
        lawyers: [],
        file_cases: [],
        documents: [],
        notes: [],
        system_settings: {
          last_assignment_index: -1,
          catchup_burst_limit: 2,
          catchup_sequence_count: 0,
          gemini_api_key: ""
        }
      };
      await dbInstance.write();
    } else {
      // Migration: If system_settings is missing
      if (!dbInstance.data.system_settings) {
        dbInstance.data.system_settings = {
          last_assignment_index: -1,
          catchup_burst_limit: 2,
          catchup_sequence_count: 0,
          gemini_api_key: ""
        };
        // Ensure notes exists
        if (!dbInstance.data.notes) dbInstance.data.notes = [];
        await dbInstance.write();
      } else {
        // Partial migrations
        let changed = false;
        if (!dbInstance.data.notes) {
          dbInstance.data.notes = [];
          changed = true;
        }
        if (typeof dbInstance.data.system_settings.catchup_burst_limit === 'undefined') {
          dbInstance.data.system_settings.catchup_burst_limit = 2;
          changed = true;
        }
        if (typeof dbInstance.data.system_settings.catchup_sequence_count === 'undefined') {
          dbInstance.data.system_settings.catchup_sequence_count = 0;
          changed = true;
        }
        if (typeof dbInstance.data.system_settings.gemini_api_key === 'undefined') {
          dbInstance.data.system_settings.gemini_api_key = "";
          changed = true;
        }
        if (changed) {
          await dbInstance.write();
        }
      }
    }
  }
  return dbInstance;
}
