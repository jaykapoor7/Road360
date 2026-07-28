import type { TripRecord } from '@/lib/domain/trip';
import type { TripSampleChunk } from '@/lib/domain/samples';
import type { TripEvent } from '@/lib/domain/events';
import type { RoadSegmentContribution } from '@/lib/domain/sync';
import type { DeviceId, SyncMeta } from '@/lib/domain/schema';
import { compareRecords } from './merge';
import { itemKey, type PullPage, type PushItem, type PushResult, type SyncTransport } from './transport';

/**
 * An in-memory server implementing the same contract a real one would.
 *
 * This is what makes the sync engine genuinely testable rather than merely
 * written: two independent "devices" can sync against one instance and the
 * tests assert real convergence, conflict resolution and cursor behaviour —
 * including deliberately injected failures and out-of-order delivery.
 *
 * It also drives the in-app sync demo, so the feature is demonstrable today.
 */
export class MemoryTransport implements SyncTransport {
  readonly id = 'memory';

  private readonly records = new Map<string, { item: PushItem; seq: number }>();
  private readonly contributions: RoadSegmentContribution[] = [];
  private seq = 0;

  /** Test hooks: force transient failures or latency. */
  failNextPushes = 0;
  failNextPulls = 0;
  latencyMs = 0;

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  async push(items: PushItem[], _deviceId: DeviceId): Promise<PushResult> {
    await this.delay();

    if (this.failNextPushes > 0) {
      this.failNextPushes -= 1;
      throw new Error('memory transport: simulated push failure');
    }

    const accepted: string[] = [];
    const conflicts: PushItem[] = [];

    for (const item of items) {
      const key = itemKey(item);
      const existing = this.records.get(key);

      if (existing) {
        const choice = compareRecords(
          item.record as SyncMeta,
          existing.item.record as SyncMeta,
        );
        // The server's copy is newer — reject and hand it back so the client
        // merges rather than retrying a push it would lose again.
        if (choice === 'remote') {
          conflicts.push(existing.item);
          continue;
        }
      }

      this.records.set(key, { item, seq: ++this.seq });
      accepted.push(key);
    }

    return { accepted, conflicts, failed: [] };
  }

  async pull(cursor: string | null, deviceId: DeviceId): Promise<PullPage> {
    await this.delay();

    if (this.failNextPulls > 0) {
      this.failNextPulls -= 1;
      throw new Error('memory transport: simulated pull failure');
    }

    const since = cursor ? Number(cursor) : 0;
    const pageSize = 200;

    const changed = [...this.records.values()]
      .filter((r) => r.seq > since)
      // A device does not need its own writes back.
      .filter((r) => (r.item.record as SyncMeta).deviceId !== deviceId)
      .sort((a, b) => a.seq - b.seq);

    const page = changed.slice(0, pageSize);
    const trips: TripRecord[] = [];
    const chunks: TripSampleChunk[] = [];
    const events: TripEvent[] = [];

    for (const { item } of page) {
      if (item.entity === 'trip') trips.push(item.record);
      else if (item.entity === 'chunk') chunks.push(item.record);
      else events.push(item.record);
    }

    const lastSeq = page.length > 0 ? page[page.length - 1]!.seq : since;
    return {
      trips,
      chunks,
      events,
      cursor: String(lastSeq),
      hasMore: changed.length > page.length,
    };
  }

  async contribute(cells: RoadSegmentContribution[]): Promise<void> {
    await this.delay();
    this.contributions.push(...cells);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  /* ------------------------------ inspection ----------------------------- */

  get size(): number {
    return this.records.size;
  }

  get contributionCount(): number {
    return this.contributions.length;
  }

  allContributions(): RoadSegmentContribution[] {
    return [...this.contributions];
  }

  getTrip(id: string): TripRecord | null {
    const entry = this.records.get(`trip:${id}`);
    return entry && entry.item.entity === 'trip' ? entry.item.record : null;
  }

  reset(): void {
    this.records.clear();
    this.contributions.length = 0;
    this.seq = 0;
  }
}
