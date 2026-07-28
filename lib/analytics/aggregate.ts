import type { PeriodAggregate, PeriodKind, LifetimeStats } from '@/lib/domain/aggregates';
import type { TripRecord } from '@/lib/domain/trip';
import type { ScoreBand } from '@/lib/domain/score';
import { newSyncMeta, type DeviceId } from '@/lib/domain/schema';
import { dayKey, endOfMonth, endOfYear, startOfMonth, startOfWeek, startOfYear } from '@/lib/utils/time';
import { energyAverageDb } from '@/lib/utils/math';

const emptyBands = (): Record<ScoreBand, number> => ({
  excellent: 0,
  normal: 0,
  stressful: 0,
  chaos: 0,
});

export const aggregateKey = (kind: PeriodKind, periodKey?: string): string =>
  kind === 'lifetime' ? 'lifetime' : `${kind}:${periodKey}`;

/**
 * Trips that count toward statistics: completed, not deleted, scored, real.
 *
 * Demo drives are excluded. They exist to show the app working end to end, not
 * to become part of someone's history — a synthesised commute has no business
 * skewing a real average, a real streak or a real Wrapped, and seeing one sit
 * in the list next to genuine drives is worse than seeing an empty app.
 */
export const isCountable = (trip: TripRecord): boolean =>
  trip.deleted === 0 && trip.status === 'completed' && !trip.simulated && trip.stats !== null;

export interface BuildAggregateInput {
  key: string;
  kind: PeriodKind;
  periodStart: number;
  periodEnd: number;
  trips: readonly TripRecord[];
  deviceId: DeviceId;
}

/**
 * Fold a set of trips into one rollup.
 *
 * Aggregates are recomputed for only the affected keys when a trip completes,
 * so the stats and history screens read a handful of rows instead of scanning
 * every trip the user has ever recorded.
 */
export function buildAggregate(input: BuildAggregateInput): PeriodAggregate {
  const trips = input.trips.filter(isCountable);
  const now = Date.now();

  const bandCounts = emptyBands();
  let totalDurationMs = 0;
  let totalDistanceM = 0;
  let totalHorns = 0;
  let totalHardBrakes = 0;
  let totalRapidAccels = 0;
  let scoreSum = 0;
  let bestScore = 0;
  let worstScore = 100;
  let peakDb = 0;
  let longestPeacefulSilenceMs = 0;
  let longestPeacefulTripId: TripRecord['id'] | null = null;

  const dbValues: number[] = [];
  const byDay = new Map<string, { dbs: number[]; scores: number[] }>();

  for (const trip of trips) {
    const stats = trip.stats!;
    const score = trip.score;

    totalDurationMs += stats.durationMs;
    totalDistanceM += stats.distanceM;
    totalHorns += stats.soundCounts.horn;
    totalHardBrakes += stats.hardBrakes;
    totalRapidAccels += stats.rapidAccels;

    if (score) {
      bandCounts[score.band] += 1;
      scoreSum += score.value;
      if (score.value > bestScore) bestScore = score.value;
      if (score.value < worstScore) worstScore = score.value;
    }

    if (stats.noise.avgDb > 0) dbValues.push(stats.noise.avgDb);
    if (stats.noise.peakDb > peakDb) peakDb = stats.noise.peakDb;

    if (stats.longestSilenceMs > longestPeacefulSilenceMs) {
      longestPeacefulSilenceMs = stats.longestSilenceMs;
      longestPeacefulTripId = trip.id;
    }

    const key = dayKey(trip.startedAt);
    const bucket = byDay.get(key) ?? { dbs: [], scores: [] };
    if (stats.noise.avgDb > 0) bucket.dbs.push(stats.noise.avgDb);
    if (score) bucket.scores.push(score.value);
    byDay.set(key, bucket);
  }

  const noiseSeries = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => ({
      key,
      avgDb: bucket.dbs.length > 0 ? energyAverageDb(bucket.dbs) : 0,
      score:
        bucket.scores.length > 0
          ? bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length
          : 0,
    }));

  return {
    ...newSyncMeta(input.deviceId, now),
    key: input.key,
    kind: input.kind,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    tripCount: trips.length,
    totalDurationMs,
    totalDistanceM,
    totalHorns,
    totalHardBrakes,
    totalRapidAccels,
    avgScore: trips.length > 0 ? scoreSum / trips.length : 0,
    bestScore: trips.length > 0 ? bestScore : 0,
    worstScore: trips.length > 0 ? worstScore : 0,
    bandCounts,
    avgDb: dbValues.length > 0 ? energyAverageDb(dbValues) : 0,
    peakDb,
    longestPeacefulTripId,
    longestPeacefulSilenceMs,
    noiseSeries,
    computedAt: now,
  };
}

/** Lifetime totals derived directly from trips, for a first run or a rebuild. */
export function buildLifetime(trips: readonly TripRecord[]): LifetimeStats {
  const countable = trips.filter(isCountable);
  const bandCounts = emptyBands();

  let totalDistanceM = 0;
  let totalDurationMs = 0;
  let totalHorns = 0;
  let totalHardBrakes = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let longestPeacefulSilenceMs = 0;
  let longestPeacefulTripId: TripRecord['id'] | null = null;
  const dbValues: number[] = [];

  for (const trip of countable) {
    const stats = trip.stats!;
    totalDistanceM += stats.distanceM;
    totalDurationMs += stats.durationMs;
    totalHorns += stats.soundCounts.horn;
    totalHardBrakes += stats.hardBrakes;
    if (stats.noise.avgDb > 0) dbValues.push(stats.noise.avgDb);

    if (trip.score) {
      bandCounts[trip.score.band] += 1;
      scoreSum += trip.score.value;
      scoreCount += 1;
    }

    if (stats.longestSilenceMs > longestPeacefulSilenceMs) {
      longestPeacefulSilenceMs = stats.longestSilenceMs;
      longestPeacefulTripId = trip.id;
    }
  }

  // Streak runs backwards from the most recent trip and stops at the first
  // non-excellent one.
  const byRecency = [...countable].sort((a, b) => b.startedAt - a.startedAt);
  let currentExcellentStreak = 0;
  for (const trip of byRecency) {
    if (trip.score?.band === 'excellent') currentExcellentStreak += 1;
    else break;
  }

  return {
    tripCount: countable.length,
    totalDistanceM,
    totalDurationMs,
    totalHorns,
    totalHardBrakes,
    avgScore: scoreCount > 0 ? scoreSum / scoreCount : 0,
    avgDb: dbValues.length > 0 ? energyAverageDb(dbValues) : 0,
    longestPeacefulSilenceMs,
    longestPeacefulTripId,
    bandCounts,
    currentExcellentStreak,
  };
}

export interface PeriodBounds {
  key: string;
  kind: PeriodKind;
  start: number;
  end: number;
}

/** Which aggregate keys a trip at this time affects. */
export function affectedPeriods(startedAt: number, weekKey: string, monthKey: string): PeriodBounds[] {
  return [
    {
      key: aggregateKey('week', weekKey),
      kind: 'week',
      start: startOfWeek(startedAt),
      end: startOfWeek(startedAt) + 7 * 24 * 60 * 60 * 1000 - 1,
    },
    {
      key: aggregateKey('month', monthKey),
      kind: 'month',
      start: startOfMonth(startedAt),
      end: endOfMonth(startedAt),
    },
    { key: 'lifetime', kind: 'lifetime', start: 0, end: Number.MAX_SAFE_INTEGER },
  ];
}

export const yearBounds = (ts: number) => ({ start: startOfYear(ts), end: endOfYear(ts) });
