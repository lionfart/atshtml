import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node'; // Correct import path for JSONFile
import path from 'path';
import fs from 'fs'; // Used only for checking directory existence synchronously for initial setup

// Define the generic shape of your database for the template.
// The AI will extend this schema based on user's specific app requirements.
interface DbSchema {
  examples: { id: number; name: string; createdAt: string }[];
  // Future: The AI will add new collections here based on user needs, e.g.,
  // myCustomData: { id: string; value: string }[];
}

// Define the path for the JSON database file
const DB_FILE_NAME = 'db.json';
const DB_DIR_PATH = process.env.DATABASE_DIR || './data'; // Allows configuring DB directory via env
const DB_FULL_PATH = path.resolve(process.cwd(), DB_DIR_PATH, DB_FILE_NAME);

let dbInstance: Low<DbSchema> | null = null;

/**
 * Initializes and returns a singleton Lowdb database instance.
 * If the database file doesn't exist, it will be created with default data.
 * @returns {Promise<Low<DbSchema>>} The database instance.
 */
export async function getDb(): Promise<Low<DbSchema>> {
  if (dbInstance) {
    if (dbInstance.data) {
      return dbInstance;
    }
    await dbInstance.read();
    return dbInstance;
  }

  try {
    // Ensure the directory for the database file exists
    const dir = path.dirname(DB_FULL_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const adapter = new JSONFile<DbSchema>(DB_FULL_PATH);
    // Provide initial generic structure for the template
    dbInstance = new Low<DbSchema>(adapter, { examples: [] });

    await dbInstance.read();

    console.log(`Database initialized/loaded from: ${DB_FULL_PATH}`);

    return dbInstance;
  } catch (error) {
    console.error('Failed to initialize Lowdb database:', error);
    throw error;
  }
}

// Note: With Lowdb and JSONFile adapter, after any modification to db.data,
// you must call `db.write()` to persist changes to the file.
// This will be handled in the API routes.
