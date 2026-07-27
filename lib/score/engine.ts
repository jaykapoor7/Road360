import type { Road360Score, SubScore, SubScoreKey } from '@/lib/domain/score';
import { SUB_SCORE_KEYS } from '@/lib/domain/score';
import type { TripStats } from '@/lib/domain/stats';
import type { SensorCoverage, SensorKind } from '@/lib/domain/sensors';
import { clamp01, safeDiv } from '@/lib/utils/math';
import { MINUTE } from '@/lib/utils/time';
import { piecewiseInterpolate, clampScore, type AnchorTable } from './curve';
import { bandFor, SCORE_VERSION } from './labels';
import {
  ACCEL_ANCHORS,
  ACCEL_PER_MIN_ANCHORS,
  BRAKING_ANCHORS,
  BRAKING_PER_MIN_ANCHORS,
  GPS_PROXY_SUB_SCORES,
  GPS_PROXY_WEIGHT_FACTOR,
  HORN_ANCHORS,
  NOISE_ANCHORS,
  REQUIRED_SENSOR,
  SHORT_TRIP,
  SMOOTHNESS_ANCHORS,
  STOPGO_ANCHORS,
  WEIGHTS,
} from './weights';

interface SubScoreInput {
  raw: number;
  unit: string;
  anchors: AnchorTable;
}

/**
 * Build the raw inputs for each sub-score.
 *
 * Distance-normalised rates need GPS. Without it, braking and acceleration fall
 * back to per-minute rates against different anchors, and the unit changes so
 * the breakdown stays truthful about what is being measured.
 */
function subScoreInputs(stats: TripStats, hasGps: boolean): Record<SubScoreKey, SubScoreInput> {
  const activeMin = Math.max(stats.activeMs / MINUTE, 1 / 60);
  const km = stats.distanceM / 1000;

  const brakesPerMin = safeDiv(stats.hardBrakes, activeMin);
  const accelsPerMin = safeDiv(stats.rapidAccels, activeMin);

  return {
    hornPressure: {
      raw: stats.hornsPerMin,
      unit: 'horns/min',
      anchors: HORN_ANCHORS,
    },
    noise: {
      raw: stats.noise.avgDb,
      unit: 'dB',
      anchors: NOISE_ANCHORS,
    },
    braking:
      hasGps && km > 0.1
        ? { raw: stats.brakesPerKm, unit: 'per km', anchors: BRAKING_ANCHORS }
        : { raw: brakesPerMin, unit: 'per min', anchors: BRAKING_PER_MIN_ANCHORS },
    acceleration:
      hasGps && km > 0.1
        ? { raw: stats.accelsPerKm, unit: 'per km', anchors: ACCEL_ANCHORS }
        : { raw: accelsPerMin, unit: 'per min', anchors: ACCEL_PER_MIN_ANCHORS },
    stopAndGo: {
      raw: stats.stoppedRatio,
      unit: 'ratio',
      anchors: STOPGO_ANCHORS,
    },
    smoothness: {
      raw: stats.jerkRms,
      unit: 'm/s³',
      anchors: SMOOTHNESS_ANCHORS,
    },
  };
}

function isAvailable(key: SubScoreKey, coverage: SensorCoverage): boolean {
  const required: SensorKind = REQUIRED_SENSOR[key];
  if (coverage.available.includes(required)) return true;

  // Braking and acceleration survive a motion denial via a GPS-derived proxy,
  // at reduced weight — a real but less trustworthy signal.
  if (GPS_PROXY_SUB_SCORES.includes(key) && coverage.available.includes('gps')) return true;

  // Stop-and-go can be inferred from motion energy when GPS is absent.
  if (key === 'stopAndGo' && coverage.available.includes('motion')) return true;

  return false;
}

function effectiveWeight(key: SubScoreKey, coverage: SensorCoverage): number {
  const base = WEIGHTS[key];
  const required = REQUIRED_SENSOR[key];
  const proxied = !coverage.available.includes(required) && GPS_PROXY_SUB_SCORES.includes(key);
  return proxied ? base * GPS_PROXY_WEIGHT_FACTOR : base;
}

/**
 * Confidence weight for a trip's length. A 45-second drive with two honks
 * should not read as chaos, so short trips are blended toward neutral and
 * flagged `provisional`.
 */
export function shortTripWeight(stats: TripStats): number {
  return clamp01(
    Math.min(stats.activeMs / SHORT_TRIP.fullCreditMs, stats.distanceM / SHORT_TRIP.fullCreditM),
  );
}

export function computeScore(stats: TripStats, now: number = Date.now()): Road360Score {
  const coverage = stats.coverage;
  const hasGps = coverage.available.includes('gps');
  const inputs = subScoreInputs(stats, hasGps);

  // Pass 1 — score what we can measure and total the surviving weight.
  const available: SubScoreKey[] = [];
  let availableWeight = 0;
  let originalWeight = 0;

  for (const key of SUB_SCORE_KEYS) {
    if (!isAvailable(key, coverage)) continue;
    available.push(key);
    availableWeight += effectiveWeight(key, coverage);
    originalWeight += WEIGHTS[key];
  }

  // Pass 2 — renormalise so the remaining sub-scores still sum to 1.
  const breakdown = {} as Record<SubScoreKey, SubScore>;
  let total = 0;

  for (const key of SUB_SCORE_KEYS) {
    const input = inputs[key];
    const isOn = available.includes(key);
    const weight = isOn && availableWeight > 0 ? effectiveWeight(key, coverage) / availableWeight : 0;
    const value = isOn ? clampScore(piecewiseInterpolate(input.anchors, input.raw)) : 0;
    const contribution = value * weight;

    breakdown[key] = {
      key,
      raw: input.raw,
      unit: input.unit,
      value,
      weight,
      contribution,
      available: isOn,
    };

    total += contribution;
  }

  const raw = clampScore(total);
  const w = shortTripWeight(stats);
  const blended = w * raw + (1 - w) * (0.5 * raw + 0.5 * SHORT_TRIP.neutralScore);
  const value = Math.round(clampScore(blended));
  const band = bandFor(value);

  return {
    value,
    band: band.band,
    label: band.label,
    breakdown,
    coverage: originalWeight,
    provisional: w < 1,
    algorithmVersion: SCORE_VERSION,
    computedAt: now,
  };
}

/** True when the stored score was produced by a different version of this algorithm. */
export function isScoreStale(score: Road360Score | null): boolean {
  return score !== null && score.algorithmVersion !== SCORE_VERSION;
}
