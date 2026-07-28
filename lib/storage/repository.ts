import type { TripRecord, TripListItem } from '@/lib/domain/trip';
import type { TripSample, TripSampleChunk } from '@/lib/domain/samples';
import type { TripEvent, TripEventType } from '@/lib/domain/events';
import type { PeriodAggregate, PersonalRecords, LifetimeStats } from '@/lib/domain/aggregates';
import type { AchievementRecord } from '@/lib/domain/achievements';
import type { OutboxOp } from '@/lib/domain/sync';
import type { Millis, Offset, TripId } from '@/lib/domain/schema';

/**
 * Storage contracts.
 *
 * Deliberately transport-agnostic — no `IDBKeyRange`, no cursors, nothing
 * IndexedDB-shaped appears in any signature. That constraint is what lets a
 * future cloud adapter implement the same interface, and the reason the
 * `RemoteRepository` stub exists at all is to keep it honest.
 */

export interface TripQuery {
  limit?: number;
  /** Exclusive upper bound on startedAt, for cursor pagination. */
  before?: Millis;
  status?: TripRecord['status'];
  /** Demo trips are excluded from lifetime stats unless explicitly requested. */
  includeSimulated?: boolean;
}


export interface NewTrip {
  id: TripId;
  startedAt: Millis;
  simulated: boolean;
  sensorsUsed: TripRecord['sensorsUsed'];
  detectorId: string;
}

export interface TripRepository {
  create(input: NewTrip): Promise<TripRecord>;
  get(id: TripId): Promise<TripRecord | null>;
  /** Bumps revision, sets updatedAt and dirty, and enqueues an outbox op. */
  update(id: TripId, patch: Partial<TripRecord>): Promise<TripRecord>;
  softDelete(id: TripId): Promise<void>;
  list(query?: TripQuery): Promise<TripListItem[]>;
  listRecords(query?: TripQuery): Promise<TripRecord[]>;
  countBy(kind: 'week' | 'month'): Promise<Record<string, number>>;
  sweepAbandoned(olderThanMs: number): Promise<TripRecord[]>;

  appendChunk(chunk: TripSampleChunk): Promise<void>;
  readChunks(id: TripId): Promise<TripSampleChunk[]>;
  readSamples(id: TripId, range?: { from: Offset; to: Offset }): Promise<TripSample[]>;

  appendEvents(events: TripEvent[]): Promise<void>;
  readEvents(id: TripId, type?: TripEventType): Promise<TripEvent[]>;

  /* ----------------------------- sync-only ------------------------------ *
   * Writes that deliberately do NOT enqueue an outbox op.
   *
   * Everything a pull applies came *from* the server, so routing it through
   * the normal write path would immediately queue it to be pushed straight
   * back — an endless sync loop. These also bypass the revision bump, since a
   * merged record must keep the revision it was given.
   * ---------------------------------------------------------------------- */

  /** Includes tombstones, which `get` hides — merge has to see deletes. */
  getRaw(id: TripId): Promise<TripRecord | null>;
  putRaw(trip: TripRecord): Promise<void>;
  appendChunkRaw(chunk: TripSampleChunk): Promise<void>;
  appendEventsRaw(events: TripEvent[]): Promise<void>;
}

export interface AggregateRepository {
  get(key: string): Promise<PeriodAggregate | null>;
  upsert(aggregate: PeriodAggregate): Promise<void>;
  listByKind(kind: PeriodAggregate['kind'], limit?: number): Promise<PeriodAggregate[]>;
  lifetime(): Promise<LifetimeStats>;
  records(): Promise<PersonalRecords>;
}

export interface AchievementRepository {
  all(): Promise<AchievementRecord[]>;
  unlock(record: AchievementRecord): Promise<void>;
  has(id: string): Promise<boolean>;
}

export interface SettingsRepository {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  all(): Promise<Record<string, unknown>>;
}

export interface OutboxRepository {
  enqueue(op: Omit<OutboxOp, 'id' | 'attempts' | 'nextAttemptAt'>): Promise<void>;
  claim(limit: number, now: Millis): Promise<OutboxOp[]>;
  ack(id: number): Promise<void>;
  fail(id: number, error: string): Promise<void>;
  size(): Promise<number>;
}

export interface Road360Repository {
  trips: TripRepository;
  aggregates: AggregateRepository;
  achievements: AchievementRepository;
  settings: SettingsRepository;
  outbox: OutboxRepository;
  /** Clears all local data. Used by the "reset" action in settings. */
  clearAll(): Promise<void>;
  /**
   * Mark a trip as synced without bumping its revision or enqueuing an op.
   * Called by the sync engine after the server acknowledges a push.
   */
  markTripSynced(id: TripId, at: Millis): Promise<void>;
}
