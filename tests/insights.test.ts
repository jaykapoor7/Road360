import { describe, expect, it } from 'vitest';
import { buildSummary } from '@/lib/insights/engine';
import { buildComparisons, dbComparison } from '@/lib/insights/comparisons';
import { ACHIEVEMENTS, achievementViews, evaluateAchievements } from '@/lib/insights/achievements';
import { buildWrapped } from '@/lib/insights/wrapped';
import { buildLifetime } from '@/lib/analytics/aggregate';
import { computeScore } from '@/lib/score/engine';
import { EMPTY_LIFETIME } from '@/lib/domain/aggregates';
import { newSyncMeta, type TripId } from '@/lib/domain/schema';
import type { TripRecord } from '@/lib/domain/trip';
import { noiseStats, tripStats, TEST_DEVICE } from './fixtures';
import type { TripStats } from '@/lib/domain/stats';

const trip = { id: 'TESTTRIP00000000000000000A' as TripId, startedAt: 1_700_000_000_000 };

function summaryFor(stats: TripStats, history: Parameters<typeof buildSummary>[0]['history'] = null) {
  return buildSummary({ trip, stats, score: computeScore(stats), history });
}

function makeTrip(overrides: Partial<TripRecord> & { stats: TripStats }): TripRecord {
  const startedAt = overrides.startedAt ?? 1_700_000_000_000;
  return {
    ...newSyncMeta(TEST_DEVICE, startedAt),
    id: (overrides.id ?? `T${Math.random().toString(36).slice(2, 12).toUpperCase()}`) as TripId,
    status: 'completed',
    startedAt,
    endedAt: startedAt + overrides.stats.durationMs,
    tzOffsetMin: 0,
    dayKey: '2026-07-20',
    weekKey: '2026-W30',
    monthKey: '2026-07',
    title: null,
    sampleCount: 100,
    chunkCount: 1,
    eventCount: 10,
    score: computeScore(overrides.stats),
    summary: null,
    achievementsUnlocked: [],
    route: { simplified: [], bounds: null, startGeohash: null, endGeohash: null },
    sensorsUsed: ['gps', 'audio', 'motion'],
    simulated: false,
    app: { version: '0.1.0', detectorId: 'heuristic-v1', scoreVersion: 'score-v1' },
    ...overrides,
  };
}

describe('summary generation', () => {
  it('always produces a headline, narrative and three comparisons', () => {
    const summary = summaryFor(tripStats());

    expect(summary.headline.length).toBeGreaterThan(0);
    expect(summary.narrative.length).toBeGreaterThan(0);
    expect(summary.comparisons).toHaveLength(3);
    expect(summary.insights.length).toBeGreaterThan(0);
  });

  it('is deterministic for a given trip', () => {
    const stats = tripStats();
    expect(summaryFor(stats).narrative).toBe(summaryFor(stats).narrative);
  });

  it('leads with the horn cadence on a relentless drive', () => {
    const summary = summaryFor(
      tripStats({ hornsPerMin: 12.8, avgSecondsBetweenHorns: 4.7, soundCounts: { horn: 192, siren: 0, whistle: 0, unknown: 0 } }),
    );
    expect(summary.headline).toContain('4.7 seconds');
    expect(summary.headline).toMatch(/one horn every/i);
  });

  it('reports where braking concentrated when it genuinely did', () => {
    const stats = tripStats();
    stats.segments = [
      { ...stats.segments[0]!, hardBrakes: 1 },
      { ...stats.segments[1]!, hardBrakes: 1 },
      { ...stats.segments[2]!, hardBrakes: 8, label: 'final' },
    ];

    const summary = summaryFor(stats);
    const segmentInsight = summary.insights.find((i) => i.category === 'segment');
    expect(segmentInsight?.text).toContain('final third');
  });

  it('makes no segment claim when events are spread evenly', () => {
    const stats = tripStats();
    stats.segments = [
      { ...stats.segments[0]!, hardBrakes: 3 },
      { ...stats.segments[1]!, hardBrakes: 3 },
      { ...stats.segments[2]!, hardBrakes: 3 },
    ];

    const summary = summaryFor(stats);
    expect(summary.insights.some((i) => i.id === 'brake.cluster.segment')).toBe(false);
  });

  it('never repeats a category', () => {
    const summary = summaryFor(tripStats());
    const categories = summary.insights.map((i) => i.category);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('does not compare against history on a first trip', () => {
    const summary = summaryFor(tripStats());
    expect(summary.insights.some((i) => i.category === 'trend')).toBe(false);
    expect(summary.insights.some((i) => i.id === 'record.personal-best')).toBe(false);
  });

  it('compares against history once there is history', () => {
    const summary = summaryFor(tripStats(), {
      avgScore: 40,
      avgDb: 70,
      tripCount: 12,
      bestScore: 60,
      longestSilenceMs: 100_000,
    });
    expect(summary.insights.some((i) => i.category === 'trend' || i.id === 'record.personal-best')).toBe(
      true,
    );
  });

  it('says so when sensors were missing rather than pretending otherwise', () => {
    const stats = tripStats();
    stats.coverage = { gps: 1, audio: 0, motion: 1, available: ['gps', 'motion'], denied: ['audio'] };
    const summary = summaryFor(stats);
    expect(summary.insights.some((i) => i.id === 'coverage.partial')).toBe(true);
  });

  it('always has something to say, even about a featureless drive', () => {
    const flat = tripStats({
      soundCounts: { horn: 0, siren: 0, whistle: 0, unknown: 0 },
      hornsPerMin: 0,
      avgSecondsBetweenHorns: null,
      hardBrakes: 0,
      rapidAccels: 0,
      aggressiveAccels: 0,
      brakesPerKm: 0,
      accelsPerKm: 0,
      stoppedRatio: 0.05,
      longestSilenceMs: 300_000,
      segments: [],
      quintiles: [],
    });
    expect(summaryFor(flat).headline.length).toBeGreaterThan(0);
  });
});

describe('comparisons', () => {
  it('maps 84 dB to the motorcycle line', () => {
    const c = dbComparison(84);
    expect(c.headline).toBe('Louder than a motorcycle');
    expect(c.detail).toContain('84 dB');
  });

  it('walks the whole ladder without gaps', () => {
    for (let db = 30; db <= 110; db += 2) {
      const c = dbComparison(db);
      expect(c.headline.length).toBeGreaterThan(0);
      expect(c.detail).toContain(String(Math.round(db)));
    }
  });

  it('always leads with the dB comparison', () => {
    expect(buildComparisons(tripStats())[0]!.id).toBe('compare.db');
  });

  it('calls out a drive with no peace', () => {
    const comparisons = buildComparisons(
      tripStats({ longestSilenceMs: 31_000, soundCounts: { horn: 40, siren: 0, whistle: 0, unknown: 0 } }),
    );
    const peace = comparisons.find((c) => c.id === 'compare.peace');
    expect(peace?.detail).toContain('31');
  });

  it('calls out overworked brakes', () => {
    const comparisons = buildComparisons(tripStats({ hardBrakes: 9 }));
    expect(comparisons.some((c) => c.headline === 'Your brakes worked overtime')).toBe(true);
  });

  it('does not say the same thing twice', () => {
    const comparisons = buildComparisons(
      tripStats({ longestSilenceMs: 20_000, soundCounts: { horn: 60, siren: 0, whistle: 0, unknown: 0 } }),
    );
    expect(new Set(comparisons.map((c) => c.id)).size).toBe(comparisons.length);
  });
});

describe('achievements', () => {
  const baseTrip = makeTrip({ stats: tripStats() });

  it('unlocks the first drive', () => {
    const unlocked = evaluateAchievements(
      { trip: baseTrip, lifetime: { ...EMPTY_LIFETIME, tripCount: 1 } },
      new Set(),
    );
    expect(unlocked.some((u) => u.def.id === 'first-drive')).toBe(true);
  });

  it('unlocks a zen drive only when there were no horns at all', () => {
    const zen = makeTrip({
      stats: tripStats({ soundCounts: { horn: 0, siren: 0, whistle: 0, unknown: 0 }, durationMs: 600_000 }),
    });
    const noisy = makeTrip({ stats: tripStats() });

    expect(
      evaluateAchievements({ trip: zen, lifetime: EMPTY_LIFETIME }, new Set()).some(
        (u) => u.def.id === 'zen-drive',
      ),
    ).toBe(true);
    expect(
      evaluateAchievements({ trip: noisy, lifetime: EMPTY_LIFETIME }, new Set()).some(
        (u) => u.def.id === 'zen-drive',
      ),
    ).toBe(false);
  });

  it('does not re-unlock something already earned', () => {
    const ctx = { trip: baseTrip, lifetime: { ...EMPTY_LIFETIME, tripCount: 1 } };
    const unlocked = evaluateAchievements(ctx, new Set(['first-drive']));
    expect(unlocked.some((u) => u.def.id === 'first-drive')).toBe(false);
  });

  it('unlocks horn milestones in tier order', () => {
    const ctx = { trip: baseTrip, lifetime: { ...EMPTY_LIFETIME, totalHorns: 1200 } };
    const ids = evaluateAchievements(ctx, new Set()).map((u) => u.def.id);
    expect(ids).toContain('horns-100');
    expect(ids).toContain('horns-1000');
    expect(ids).not.toContain('horns-10000');
  });

  it('reports partial progress on locked achievements', () => {
    const views = achievementViews(
      { trip: baseTrip, lifetime: { ...EMPTY_LIFETIME, totalHorns: 500 } },
      [],
    );
    const thousand = views.find((v) => v.def.id === 'horns-1000');
    expect(thousand?.fraction).toBeCloseTo(0.5, 2);
    expect(thousand?.unlocked).toBeNull();
  });

  it('shows an unlocked achievement as complete regardless of the current trip', () => {
    const views = achievementViews({ trip: baseTrip, lifetime: EMPTY_LIFETIME }, [
      { id: 'zen-drive', unlockedAt: 1000, tripId: baseTrip.id, valueAtUnlock: 1 },
    ]);
    const zen = views.find((v) => v.def.id === 'zen-drive');
    expect(zen?.fraction).toBe(1);
    expect(zen?.unlocked).not.toBeNull();
  });

  it('has unique ids and positive goals', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.every((a) => a.goal > 0)).toBe(true);
  });
});

describe('Road360 Wrapped', () => {
  const july = new Date('2026-07-15T08:00:00Z').getTime();

  function monthOfTrips(count: number, statsFor: (i: number) => TripStats): TripRecord[] {
    return Array.from({ length: count }, (_, i) =>
      makeTrip({
        id: `WRAPPED${String(i).padStart(18, '0')}` as TripId,
        startedAt: july + i * 86_400_000,
        stats: statsFor(i),
      }),
    );
  }

  it('summarises a month of driving', () => {
    const trips = monthOfTrips(8, () => tripStats());
    const wrapped = buildWrapped({
      kind: 'month',
      label: 'July 2026',
      periodStart: july,
      periodEnd: july + 30 * 86_400_000,
      trips,
    });

    expect(wrapped.tripCount).toBe(8);
    expect(wrapped.totalHorns).toBe(8 * 12);
    expect(wrapped.slides.length).toBeGreaterThan(4);
    expect(wrapped.sparse).toBe(false);
  });

  it('flags a period with too little data as sparse', () => {
    const wrapped = buildWrapped({
      kind: 'month',
      label: 'July 2026',
      periodStart: july,
      periodEnd: july + 30 * 86_400_000,
      trips: monthOfTrips(1, () => tripStats()),
    });
    expect(wrapped.sparse).toBe(true);
  });

  it('renders a usable page even with no drives at all', () => {
    const wrapped = buildWrapped({
      kind: 'month',
      label: 'July 2026',
      periodStart: july,
      periodEnd: july + 30 * 86_400_000,
      trips: [],
    });
    expect(wrapped.slides).toHaveLength(1);
    expect(wrapped.slides[0]!.headline).toContain('No drives');
  });

  it('picks out the calmest and roughest drives', () => {
    const trips = [
      makeTrip({
        id: 'CALM0000000000000000000000' as TripId,
        startedAt: july,
        stats: tripStats({
          soundCounts: { horn: 0, siren: 0, whistle: 0, unknown: 0 },
          hornsPerMin: 0,
          hornsPerKm: 0,
          noise: noiseStats({ avgDb: 55 }),
          hardBrakes: 0,
          brakesPerKm: 0,
          rapidAccels: 0,
          accelsPerKm: 0,
          stoppedRatio: 0.02,
          jerkRms: 0.6,
        }),
      }),
      makeTrip({
        id: 'ROUGH000000000000000000000' as TripId,
        startedAt: july + 86_400_000,
        stats: tripStats({
          hornsPerMin: 11,
          hornsPerKm: 30,
          noise: noiseStats({ avgDb: 90 }),
          brakesPerKm: 3,
          accelsPerKm: 3,
          stoppedRatio: 0.8,
          jerkRms: 5,
        }),
      }),
    ];

    const wrapped = buildWrapped({
      kind: 'month',
      label: 'July 2026',
      periodStart: july,
      periodEnd: july + 30 * 86_400_000,
      trips,
    });

    expect(wrapped.slides.find((s) => s.id === 'calmest')?.tripId).toBe('CALM0000000000000000000000');
    expect(wrapped.slides.find((s) => s.id === 'roughest')?.tripId).toBe('ROUGH000000000000000000000');
  });

  it('reports a trend against the previous period', () => {
    const calm = monthOfTrips(4, () =>
      tripStats({
        hornsPerMin: 0,
        hornsPerKm: 0,
        noise: noiseStats({ avgDb: 56 }),
        brakesPerKm: 0,
        accelsPerKm: 0,
        stoppedRatio: 0.05,
        jerkRms: 0.7,
      }),
    );
    const rough = monthOfTrips(4, () =>
      tripStats({
        hornsPerMin: 9,
        hornsPerKm: 25,
        noise: noiseStats({ avgDb: 88 }),
        brakesPerKm: 2.5,
        accelsPerKm: 3,
        stoppedRatio: 0.7,
        jerkRms: 4.5,
      }),
    );

    const wrapped = buildWrapped({
      kind: 'month',
      label: 'July 2026',
      periodStart: july,
      periodEnd: july + 30 * 86_400_000,
      trips: calm,
      previousTrips: rough,
    });

    expect(wrapped.scoreDelta).not.toBeNull();
    expect(wrapped.scoreDelta!).toBeGreaterThan(0);
    expect(wrapped.slides.find((s) => s.id === 'trend')?.eyebrow).toBe('Trending calmer');
  });

  it('counts a simulated trip like any other completed drive', () => {
    const trips = [
      makeTrip({ startedAt: july, stats: tripStats() }),
      makeTrip({ startedAt: july + 1000, stats: tripStats(), simulated: true }),
    ];

    const wrapped = buildWrapped({
      kind: 'month',
      label: 'July 2026',
      periodStart: july,
      periodEnd: july + 30 * 86_400_000,
      trips,
    });
    expect(wrapped.tripCount).toBe(2);
  });
});

describe('lifetime aggregation', () => {
  it('counts an excellent streak back from the most recent drive', () => {
    const calm = tripStats({
      hornsPerMin: 0,
      hornsPerKm: 0,
      noise: noiseStats({ avgDb: 55 }),
      brakesPerKm: 0,
      accelsPerKm: 0,
      stoppedRatio: 0.02,
      jerkRms: 0.5,
    });
    const rough = tripStats({
      hornsPerMin: 10,
      hornsPerKm: 30,
      noise: noiseStats({ avgDb: 90 }),
      brakesPerKm: 3,
      accelsPerKm: 3,
      stoppedRatio: 0.8,
      jerkRms: 5,
    });

    const base = 1_700_000_000_000;
    const lifetime = buildLifetime([
      makeTrip({ startedAt: base, stats: rough }),
      makeTrip({ startedAt: base + 1000, stats: calm }),
      makeTrip({ startedAt: base + 2000, stats: calm }),
    ]);

    expect(lifetime.currentExcellentStreak).toBe(2);
    expect(lifetime.tripCount).toBe(3);
  });

  it('ignores incomplete trips but counts simulated ones', () => {
    const lifetime = buildLifetime([
      makeTrip({ stats: tripStats(), simulated: true }),
      makeTrip({ stats: tripStats(), status: 'recording' }),
      makeTrip({ stats: tripStats() }),
    ]);
    expect(lifetime.tripCount).toBe(2);
  });
});
