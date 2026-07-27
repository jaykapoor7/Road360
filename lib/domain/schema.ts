/**
 * Identity and sync metadata shared by every persisted record.
 *
 * There is no backend yet, but every record carries the fields a sync engine
 * needs (stable id, origin device, revision counter, dirty flag, tombstone).
 * Adding cloud sync later is then additive rather than a data migration.
 */

export const SCHEMA_VERSION = 1 as const;

/** ULID — lexicographically sortable by creation time, so `by-id` is also `by-time`. */
export type TripId = string & { readonly __brand: 'TripId' };
export type DeviceId = string & { readonly __brand: 'DeviceId' };

/** Absolute wall-clock time, epoch milliseconds, UTC. */
export type Millis = number;
/** Milliseconds elapsed since the start of a trip. */
export type Offset = number;

export interface SyncMeta {
  /** Record-level version, enabling lazy per-record upgrades on read. */
  schemaVersion: number;
  deviceId: DeviceId;
  createdAt: Millis;
  updatedAt: Millis;
  /** Local monotonic counter. Conflict resolution is LWW on (updatedAt, revision, deviceId). */
  revision: number;
  syncedAt: Millis | null;
  /** Indexable "needs push" flag. IndexedDB cannot index booleans. */
  dirty: 0 | 1;
  /** Tombstone. Synced rows are never hard-deleted, or they resurrect on next pull. */
  deleted: 0 | 1;
  remoteId: string | null;
}

export function newSyncMeta(deviceId: DeviceId, now: Millis): SyncMeta {
  return {
    schemaVersion: SCHEMA_VERSION,
    deviceId,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    syncedAt: null,
    dirty: 1,
    deleted: 0,
    remoteId: null,
  };
}

/** Bump on every local mutation so the outbox and LWW resolution stay correct. */
export function touchSyncMeta<T extends SyncMeta>(record: T, now: Millis): T {
  return { ...record, updatedAt: now, revision: record.revision + 1, dirty: 1 };
}
