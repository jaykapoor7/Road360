import type { Road360Repository } from '@/lib/storage/repository';
import type { Flags } from '@/lib/config/flags';

/**
 * Cloud sync, scaffolded and inert.
 *
 * `start()` is a deliberate no-op while `flags.syncEnabled` is false. The
 * design is fixed so that turning it on is a matter of implementing
 * `RemoteRepository` and flipping the flag:
 *
 *   1. claim due ops from the outbox (already populated by every local write)
 *   2. batch them by entity and push
 *   3. on success set syncedAt, clear dirty, record remoteId
 *   4. pull changes since the last server cursor
 *   5. resolve conflicts last-write-wins on (updatedAt, revision, deviceId),
 *      with `deleted` tombstones winning ties so a delete is never undone by a
 *      concurrent edit
 */
export interface SyncEngineOptions {
  local: Road360Repository;
  remote?: Road360Repository;
  flags: Flags;
  batchSize?: number;
}

export interface SyncStatus {
  enabled: boolean;
  pending: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

export class SyncEngine {
  private running = false;

  constructor(private readonly options: SyncEngineOptions) {}

  async status(): Promise<SyncStatus> {
    return {
      enabled: this.options.flags.syncEnabled,
      pending: await this.options.local.outbox.size(),
      lastSyncAt: null,
      lastError: null,
    };
  }

  /** No-op until a backend exists. Present so callers need no conditional. */
  async start(): Promise<void> {
    if (!this.options.flags.syncEnabled || !this.options.remote) return;
    if (this.running) return;
    this.running = true;
    // Intentionally unimplemented — see the class comment for the shape.
  }

  stop(): void {
    this.running = false;
  }
}
