import type { SyncMeta } from '@/lib/domain/schema';

/**
 * Conflict resolution: last-write-wins on `(updatedAt, revision, deviceId)`.
 *
 * The tiebreak chain matters. `updatedAt` alone is not enough — two devices
 * with clocks a second apart would flip-flop, and edits made in the same
 * millisecond would resolve arbitrarily. `revision` breaks ties deterministically
 * for the common case, and `deviceId` is a final, stable, arbitrary-but-consistent
 * tiebreak so every device independently reaches the *same* answer without
 * needing to coordinate.
 */
export type MergeChoice = 'local' | 'remote' | 'equal';

export function compareRecords(local: SyncMeta, remote: SyncMeta): MergeChoice {
  // A delete always wins over a concurrent edit. Resurrecting a record the user
  // deleted is far worse than losing an edit they made to it.
  if (local.deleted !== remote.deleted) {
    return local.deleted === 1 ? 'local' : 'remote';
  }

  if (local.updatedAt !== remote.updatedAt) {
    return local.updatedAt > remote.updatedAt ? 'local' : 'remote';
  }
  if (local.revision !== remote.revision) {
    return local.revision > remote.revision ? 'local' : 'remote';
  }
  if (local.deviceId !== remote.deviceId) {
    return local.deviceId > remote.deviceId ? 'local' : 'remote';
  }
  return 'equal';
}

/** Pick the winner, or `null` when they are identical and nothing need change. */
export function mergeRecord<T extends SyncMeta>(local: T | null, remote: T): T | null {
  if (!local) return remote;
  const choice = compareRecords(local, remote);
  if (choice === 'remote') return remote;
  return null;
}

/**
 * A record is safe to consider synced when the server has acknowledged the
 * exact revision we pushed. If it changed locally in the meantime, it stays
 * dirty and goes out again.
 */
export function isStillPending(record: SyncMeta, pushedRevision: number): boolean {
  return record.revision !== pushedRevision;
}
