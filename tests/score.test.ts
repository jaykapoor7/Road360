import { describe, expect, it } from 'vitest';
import { computeScore, shortTripWeight } from '@/lib/score/engine';
import { bandFor, SCORE_VERSION } from '@/lib/score/labels';
import { piecewiseInterpolate } from '@/lib/score/curve';
import { HORN_ANCHORS } from '@/lib/score/weights';
import { SUB_SCORE_KEYS } from '@/lib/domain/score';
import { coverage, noiseStats, tripStats } from './fixtures';

describe('piecewiseInterpolate', () => {
  it('returns the anchor value at an exact anchor point', () => {
    expect(piecewiseInterpolate(HORN_ANCHORS, 2)).toBe(60);
  });

  it('interpolates linearly between anchors', () => {
    // Midway between [1, 78] and [2, 60].
    expect(piecewiseInterpolate(HORN_ANCHORS, 1.5)).toBeCloseTo(69, 5);
  });

  it('clamps outside the table rather than extrapolating', () => {
    expect(piecewiseInterpolate(HORN_ANCHORS, -5)).toBe(100);
    expect(piecewiseInterpolate(HORN_ANCHORS, 500)).toBe(0);
  });
});

describe('bandFor', () => {
  it('maps each range to the documented band', () => {
    expect(bandFor(100).band).toBe('excellent');
    expect(bandFor(80).band).toBe('excellent');
    expect(bandFor(79).band).toBe('normal');
    expect(bandFor(60).band).toBe('normal');
    expect(bandFor(59).band).toBe('stressful');
    expect(bandFor(40).band).toBe('stressful');
    expect(bandFor(39).band).toBe('chaos');
    expect(bandFor(0).band).toBe('chaos');
  });
});

describe('computeScore', () => {
  it('scores a calm drive as excellent', () => {
    const score = computeScore(
      tripStats({
        soundCounts: { horn: 0, siren: 0, whistle: 0, unknown: 0 },
        hornsPerMin: 0,
        hornsPerKm: 0,
        noise: noiseStats({ avgDb: 56 }),
        hardBrakes: 0,
        brakesPerKm: 0,
        rapidAccels: 0,
        accelsPerKm: 0,
        stoppedRatio: 0.05,
        jerkRms: 0.6,
      }),
    );

    expect(score.value).toBeGreaterThanOrEqual(80);
    expect(score.band).toBe('excellent');
    expect(score.provisional).toBe(false);
    expect(score.algorithmVersion).toBe(SCORE_VERSION);
  });

  it('scores a relentless drive as chaos', () => {
    const score = computeScore(
      tripStats({
        soundCounts: { horn: 300, siren: 4, whistle: 0, unknown: 20 },
        hornsPerMin: 10,
        hornsPerKm: 33,
        noise: noiseStats({ avgDb: 89 }),
        hardBrakes: 20,
        brakesPerKm: 2.5,
        rapidAccels: 30,
        accelsPerKm: 3.4,
        stoppedRatio: 0.75,
        jerkRms: 5,
      }),
    );

    expect(score.value).toBeLessThan(40);
    expect(score.band).toBe('chaos');
  });

  it('produces a middling score for an ordinary drive', () => {
    const score = computeScore(tripStats());
    expect(score.value).toBeGreaterThan(40);
    expect(score.value).toBeLessThan(90);
  });

  it('weights sum to 1 across available sub-scores', () => {
    const score = computeScore(tripStats());
    const total = SUB_SCORE_KEYS.reduce((acc, k) => acc + score.breakdown[k].weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  describe('coverage renormalisation', () => {
    it('drops audio sub-scores and redistributes weight when the mic is denied', () => {
      const score = computeScore(tripStats({ coverage: coverage(['gps', 'motion']) }));

      expect(score.breakdown.hornPressure.available).toBe(false);
      expect(score.breakdown.noise.available).toBe(false);
      expect(score.breakdown.hornPressure.weight).toBe(0);

      const total = SUB_SCORE_KEYS.reduce((acc, k) => acc + score.breakdown[k].weight, 0);
      expect(total).toBeCloseTo(1, 6);
      // 1 - (0.28 + 0.22)
      expect(score.coverage).toBeCloseTo(0.5, 6);
    });

    it('keeps braking available via the GPS proxy when motion is denied', () => {
      const score = computeScore(tripStats({ coverage: coverage(['gps', 'audio']) }));

      expect(score.breakdown.braking.available).toBe(true);
      expect(score.breakdown.smoothness.available).toBe(false);
      // Proxied signals are trusted less than directly measured ones.
      expect(score.breakdown.braking.weight).toBeLessThan(score.breakdown.hornPressure.weight);
    });

    it('switches braking to a per-minute unit without GPS', () => {
      const score = computeScore(tripStats({ coverage: coverage(['audio', 'motion']) }));
      expect(score.breakdown.braking.unit).toBe('per min');
    });

    it('still produces a usable score from a single sensor', () => {
      const score = computeScore(tripStats({ coverage: coverage(['audio']) }));
      expect(score.value).toBeGreaterThan(0);
      expect(score.coverage).toBeCloseTo(0.5, 6);
    });
  });

  describe('short-trip guard', () => {
    it('blends a brief chaotic trip toward neutral rather than scoring it near zero', () => {
      const brief = tripStats({
        durationMs: 45_000,
        activeMs: 45_000,
        distanceM: 200,
        hornsPerMin: 8,
        hornsPerKm: 10,
        noise: noiseStats({ avgDb: 86 }),
        brakesPerKm: 3,
        accelsPerKm: 3,
        stoppedRatio: 0.6,
        jerkRms: 4,
      });

      const score = computeScore(brief);
      expect(score.provisional).toBe(true);
      // The raw signal here would be near zero; the guard keeps it honest.
      expect(score.value).toBeGreaterThan(30);
    });

    it('gives no length discount to a full-length trip', () => {
      expect(shortTripWeight(tripStats())).toBe(1);
      expect(computeScore(tripStats()).provisional).toBe(false);
    });
  });

  it('never returns a value outside 0..100', () => {
    const extreme = computeScore(
      tripStats({
        hornsPerMin: 1e6,
        hornsPerKm: 1e6,
        noise: noiseStats({ avgDb: 1e4 }),
        brakesPerKm: 1e6,
        accelsPerKm: 1e6,
        stoppedRatio: 50,
        jerkRms: 1e6,
      }),
    );
    expect(extreme.value).toBeGreaterThanOrEqual(0);
    expect(extreme.value).toBeLessThanOrEqual(100);
  });
});
