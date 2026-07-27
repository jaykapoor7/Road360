import type { IDBPDatabase } from 'idb';
import type { Road360DB } from './schema';

/**
 * Append-only. Never edit a migration that has shipped — a user's database is
 * already at that version and will not re-run it, so an edit silently produces
 * two different schemas in the wild.
 */
export interface Migration {
  version: number;
  migrate(db: IDBPDatabase<Road360DB>): void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    migrate(db) {
      const trips = db.createObjectStore('trips', { keyPath: 'id' });
      trips.createIndex('by-startedAt', 'startedAt');
      trips.createIndex('by-dayKey', 'dayKey');
      trips.createIndex('by-weekKey', 'weekKey');
      trips.createIndex('by-monthKey', 'monthKey');
      trips.createIndex('by-status', 'status');
      trips.createIndex('by-dirty', 'dirty');

      const chunks = db.createObjectStore('tripChunks', { keyPath: ['tripId', 'chunk'] });
      chunks.createIndex('by-tripId', 'tripId');
      chunks.createIndex('by-dirty', 'dirty');

      const events = db.createObjectStore('tripEvents', { keyPath: ['tripId', 'seq'] });
      events.createIndex('by-tripId', 'tripId');
      events.createIndex('by-type', ['tripId', 'type']);
      events.createIndex('by-dirty', 'dirty');

      const aggregates = db.createObjectStore('aggregates', { keyPath: 'key' });
      aggregates.createIndex('by-kind', 'kind');
      aggregates.createIndex('by-dirty', 'dirty');

      const achievements = db.createObjectStore('achievements', { keyPath: 'id' });
      achievements.createIndex('by-unlockedAt', 'unlockedAt');

      const outbox = db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      outbox.createIndex('by-nextAttemptAt', 'nextAttemptAt');
      outbox.createIndex('by-entity', 'entity');

      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('meta', { keyPath: 'key' });
    },
  },
];

export function runMigrations(
  db: IDBPDatabase<Road360DB>,
  oldVersion: number,
  newVersion: number | null,
): void {
  const target = newVersion ?? 0;
  for (const migration of MIGRATIONS) {
    if (migration.version > oldVersion && migration.version <= target) {
      migration.migrate(db);
    }
  }
}
