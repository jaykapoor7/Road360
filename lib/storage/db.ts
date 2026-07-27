import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type Road360DB } from './schema';
import { runMigrations } from './migrations';

let dbPromise: Promise<IDBPDatabase<Road360DB>> | null = null;

/**
 * Single shared connection. Opening IndexedDB more than once from the same tab
 * is legal but wasteful, and concurrent `upgradeneeded` handlers race.
 */
export function getDb(): Promise<IDBPDatabase<Road360DB>> {
  if (!dbPromise) {
    dbPromise = openDB<Road360DB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        runMigrations(db, oldVersion, newVersion);
      },
      blocking() {
        // Another tab wants to upgrade. Release the connection so it can, or
        // that tab hangs forever on a version-change transaction.
        void closeDb();
      },
    });
  }
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}

/** Test helper: drops everything and forces a fresh open. */
export async function deleteDatabase(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
