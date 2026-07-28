import type { Road360Repository } from '@/lib/storage/repository';
import type { TripRecord } from '@/lib/domain/trip';
import type { TripId, Millis, DeviceId } from '@/lib/domain/schema';
import type { OutboxOp } from '@/lib/domain/sync';
import { mergeRecord } from './merge';
import { itemKey, type PushItem, type SyncTransport } from './transport';

/**
 * The sync engine.
 *
 * Drains the outbox that every local write has been filling since the very
 * first trip, then pulls remote changes and merges them last-write-wins. It is
 * transport-agnostic: everything here is exercised in tests against
 * `MemoryTransport`, and a real backend only has to implement `SyncTransport`.
 *
 * Design notes that matter:
 *
 *  - Push before pull. Sending local work first means a conflict is detected
 *    while we still hold both versions, rather than being silently overwritten
 *    by a pull that landed first.
 *  - Acks are per-key, not per-batch. A partially accepted batch must not
 *    re-send the accepted half.
 *  - A record that changed *during* the push stays dirty. Clearing the flag on
 *    the revision we sent would drop an edit made mid-flight.
 *  - Failures back off in the outbox rather than spinning, and a run never
 *    throws — sync failing is not an app error.
 */

export type SyncPhase = 'idle' | 'pushing' | 'pulling' | 'error';

export interface SyncStatus {
  enabled: boolean;
  phase: SyncPhase;
  pending: number;
  lastSyncAt: Millis | null;
  lastError: string | null;
  pushed: number;
  pulled: number;
  conflicts: number;
}

export interface SyncEngineOptions {
  repository: Road360Repository;
  transport: SyncTransport;
  deviceId: DeviceId;
  batchSize?: number;
  /** Where the pull cursor is persisted between runs. */
  cursorKey?: string;
  now?: () => Millis;
}

const DEFAULT_BATCH = 50;
const CURSOR_KEY = 'sync.cursor';
const LAST_SYNC_KEY = 'sync.lastSyncAt';

export class SyncEngine {
  private readonly batchSize: number;
  private readonly cursorKey: string;
  private readonly now: () => Millis;

  private phase: SyncPhase = 'idle';
  private lastError: string | null = null;
  private running: Promise<SyncStatus> | null = null;
  private counters = { pushed: 0, pulled: 0, conflicts: 0 };

  constructor(private readonly options: SyncEngineOptions) {
    this.batchSize = options.batchSize ?? DEFAULT_BATCH;
    this.cursorKey = options.cursorKey ?? CURSOR_KEY;
    this.now = options.now ?? (() => Date.now());
  }

  async status(): Promise<SyncStatus> {
    const { repository } = this.options;
    return {
      enabled: true,
      phase: this.phase,
      pending: await repository.outbox.size(),
      lastSyncAt: await repository.settings.get<Millis | null>(LAST_SYNC_KEY, null),
      lastError: this.lastError,
      ...this.counters,
    };
  }

  /**
   * Run one full cycle. Concurrent calls share the in-flight run rather than
   * racing — two overlapping syncs would double-push and fight over the cursor.
   */
  async sync(): Promise<SyncStatus> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<SyncStatus> {
    this.counters = { pushed: 0, pulled: 0, conflicts: 0 };
    this.lastError = null;

    try {
      this.phase = 'pushing';
      await this.pushAll();

      this.phase = 'pulling';
      await this.pullAll();

      await this.options.repository.settings.set(LAST_SYNC_KEY, this.now());
      this.phase = 'idle';
    } catch (error) {
      // Sync failing is not an app failure. Record it and let the next run try.
      this.phase = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
    }

    return this.status();
  }

  /* --------------------------------- push -------------------------------- */

  private async pushAll(): Promise<void> {
    const { repository, transport, deviceId } = this.options;

    // Bounded so a huge backlog cannot spin forever in one run.
    for (let round = 0; round < 100; round++) {
      const ops = await repository.outbox.claim(this.batchSize, this.now());
      if (ops.length === 0) return;

      const { items, opsByKey, stale } = await this.materialize(ops);

      // Ops whose record no longer exists refer to data that was hard-deleted;
      // dropping them is correct, and leaving them would block the queue.
      for (const op of stale) if (op.id !== undefined) await repository.outbox.ack(op.id);
      if (items.length === 0) continue;

      // Snapshot revisions before the network call so we can tell whether a
      // record changed while it was in flight.
      const revisionAtPush = new Map<string, number>();
      for (const item of items) {
        revisionAtPush.set(itemKey(item), (item.record as { revision: number }).revision);
      }

      let result;
      try {
        result = await transport.push(items, deviceId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const op of ops) if (op.id !== undefined) await repository.outbox.fail(op.id, message);
        throw error;
      }

      for (const key of result.accepted) {
        const op = opsByKey.get(key);
        if (op?.id !== undefined) await repository.outbox.ack(op.id);
        this.counters.pushed += 1;
        await this.markSynced(key, revisionAtPush.get(key));
      }

      for (const conflict of result.conflicts) {
        const key = itemKey(conflict);
        const op = opsByKey.get(key);
        // The server's copy won. Ack our op — retrying would lose again — and
        // merge their version in.
        if (op?.id !== undefined) await repository.outbox.ack(op.id);
        this.counters.conflicts += 1;
        if (conflict.entity === 'trip') await this.applyRemoteTrip(conflict.record);
      }

      for (const failure of result.failed) {
        const op = opsByKey.get(failure.key);
        if (op?.id !== undefined) await repository.outbox.fail(op.id, failure.error);
      }
    }
  }

  /** Resolve outbox ops into the records they point at. */
  private async materialize(ops: readonly OutboxOp[]): Promise<{
    items: PushItem[];
    opsByKey: Map<string, OutboxOp>;
    stale: OutboxOp[];
  }> {
    const { repository } = this.options;
    const items: PushItem[] = [];
    const opsByKey = new Map<string, OutboxOp>();
    const stale: OutboxOp[] = [];

    // Chunks and events are addressed by trip, so fetch each trip's bulk data
    // once per batch rather than per op.
    const chunkCache = new Map<string, Awaited<ReturnType<typeof repository.trips.readChunks>>>();
    const eventCache = new Map<string, Awaited<ReturnType<typeof repository.trips.readEvents>>>();

    for (const op of ops) {
      if (op.entity === 'trip') {
        const trip = await repository.trips.get(op.entityKey as TripId);
        if (!trip) {
          stale.push(op);
          continue;
        }
        const item: PushItem = { entity: 'trip', record: trip };
        items.push(item);
        opsByKey.set(itemKey(item), op);
        continue;
      }

      if (op.entity === 'chunk') {
        const [tripId, indexRaw] = op.entityKey.split(':');
        if (!tripId) {
          stale.push(op);
          continue;
        }
        if (!chunkCache.has(tripId)) {
          chunkCache.set(tripId, await repository.trips.readChunks(tripId as TripId));
        }
        const chunk = chunkCache.get(tripId)!.find((c) => c.chunk === Number(indexRaw));
        if (!chunk) {
          stale.push(op);
          continue;
        }
        const item: PushItem = { entity: 'chunk', record: chunk };
        items.push(item);
        opsByKey.set(itemKey(item), op);
        continue;
      }

      if (op.entity === 'event') {
        const [tripId, seqRaw] = op.entityKey.split(':');
        if (!tripId) {
          stale.push(op);
          continue;
        }
        if (!eventCache.has(tripId)) {
          eventCache.set(tripId, await repository.trips.readEvents(tripId as TripId));
        }
        const event = eventCache.get(tripId)!.find((e) => e.seq === Number(seqRaw));
        if (!event) {
          stale.push(op);
          continue;
        }
        const item: PushItem = { entity: 'event', record: event };
        items.push(item);
        opsByKey.set(itemKey(item), op);
        continue;
      }

      // Aggregates and contributions are derived, never pushed as records.
      stale.push(op);
    }

    return { items, opsByKey, stale };
  }

  /** Clear the dirty flag, but only if the record has not changed since. */
  private async markSynced(key: string, pushedRevision: number | undefined): Promise<void> {
    if (!key.startsWith('trip:') || pushedRevision === undefined) return;

    const id = key.slice('trip:'.length) as TripId;
    const current = await this.options.repository.trips.get(id);
    if (!current || current.revision !== pushedRevision) return;

    // Written directly rather than through update(), which would bump the
    // revision and re-enqueue an outbox op — an endless sync loop.
    await this.options.repository.markTripSynced(id, this.now());
  }

  /* --------------------------------- pull -------------------------------- */

  private async pullAll(): Promise<void> {
    const { repository, transport, deviceId } = this.options;
    let cursor = await repository.settings.get<string | null>(this.cursorKey, null);

    for (let page = 0; page < 100; page++) {
      const result = await transport.pull(cursor, deviceId);

      for (const trip of result.trips) await this.applyRemoteTrip(trip);
      for (const chunk of result.chunks) await repository.trips.appendChunkRaw(chunk);
      if (result.events.length > 0) await repository.trips.appendEventsRaw(result.events);

      this.counters.pulled += result.trips.length + result.chunks.length + result.events.length;

      cursor = result.cursor;
      // Persist per page: an interrupted sync then resumes where it stopped
      // rather than replaying everything.
      await repository.settings.set(this.cursorKey, cursor);

      if (!result.hasMore) return;
    }
  }

  private async applyRemoteTrip(remote: TripRecord): Promise<void> {
    const { repository } = this.options;
    const local = await repository.trips.getRaw(remote.id);
    const winner = mergeRecord(local, remote);
    if (!winner) return;
    await repository.trips.putRaw(winner);
  }
}
