import type { DBSchema } from 'idb';
import type { TripRecord } from '@/lib/domain/trip';
import type { TripSampleChunk } from '@/lib/domain/samples';
import type { TripEvent } from '@/lib/domain/events';
import type { PeriodAggregate } from '@/lib/domain/aggregates';
import type { AchievementRecord } from '@/lib/domain/achievements';
import type { OutboxOp } from '@/lib/domain/sync';

export const DB_NAME = 'road360';
export const DB_VERSION = 1;

/**
 * Trip headers, sample chunks and events live in three separate stores.
 *
 * This is the single most consequential storage decision in the app: the
 * history screen cursors `trips` alone and never pages in the megabytes of
 * telemetry it would not display. Putting samples on the trip record would make
 * opening history proportional to total lifetime driving.
 */
export interface Road360DB extends DBSchema {
  trips: {
    key: string;
    value: TripRecord;
    indexes: {
      'by-startedAt': number;
      'by-dayKey': string;
      'by-weekKey': string;
      'by-monthKey': string;
      'by-status': string;
      'by-dirty': number;
    };
  };
  tripChunks: {
    key: [string, number];
    value: TripSampleChunk;
    indexes: { 'by-tripId': string; 'by-dirty': number };
  };
  tripEvents: {
    key: [string, number];
    value: TripEvent;
    indexes: { 'by-tripId': string; 'by-type': [string, string]; 'by-dirty': number };
  };
  aggregates: {
    key: string;
    value: PeriodAggregate;
    indexes: { 'by-kind': string; 'by-dirty': number };
  };
  achievements: {
    key: string;
    value: AchievementRecord;
    indexes: { 'by-unlockedAt': number };
  };
  outbox: {
    key: number;
    value: OutboxOp;
    indexes: { 'by-nextAttemptAt': number; 'by-entity': string };
  };
  settings: { key: string; value: { key: string; value: unknown } };
  meta: { key: string; value: { key: string; value: unknown } };
}

export const STORES = {
  trips: 'trips',
  tripChunks: 'tripChunks',
  tripEvents: 'tripEvents',
  aggregates: 'aggregates',
  achievements: 'achievements',
  outbox: 'outbox',
  settings: 'settings',
  meta: 'meta',
} as const;
