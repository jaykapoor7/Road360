import type { IDBPDatabase } from 'idb';
import { getDb } from './db';
import type { Road360DB } from './schema';
import type {
  AchievementRepository,
  AggregateRepository,
  NewTrip,
  OutboxRepository,
  Road360Repository,
  SettingsRepository,
  TripQuery,
  TripRepository,
} from './repository';
import {
  newSyncMeta,
  touchSyncMeta,
  type DeviceId,
  type Millis,
  type Offset,
  type TripId,
} from '@/lib/domain/schema';
import type { TripListItem, TripRecord } from '@/lib/domain/trip';
import { toListItem } from '@/lib/domain/trip';
import type { TripSample, TripSampleChunk } from '@/lib/domain/samples';
import type { TripEvent, TripEventType } from '@/lib/domain/events';
import type { PeriodAggregate, PersonalRecords, LifetimeStats } from '@/lib/domain/aggregates';
import { EMPTY_LIFETIME, EMPTY_RECORDS } from '@/lib/domain/aggregates';
import type { AchievementRecord } from '@/lib/domain/achievements';
import type { OutboxOp, SyncEntity } from '@/lib/domain/sync';
import { newDeviceId } from '@/lib/utils/id';
import { dayKey, monthKey, weekKey } from '@/lib/utils/time';
import { APP_VERSION } from '@/lib/config/constants';
import { SCORE_VERSION } from '@/lib/score/labels';

const DEVICE_ID_KEY = 'deviceId';

/** Stable per install. Also the tiebreak field in last-write-wins conflict resolution. */
export async function getDeviceId(): Promise<DeviceId> {
  const db = await getDb();
  const existing = await db.get('meta', DEVICE_ID_KEY);
  if (existing && typeof existing.value === 'string') return existing.value as DeviceId;

  const id = newDeviceId();
  await db.put('meta', { key: DEVICE_ID_KEY, value: id });
  return id;
}

/**
 * Exponential backoff for failed sync pushes: 5 s, 10 s, 20 s … capped at an
 * hour, so a persistently failing op does not spin.
 */
function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 5000, 60 * 60 * 1000);
}

class LocalOutboxRepository implements OutboxRepository {
  async enqueue(op: Omit<OutboxOp, 'id' | 'attempts' | 'nextAttemptAt'>): Promise<void> {
    const db = await getDb();
    await db.add('outbox', { ...op, attempts: 0, nextAttemptAt: op.createdAt });
  }

  async claim(limit: number, now: Millis): Promise<OutboxOp[]> {
    const db = await getDb();
    const due = await db.getAllFromIndex('outbox', 'by-nextAttemptAt', IDBKeyRange.upperBound(now));
    return due.slice(0, limit);
  }

  async ack(id: number): Promise<void> {
    const db = await getDb();
    await db.delete('outbox', id);
  }

  async fail(id: number, error: string): Promise<void> {
    const db = await getDb();
    const op = await db.get('outbox', id);
    if (!op) return;
    const attempts = op.attempts + 1;
    await db.put('outbox', {
      ...op,
      attempts,
      lastError: error,
      nextAttemptAt: Date.now() + backoffMs(attempts),
    });
  }

  async size(): Promise<number> {
    const db = await getDb();
    return db.count('outbox');
  }
}

/**
 * Enqueue an outbox op on the same connection as the mutation that caused it.
 *
 * The outbox fills from the very first trip even though nothing drains it yet.
 * That is the point: when sync ships, a year of existing local data uploads by
 * draining a queue rather than by running a backfill migration.
 */
async function enqueueOp(
  db: IDBPDatabase<Road360DB>,
  entity: SyncEntity,
  entityKey: string,
  op: OutboxOp['op'] = 'upsert',
): Promise<void> {
  const now = Date.now();
  await db.add('outbox', {
    op,
    entity,
    entityKey,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
  });
}

class LocalTripRepository implements TripRepository {
  async create(input: NewTrip): Promise<TripRecord> {
    const db = await getDb();
    const deviceId = await getDeviceId();
    const now = Date.now();

    const trip: TripRecord = {
      ...newSyncMeta(deviceId, now),
      id: input.id,
      status: 'recording',
      startedAt: input.startedAt,
      endedAt: null,
      tzOffsetMin: -new Date(input.startedAt).getTimezoneOffset(),
      dayKey: dayKey(input.startedAt),
      weekKey: weekKey(input.startedAt),
      monthKey: monthKey(input.startedAt),
      title: null,
      sampleCount: 0,
      chunkCount: 0,
      eventCount: 0,
      stats: null,
      score: null,
      summary: null,
      achievementsUnlocked: [],
      route: { simplified: [], bounds: null, startGeohash: null, endGeohash: null },
      sensorsUsed: input.sensorsUsed,
      simulated: input.simulated,
      app: {
        version: APP_VERSION,
        detectorId: input.detectorId,
        scoreVersion: SCORE_VERSION,
      },
    };

    await db.put('trips', trip);
    await enqueueOp(db, 'trip', trip.id);
    return trip;
  }

  async get(id: TripId): Promise<TripRecord | null> {
    const db = await getDb();
    const trip = await db.get('trips', id);
    if (!trip || trip.deleted === 1) return null;
    return trip;
  }

  async update(id: TripId, patch: Partial<TripRecord>): Promise<TripRecord> {
    const db = await getDb();
    const existing = await db.get('trips', id);
    if (!existing) throw new Error(`Trip ${id} not found`);

    const next = touchSyncMeta({ ...existing, ...patch, id }, Date.now());
    await db.put('trips', next);
    await enqueueOp(db, 'trip', id);
    return next;
  }

  async softDelete(id: TripId): Promise<void> {
    const db = await getDb();
    const existing = await db.get('trips', id);
    if (!existing) return;

    // Tombstone rather than hard delete: a hard-deleted row that was already
    // synced simply reappears on the next pull.
    await db.put('trips', touchSyncMeta({ ...existing, deleted: 1 }, Date.now()));
    await enqueueOp(db, 'trip', id, 'delete');

    // Bulk data carries no meaning without its header, so it goes immediately.
    const tx = db.transaction(['tripChunks', 'tripEvents'], 'readwrite');
    const chunkKeys = await tx.objectStore('tripChunks').index('by-tripId').getAllKeys(id);
    const eventKeys = await tx.objectStore('tripEvents').index('by-tripId').getAllKeys(id);
    await Promise.all([
      ...chunkKeys.map((k) => tx.objectStore('tripChunks').delete(k)),
      ...eventKeys.map((k) => tx.objectStore('tripEvents').delete(k)),
      tx.done,
    ]);
  }

  async listRecords(query: TripQuery = {}): Promise<TripRecord[]> {
    const db = await getDb();
    const { limit = 100, before, status, includeSimulated = true } = query;

    const range = before ? IDBKeyRange.upperBound(before, true) : undefined;
    const all = await db.getAllFromIndex('trips', 'by-startedAt', range);

    const filtered = all
      .filter((t) => t.deleted === 0)
      .filter((t) => (status ? t.status === status : true))
      .filter((t) => (includeSimulated ? true : !t.simulated))
      .sort((a, b) => b.startedAt - a.startedAt);

    return filtered.slice(0, limit);
  }

  async list(query: TripQuery = {}): Promise<TripListItem[]> {
    const records = await this.listRecords(query);
    return records.map(toListItem);
  }

  /**
   * Marks trips left in `recording` by a session that never finished — a closed
   * tab, a killed browser, a flat battery — as `abandoned`.
   *
   * Without this they stay `recording` forever and surface in history as a row
   * with no score, no distance and no report behind it. `olderThanMs` guards
   * against sweeping a drive that is genuinely still in progress: the recorder
   * checkpoints every 30 s, so anything untouched for minutes is not running.
   *
   * Updates go through `put` directly rather than `update()` — an abandoned
   * trip is a local cleanup, not a change worth pushing to another device.
   */
  async sweepAbandoned(olderThanMs: number): Promise<TripRecord[]> {
    const db = await getDb();
    const cutoff = Date.now() - olderThanMs;
    const swept: TripRecord[] = [];

    const tx = db.transaction('trips', 'readwrite');
    for (const trip of await tx.store.getAll()) {
      const active = trip.status === 'recording' || trip.status === 'paused';
      if (!active || trip.deleted === 1) continue;
      // updatedAt moves on every checkpoint, so it is the liveness signal.
      if (Math.max(trip.updatedAt, trip.startedAt) > cutoff) continue;

      const abandoned: TripRecord = { ...trip, status: 'abandoned', updatedAt: Date.now() };
      await tx.store.put(abandoned);
      swept.push(abandoned);
    }
    await tx.done;
    return swept;
  }

  async countBy(kind: 'week' | 'month'): Promise<Record<string, number>> {
    const db = await getDb();
    const all = await db.getAll('trips');
    const out: Record<string, number> = {};
    for (const trip of all) {
      if (trip.deleted === 1 || trip.status !== 'completed') continue;
      const key = kind === 'week' ? trip.weekKey : trip.monthKey;
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }

  async appendChunk(chunk: TripSampleChunk): Promise<void> {
    const db = await getDb();
    await db.put('tripChunks', chunk);
    await enqueueOp(db, 'chunk', `${chunk.tripId}:${chunk.chunk}`);
  }

  async readChunks(id: TripId): Promise<TripSampleChunk[]> {
    const db = await getDb();
    const chunks = await db.getAllFromIndex('tripChunks', 'by-tripId', id);
    return chunks.sort((a, b) => a.chunk - b.chunk);
  }

  async readSamples(id: TripId, range?: { from: Offset; to: Offset }): Promise<TripSample[]> {
    const chunks = await this.readChunks(id);
    const samples: TripSample[] = [];
    for (const chunk of chunks) {
      if (range && (chunk.to < range.from || chunk.from > range.to)) continue;
      for (const sample of chunk.samples) {
        if (range && (sample.t < range.from || sample.t > range.to)) continue;
        samples.push(sample);
      }
    }
    return samples;
  }

  async appendEvents(events: TripEvent[]): Promise<void> {
    if (events.length === 0) return;
    const db = await getDb();
    const tx = db.transaction('tripEvents', 'readwrite');
    await Promise.all([...events.map((e) => tx.store.put(e)), tx.done]);
    for (const event of events) {
      await enqueueOp(db, 'event', `${event.tripId}:${event.seq}`);
    }
  }

  async readEvents(id: TripId, type?: TripEventType): Promise<TripEvent[]> {
    const db = await getDb();
    const events = type
      ? await db.getAllFromIndex('tripEvents', 'by-type', IDBKeyRange.only([id, type]))
      : await db.getAllFromIndex('tripEvents', 'by-tripId', id);
    return events.sort((a, b) => a.t - b.t || a.seq - b.seq);
  }

  /* ------------------------------ sync-only ----------------------------- */

  /** Unlike `get`, this returns tombstones — merge has to see deletes. */
  async getRaw(id: TripId): Promise<TripRecord | null> {
    const db = await getDb();
    return (await db.get('trips', id)) ?? null;
  }

  async putRaw(trip: TripRecord): Promise<void> {
    const db = await getDb();
    // No outbox op: this record came from the server, and queueing it would
    // push it straight back.
    await db.put('trips', trip);
  }

  async appendChunkRaw(chunk: TripSampleChunk): Promise<void> {
    const db = await getDb();
    await db.put('tripChunks', chunk);
  }

  async appendEventsRaw(events: TripEvent[]): Promise<void> {
    if (events.length === 0) return;
    const db = await getDb();
    const tx = db.transaction('tripEvents', 'readwrite');
    await Promise.all([...events.map((e) => tx.store.put(e)), tx.done]);
  }
}

class LocalAggregateRepository implements AggregateRepository {
  async get(key: string): Promise<PeriodAggregate | null> {
    const db = await getDb();
    return (await db.get('aggregates', key)) ?? null;
  }

  async upsert(aggregate: PeriodAggregate): Promise<void> {
    const db = await getDb();
    await db.put('aggregates', aggregate);
    await enqueueOp(db, 'aggregate', aggregate.key);
  }

  async listByKind(kind: PeriodAggregate['kind'], limit = 52): Promise<PeriodAggregate[]> {
    const db = await getDb();
    const all = await db.getAllFromIndex('aggregates', 'by-kind', kind);
    return all.sort((a, b) => b.periodStart - a.periodStart).slice(0, limit);
  }

  async lifetime(): Promise<LifetimeStats> {
    const stored = await this.get('lifetime');
    if (!stored) return EMPTY_LIFETIME;

    return {
      tripCount: stored.tripCount,
      totalDistanceM: stored.totalDistanceM,
      totalDurationMs: stored.totalDurationMs,
      totalHorns: stored.totalHorns,
      totalHardBrakes: stored.totalHardBrakes,
      avgScore: stored.avgScore,
      avgDb: stored.avgDb,
      longestPeacefulSilenceMs: stored.longestPeacefulSilenceMs,
      longestPeacefulTripId: stored.longestPeacefulTripId,
      bandCounts: stored.bandCounts,
      currentExcellentStreak: await this.excellentStreak(),
    };
  }

  private async excellentStreak(): Promise<number> {
    const db = await getDb();
    const trips = (await db.getAllFromIndex('trips', 'by-startedAt'))
      .filter((t) => t.deleted === 0 && t.status === 'completed')
      .sort((a, b) => b.startedAt - a.startedAt);

    let streak = 0;
    for (const trip of trips) {
      if (trip.score?.band === 'excellent') streak += 1;
      else break;
    }
    return streak;
  }

  async records(): Promise<PersonalRecords> {
    const db = await getDb();
    const trips = (await db.getAll('trips')).filter(
      (t) => t.deleted === 0 && t.status === 'completed' && t.stats && t.score,
    );
    if (trips.length === 0) return EMPTY_RECORDS;

    const best = <T>(pick: (t: TripRecord) => T | null, better: (a: T, b: T) => boolean) => {
      let winner: { trip: TripRecord; value: T } | null = null;
      for (const trip of trips) {
        const value = pick(trip);
        if (value === null) continue;
        if (!winner || better(value, winner.value)) winner = { trip, value };
      }
      return winner;
    };

    const bestScore = best(
      (t) => t.score?.value ?? null,
      (a, b) => a > b,
    );
    const worstScore = best(
      (t) => t.score?.value ?? null,
      (a, b) => a < b,
    );
    const quietest = best(
      (t) => t.stats?.noise.avgDb ?? null,
      (a, b) => a < b,
    );
    const loudest = best(
      (t) => t.stats?.noise.peakDb ?? null,
      (a, b) => a > b,
    );
    const mostHorns = best(
      (t) => t.stats?.soundCounts.horn ?? null,
      (a, b) => a > b,
    );
    const longestSilence = best(
      (t) => t.stats?.longestSilenceMs ?? null,
      (a, b) => a > b,
    );
    const longestDistance = best(
      (t) => t.stats?.distanceM ?? null,
      (a, b) => a > b,
    );

    return {
      bestScore: bestScore ? { tripId: bestScore.trip.id, value: bestScore.value } : null,
      worstScore: worstScore ? { tripId: worstScore.trip.id, value: worstScore.value } : null,
      quietestTrip: quietest ? { tripId: quietest.trip.id, avgDb: quietest.value } : null,
      loudestTrip: loudest ? { tripId: loudest.trip.id, peakDb: loudest.value } : null,
      mostHorns: mostHorns ? { tripId: mostHorns.trip.id, count: mostHorns.value } : null,
      longestSilence: longestSilence
        ? { tripId: longestSilence.trip.id, ms: longestSilence.value }
        : null,
      longestDistance: longestDistance
        ? { tripId: longestDistance.trip.id, m: longestDistance.value }
        : null,
    };
  }
}

class LocalAchievementRepository implements AchievementRepository {
  async all(): Promise<AchievementRecord[]> {
    const db = await getDb();
    return db.getAll('achievements');
  }

  async unlock(record: AchievementRecord): Promise<void> {
    const db = await getDb();
    // First unlock wins — re-unlocking would reset the earned date.
    const existing = await db.get('achievements', record.id);
    if (existing) return;
    await db.put('achievements', record);
  }

  async has(id: string): Promise<boolean> {
    const db = await getDb();
    return (await db.get('achievements', id)) !== undefined;
  }
}

class LocalSettingsRepository implements SettingsRepository {
  async get<T>(key: string, fallback: T): Promise<T> {
    const db = await getDb();
    const row = await db.get('settings', key);
    return row === undefined ? fallback : (row.value as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await getDb();
    await db.put('settings', { key, value });
  }

  async all(): Promise<Record<string, unknown>> {
    const db = await getDb();
    const rows = await db.getAll('settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}

export class LocalRepository implements Road360Repository {
  readonly trips = new LocalTripRepository();
  readonly aggregates = new LocalAggregateRepository();
  readonly achievements = new LocalAchievementRepository();
  readonly settings = new LocalSettingsRepository();
  readonly outbox = new LocalOutboxRepository();

  async clearAll(): Promise<void> {
    const db = await getDb();
    const stores = [
      'trips',
      'tripChunks',
      'tripEvents',
      'aggregates',
      'achievements',
      'outbox',
      'settings',
    ] as const;
    const tx = db.transaction(stores, 'readwrite');
    await Promise.all([...stores.map((s) => tx.objectStore(s).clear()), tx.done]);
    // `meta` is deliberately preserved so the device keeps its identity.
  }

  async markTripSynced(id: TripId, at: number): Promise<void> {
    const db = await getDb();
    const trip = await db.get('trips', id);
    if (!trip) return;
    // Revision is untouched on purpose: bumping it would re-dirty the record
    // and queue another push, forever.
    await db.put('trips', { ...trip, dirty: 0, syncedAt: at });
  }
}

let instance: Road360Repository | null = null;

export function getRepository(): Road360Repository {
  if (!instance) instance = new LocalRepository();
  return instance;
}

/** Test seam. */
export function setRepository(repo: Road360Repository | null): void {
  instance = repo;
}
