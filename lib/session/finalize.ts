import type { Road360Repository } from '@/lib/storage/repository';
import type { TripRecord, RouteSummary } from '@/lib/domain/trip';
import type { TripSample } from '@/lib/domain/samples';
import type { TripEvent } from '@/lib/domain/events';
import type { SensorKind } from '@/lib/domain/sensors';
import type { TripId } from '@/lib/domain/schema';
import type { AchievementDef } from '@/lib/domain/achievements';
import { computeTripStats, groupHornBlasts } from '@/lib/analytics/trip-analytics';
import { computeScore } from '@/lib/score/engine';
import { buildSummary, type HistoryContext } from '@/lib/insights/engine';
import { evaluateAchievements } from '@/lib/insights/achievements';
import { buildAggregate, buildLifetime, affectedPeriods, isCountable } from '@/lib/analytics/aggregate';
import { simplifyPath, fromTuples, toTuples } from '@/lib/geo/simplify';
import { boundsOf } from '@/lib/geo/bounds';
import { encodeGeohash } from '@/lib/sync/geohash';
import { STORAGE, PRIVACY } from '@/lib/config/constants';

export interface RawTripResult {
  samples: TripSample[];
  events: TripEvent[];
  coverage: Record<SensorKind, number>;
  sensorsUsed: SensorKind[];
  durationMs: number;
  calibrationOffset?: number;
  calibrated?: boolean;
}

export interface FinalizeResult {
  trip: TripRecord;
  unlocked: AchievementDef[];
}

function routeSummary(samples: readonly TripSample[]): RouteSummary {
  const located = samples
    .filter((s) => s.lat !== null && s.lon !== null)
    .map((s) => ({ lat: s.lat!, lon: s.lon! }));

  if (located.length === 0) {
    return { simplified: [], bounds: null, startGeohash: null, endGeohash: null };
  }

  const simplified = simplifyPath(located, STORAGE.routeSimplifyEpsilonM);
  const first = located[0]!;
  const last = located[located.length - 1]!;

  return {
    simplified: toTuples(simplified),
    bounds: boundsOf(located),
    // Coarse (~5 km) so it groups trips by area without pinpointing an address.
    startGeohash: encodeGeohash(first.lat, first.lon, PRIVACY.tripAreaGeohashPrecision),
    endGeohash: encodeGeohash(last.lat, last.lon, PRIVACY.tripAreaGeohashPrecision),
  };
}

async function historyContext(repo: Road360Repository): Promise<HistoryContext | null> {
  const lifetime = await repo.aggregates.lifetime();
  if (lifetime.tripCount === 0) return null;

  const records = await repo.aggregates.records();
  return {
    avgScore: lifetime.avgScore,
    avgDb: lifetime.avgDb,
    tripCount: lifetime.tripCount,
    bestScore: records.bestScore?.value ?? 0,
    longestSilenceMs: lifetime.longestPeacefulSilenceMs,
  };
}

/**
 * Turn a finished recording into a completed, scored, persisted trip.
 *
 * This is the whole end-of-trip pipeline, kept in lib/ as pure orchestration so
 * it stays testable and portable: group blasts → stats → score → summary →
 * simplified route → persist → recompute the affected aggregates → evaluate
 * achievements. The React hook that calls this does nothing but await it.
 */
export async function finalizeTrip(
  repo: Road360Repository,
  tripId: TripId,
  raw: RawTripResult,
): Promise<FinalizeResult> {
  const events = groupHornBlasts(raw.events);

  const stats = computeTripStats({
    samples: raw.samples,
    events,
    durationMs: raw.durationMs,
    coverage: raw.coverage,
    sensorsUsed: raw.sensorsUsed,
    calibrationOffset: raw.calibrationOffset,
    calibrated: raw.calibrated,
  });

  const score = computeScore(stats);

  // History context must be read before this trip is folded into the aggregates,
  // so "personal best" compares against the past, not against itself.
  const history = await historyContext(repo);
  const summary = buildSummary({ trip: { id: tripId, startedAt: 0 }, stats, score, history });

  const existing = await repo.trips.get(tripId);
  const trip = await repo.trips.update(tripId, {
    status: 'completed',
    endedAt: Date.now(),
    stats,
    score,
    summary,
    route: routeSummary(raw.samples),
    sensorsUsed: raw.sensorsUsed,
    sampleCount: raw.samples.length,
    eventCount: events.length,
  });

  // Rebuild the affected week/month/lifetime aggregates from the full trip set.
  // Only these keys change, so this stays cheap even with a long history.
  await rebuildAggregates(repo, trip);

  // Achievements are judged against the lifetime totals that now include this trip.
  const lifetime = await repo.aggregates.lifetime();
  const alreadyUnlocked = new Set((await repo.achievements.all()).map((a) => a.id));
  const newlyUnlocked = evaluateAchievements({ trip, lifetime }, alreadyUnlocked);

  for (const { def, progress } of newlyUnlocked) {
    await repo.achievements.unlock({
      id: def.id,
      unlockedAt: Date.now(),
      tripId,
      valueAtUnlock: progress,
    });
  }

  if (newlyUnlocked.length > 0) {
    await repo.trips.update(tripId, {
      achievementsUnlocked: [...(existing?.achievementsUnlocked ?? []), ...newlyUnlocked.map((u) => u.def.id)],
    });
  }

  return { trip, unlocked: newlyUnlocked.map((u) => u.def) };
}

async function rebuildAggregates(repo: Road360Repository, trip: TripRecord): Promise<void> {
  const allTrips = await repo.trips.listRecords({ limit: 100_000, includeSimulated: true });
  const countable = allTrips.filter(isCountable);

  for (const period of affectedPeriods(trip.startedAt, trip.weekKey, trip.monthKey)) {
    if (period.kind === 'lifetime') {
      const lifetime = buildLifetime(countable);
      const aggregate = buildAggregate({
        key: 'lifetime',
        kind: 'lifetime',
        periodStart: 0,
        periodEnd: Number.MAX_SAFE_INTEGER,
        trips: countable,
        deviceId: trip.deviceId,
      });
      // Fold the lifetime-only fields (streak) that buildAggregate doesn't carry.
      await repo.aggregates.upsert({
        ...aggregate,
        longestPeacefulSilenceMs: lifetime.longestPeacefulSilenceMs,
        longestPeacefulTripId: lifetime.longestPeacefulTripId,
      });
      continue;
    }

    const inPeriod = countable.filter(
      (t) => t.startedAt >= period.start && t.startedAt <= period.end,
    );
    await repo.aggregates.upsert(
      buildAggregate({
        key: period.key,
        kind: period.kind,
        periodStart: period.start,
        periodEnd: period.end,
        trips: inPeriod,
        deviceId: trip.deviceId,
      }),
    );
  }
}

export { fromTuples };
