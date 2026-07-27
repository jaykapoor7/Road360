import type { Millis } from './schema';

/**
 * Cloud sync does not exist yet. These shapes do, and the outbox is populated
 * from the first trip onward — so switching sync on is draining a queue, not
 * backfilling a year of local data.
 */

export type OutboxOpKind = 'upsert' | 'delete';
export type SyncEntity = 'trip' | 'chunk' | 'event' | 'aggregate' | 'contribution';

export interface OutboxOp {
  id?: number; // autoIncrement, assigned by the store
  op: OutboxOpKind;
  entity: SyncEntity;
  /** e.g. `${tripId}` or `${tripId}:${chunk}`. */
  entityKey: string;
  createdAt: Millis;
  attempts: number;
  nextAttemptAt: Millis;
  lastError: string | null;
}

/**
 * Anonymous community contribution — the unit behind future noise heatmaps,
 * hard-brake heatmaps, per-road scores and city rankings.
 *
 * Deliberately carries no deviceId, no trip id and no absolute timestamps. A
 * cell is a ~150 m square and an hour-of-week bucket, and cells with too few
 * samples are dropped before upload.
 */
export interface RoadSegmentContribution {
  geohash: string; // precision 7, ~150 m
  hourOfWeek: number; // 0..167
  sampleCount: number;
  avgDb: number;
  p90Db: number;
  hornCount: number;
  hardBrakeCount: number;
  avgSpeed: number;
  stoppedRatio: number;
  /** 0..100, inverted sub-score for this cell. */
  chaosIndex: number;
  schemaVersion: number;
  clientVersion: string;
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented — Road360 has no backend yet.`);
    this.name = 'NotImplementedError';
  }
}
