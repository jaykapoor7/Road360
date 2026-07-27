import type { Millis, SyncMeta, TripId } from './schema';
import type { ScoreBand } from './score';

export type PeriodKind = 'week' | 'month' | 'lifetime';

/**
 * Rollups are computed on trip completion for only the affected keys, so the
 * stats and history screens never scan the whole trip table.
 */
export interface PeriodAggregate extends SyncMeta {
  /** 'week:2026-W30' | 'month:2026-07' | 'lifetime' */
  key: string;
  kind: PeriodKind;
  periodStart: Millis;
  periodEnd: Millis;

  tripCount: number;
  totalDurationMs: number;
  totalDistanceM: number;
  totalHorns: number;
  totalHardBrakes: number;
  totalRapidAccels: number;

  avgScore: number;
  bestScore: number;
  worstScore: number;
  bandCounts: Record<ScoreBand, number>;

  avgDb: number;
  peakDb: number;

  longestPeacefulTripId: TripId | null;
  longestPeacefulSilenceMs: number;

  /** Per-day points for a week, per-week points for a month. Drives the trend chart. */
  noiseSeries: { key: string; avgDb: number; score: number }[];
  computedAt: Millis;
}

export interface PersonalRecords {
  bestScore: { tripId: TripId; value: number } | null;
  worstScore: { tripId: TripId; value: number } | null;
  quietestTrip: { tripId: TripId; avgDb: number } | null;
  loudestTrip: { tripId: TripId; peakDb: number } | null;
  mostHorns: { tripId: TripId; count: number } | null;
  longestSilence: { tripId: TripId; ms: number } | null;
  longestDistance: { tripId: TripId; m: number } | null;
}

export const EMPTY_RECORDS: PersonalRecords = {
  bestScore: null,
  worstScore: null,
  quietestTrip: null,
  loudestTrip: null,
  mostHorns: null,
  longestSilence: null,
  longestDistance: null,
};

/** Lifetime totals shown on the home screen and the stats dashboard. */
export interface LifetimeStats {
  tripCount: number;
  totalDistanceM: number;
  totalDurationMs: number;
  totalHorns: number;
  totalHardBrakes: number;
  avgScore: number;
  avgDb: number;
  longestPeacefulSilenceMs: number;
  longestPeacefulTripId: TripId | null;
  bandCounts: Record<ScoreBand, number>;
  /** Consecutive completed trips scoring "excellent", ending at the most recent trip. */
  currentExcellentStreak: number;
}

export const EMPTY_LIFETIME: LifetimeStats = {
  tripCount: 0,
  totalDistanceM: 0,
  totalDurationMs: 0,
  totalHorns: 0,
  totalHardBrakes: 0,
  avgScore: 0,
  avgDb: 0,
  longestPeacefulSilenceMs: 0,
  longestPeacefulTripId: null,
  bandCounts: { excellent: 0, normal: 0, stressful: 0, chaos: 0 },
  currentExcellentStreak: 0,
};
