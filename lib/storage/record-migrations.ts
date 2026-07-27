import { SCHEMA_VERSION, type SyncMeta } from '@/lib/domain/schema';

/**
 * Per-record migration, applied lazily on read.
 *
 * Distinct from the database migrations in `migrations.ts`: those run once when
 * the local schema version changes. These handle a record *written by a
 * different client* — which is exactly the situation cloud sync creates, where
 * a newer phone can push a record shaped for a version this device has not seen.
 * Building it now means sync does not need a data migration later.
 */
export type RecordUpgrade<T> = (record: T) => T;

export interface RecordMigration<T> {
  /** Upgrades records at this version to `toVersion`. */
  fromVersion: number;
  toVersion: number;
  upgrade: RecordUpgrade<T>;
}

/** No upgrades yet — v1 is the first shipped schema. */
export const TRIP_RECORD_MIGRATIONS: RecordMigration<never>[] = [];

export function migrateRecord<T extends SyncMeta>(
  record: T,
  migrations: readonly RecordMigration<T>[],
): T {
  let current = record;
  let guard = 0;

  while (current.schemaVersion < SCHEMA_VERSION) {
    const next = migrations.find((m) => m.fromVersion === current.schemaVersion);
    if (!next) {
      // Nothing knows how to advance this record. Stamping it forward would
      // claim a shape we have not verified, so leave it and let callers treat
      // missing fields as absent.
      break;
    }
    current = { ...next.upgrade(current), schemaVersion: next.toVersion };
    if (++guard > 32) break; // cycle guard: a malformed migration chain must not hang the app
  }

  return current;
}

/** A record written by a *newer* client than this one. Readable, but not writable. */
export function isFromFutureSchema(record: SyncMeta): boolean {
  return record.schemaVersion > SCHEMA_VERSION;
}
