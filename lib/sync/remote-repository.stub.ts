import { NotImplementedError } from '@/lib/domain/sync';
import type {
  AchievementRepository,
  AggregateRepository,
  NewTrip,
  OutboxRepository,
  Road360Repository,
  SettingsRepository,
  TripQuery,
  TripRepository,
} from '@/lib/storage/repository';
import type { TripListItem, TripRecord } from '@/lib/domain/trip';
import type { TripSample, TripSampleChunk } from '@/lib/domain/samples';
import type { TripEvent, TripEventType } from '@/lib/domain/events';
import type { PeriodAggregate, PersonalRecords, LifetimeStats } from '@/lib/domain/aggregates';
import type { AchievementRecord } from '@/lib/domain/achievements';
import type { OutboxOp } from '@/lib/domain/sync';
import type { Millis, Offset, TripId } from '@/lib/domain/schema';

/**
 * The future cloud adapter, defined but not implemented.
 *
 * This file exists to keep `Road360Repository` honest. Because a second
 * implementation has to satisfy the same interface, nothing IndexedDB-specific
 * can leak into a signature without breaking here first — which is precisely
 * the mistake that makes local-first apps painful to sync later.
 *
 * Implementing this is the whole of "add cloud sync": the outbox is already
 * populated, records already carry revision/dirty/tombstone metadata, and
 * conflict resolution is already specified as LWW on
 * (updatedAt, revision, deviceId).
 */

const fail = (method: string): never => {
  throw new NotImplementedError(`RemoteRepository.${method}`);
};

class RemoteTripRepository implements TripRepository {
  create(_input: NewTrip): Promise<TripRecord> {
    return fail('trips.create');
  }
  get(_id: TripId): Promise<TripRecord | null> {
    return fail('trips.get');
  }
  update(_id: TripId, _patch: Partial<TripRecord>): Promise<TripRecord> {
    return fail('trips.update');
  }
  softDelete(_id: TripId): Promise<void> {
    return fail('trips.softDelete');
  }
  list(_query?: TripQuery): Promise<TripListItem[]> {
    return fail('trips.list');
  }
  listRecords(_query?: TripQuery): Promise<TripRecord[]> {
    return fail('trips.listRecords');
  }
  countBy(_kind: 'week' | 'month'): Promise<Record<string, number>> {
    return fail('trips.countBy');
  }
  appendChunk(_chunk: TripSampleChunk): Promise<void> {
    return fail('trips.appendChunk');
  }
  readChunks(_id: TripId): Promise<TripSampleChunk[]> {
    return fail('trips.readChunks');
  }
  readSamples(_id: TripId, _range?: { from: Offset; to: Offset }): Promise<TripSample[]> {
    return fail('trips.readSamples');
  }
  appendEvents(_events: TripEvent[]): Promise<void> {
    return fail('trips.appendEvents');
  }
  readEvents(_id: TripId, _type?: TripEventType): Promise<TripEvent[]> {
    return fail('trips.readEvents');
  }
}

class RemoteAggregateRepository implements AggregateRepository {
  get(_key: string): Promise<PeriodAggregate | null> {
    return fail('aggregates.get');
  }
  upsert(_aggregate: PeriodAggregate): Promise<void> {
    return fail('aggregates.upsert');
  }
  listByKind(_kind: PeriodAggregate['kind'], _limit?: number): Promise<PeriodAggregate[]> {
    return fail('aggregates.listByKind');
  }
  lifetime(): Promise<LifetimeStats> {
    return fail('aggregates.lifetime');
  }
  records(): Promise<PersonalRecords> {
    return fail('aggregates.records');
  }
}

class RemoteAchievementRepository implements AchievementRepository {
  all(): Promise<AchievementRecord[]> {
    return fail('achievements.all');
  }
  unlock(_record: AchievementRecord): Promise<void> {
    return fail('achievements.unlock');
  }
  has(_id: string): Promise<boolean> {
    return fail('achievements.has');
  }
}

class RemoteSettingsRepository implements SettingsRepository {
  get<T>(_key: string, _fallback: T): Promise<T> {
    return fail('settings.get');
  }
  set<T>(_key: string, _value: T): Promise<void> {
    return fail('settings.set');
  }
  all(): Promise<Record<string, unknown>> {
    return fail('settings.all');
  }
}

class RemoteOutboxRepository implements OutboxRepository {
  enqueue(_op: Omit<OutboxOp, 'id' | 'attempts' | 'nextAttemptAt'>): Promise<void> {
    return fail('outbox.enqueue');
  }
  claim(_limit: number, _now: Millis): Promise<OutboxOp[]> {
    return fail('outbox.claim');
  }
  ack(_id: number): Promise<void> {
    return fail('outbox.ack');
  }
  fail(_id: number, _error: string): Promise<void> {
    return fail('outbox.fail');
  }
  size(): Promise<number> {
    return fail('outbox.size');
  }
}

export class RemoteRepository implements Road360Repository {
  readonly trips = new RemoteTripRepository();
  readonly aggregates = new RemoteAggregateRepository();
  readonly achievements = new RemoteAchievementRepository();
  readonly settings = new RemoteSettingsRepository();
  readonly outbox = new RemoteOutboxRepository();

  clearAll(): Promise<void> {
    return fail('clearAll');
  }
}
