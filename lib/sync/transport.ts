import type { TripRecord } from '@/lib/domain/trip';
import type { TripSampleChunk } from '@/lib/domain/samples';
import type { TripEvent } from '@/lib/domain/events';
import type { RoadSegmentContribution } from '@/lib/domain/sync';
import type { DeviceId, Millis } from '@/lib/domain/schema';

/**
 * The network boundary.
 *
 * The sync *engine* — batching, retry, conflict resolution, cursor management —
 * is transport-agnostic and fully tested against an in-memory server. Only this
 * interface knows about the network, so pointing Road360 at a real backend is
 * an implementation of four methods, not a rewrite of the sync logic.
 */

export type SyncEntity = 'trip' | 'chunk' | 'event';

/** One record to push. The union is discriminated so a batch can be mixed. */
export type PushItem =
  | { entity: 'trip'; record: TripRecord }
  | { entity: 'chunk'; record: TripSampleChunk }
  | { entity: 'event'; record: TripEvent };

export interface PushResult {
  /** Keys the server accepted, echoed so the engine can ack precisely. */
  accepted: string[];
  /**
   * Records the server rejected because its copy is newer. The engine merges
   * these back rather than retrying a push it would lose again.
   */
  conflicts: PushItem[];
  /** Keys that failed transiently and should be retried. */
  failed: { key: string; error: string }[];
}

export interface PullPage {
  trips: TripRecord[];
  chunks: TripSampleChunk[];
  events: TripEvent[];
  /** Opaque; pass back to continue. Null when caught up. */
  cursor: string | null;
  hasMore: boolean;
}

export interface SyncTransport {
  readonly id: string;
  /** Push a batch. Implementations should be idempotent on `key`. */
  push(items: PushItem[], deviceId: DeviceId): Promise<PushResult>;
  /** Pull everything changed since `cursor`. */
  pull(cursor: string | null, deviceId: DeviceId): Promise<PullPage>;
  /** Anonymous community contributions. Fire-and-forget, never blocks a sync. */
  contribute(cells: RoadSegmentContribution[]): Promise<void>;
  /** Cheap reachability check. */
  ping?(): Promise<boolean>;
}

/** Stable key for a record, used for acks and idempotency. */
export function itemKey(item: PushItem): string {
  switch (item.entity) {
    case 'trip':
      return `trip:${item.record.id}`;
    case 'chunk':
      return `chunk:${item.record.tripId}:${item.record.chunk}`;
    case 'event':
      return `event:${item.record.tripId}:${item.record.seq}`;
  }
}

export interface SyncClock {
  now(): Millis;
}

export const systemClock: SyncClock = { now: () => Date.now() };
