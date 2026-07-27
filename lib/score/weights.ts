import type { SubScoreKey } from '@/lib/domain/score';
import type { SensorKind } from '@/lib/domain/sensors';
import type { AnchorTable } from './curve';

/**
 * Scoring is tuned here and nowhere else. `engine.ts` contains the algorithm;
 * this file contains the opinions, so they can be adjusted independently.
 */

export const WEIGHTS: Record<SubScoreKey, number> = {
  hornPressure: 0.28,
  noise: 0.22,
  braking: 0.18,
  acceleration: 0.12,
  stopAndGo: 0.1,
  smoothness: 0.1,
};

/**
 * Which sensor each sub-score depends on. When a sensor is unavailable its
 * sub-scores are dropped and the remaining weights renormalised, so a
 * mic-denied user still gets an honest score rather than a punitive one.
 */
export const REQUIRED_SENSOR: Record<SubScoreKey, SensorKind> = {
  hornPressure: 'audio',
  noise: 'audio',
  braking: 'motion',
  acceleration: 'motion',
  stopAndGo: 'gps',
  smoothness: 'motion',
};

/** Braking and acceleration can fall back to a GPS-derived proxy at reduced trust. */
export const GPS_PROXY_SUB_SCORES: readonly SubScoreKey[] = ['braking', 'acceleration'];
export const GPS_PROXY_WEIGHT_FACTOR = 0.6;

/* ----------------------------- anchor tables ----------------------------- */
/* Input → sub-score, where 100 is calm. */

/** Horns per minute. */
export const HORN_ANCHORS: AnchorTable = [
  [0, 100],
  [0.5, 90],
  [1, 78],
  [2, 60],
  [4, 35],
  [8, 12],
  [15, 0],
];

/** Trip Leq, dB. */
export const NOISE_ANCHORS: AnchorTable = [
  [55, 100],
  [62, 88],
  [68, 72],
  [74, 50],
  [80, 28],
  [86, 10],
  [92, 0],
];

/** Hard brakes per km. */
export const BRAKING_ANCHORS: AnchorTable = [
  [0, 100],
  [0.2, 88],
  [0.5, 72],
  [1, 50],
  [2, 25],
  [4, 0],
];

/** Rapid accelerations per km. */
export const ACCEL_ANCHORS: AnchorTable = [
  [0, 100],
  [0.3, 88],
  [0.8, 68],
  [1.5, 45],
  [3, 20],
  [5, 0],
];

/** Fraction of the trip spent stopped. */
export const STOPGO_ANCHORS: AnchorTable = [
  [0, 100],
  [0.1, 92],
  [0.2, 80],
  [0.35, 62],
  [0.5, 42],
  [0.7, 20],
  [0.9, 0],
];

/** RMS jerk, m/s³. */
export const SMOOTHNESS_ANCHORS: AnchorTable = [
  [0.5, 100],
  [1, 88],
  [1.8, 70],
  [2.8, 48],
  [4, 25],
  [6, 0],
];

/**
 * Distance-free fallbacks. Without GPS there is no denominator in kilometres,
 * so braking and acceleration switch to per-minute rates.
 */
export const BRAKING_PER_MIN_ANCHORS: AnchorTable = [
  [0, 100],
  [0.3, 88],
  [0.8, 68],
  [1.6, 45],
  [3, 20],
  [6, 0],
];

export const ACCEL_PER_MIN_ANCHORS: AnchorTable = BRAKING_PER_MIN_ANCHORS;

/* ------------------------------ trip guards ------------------------------ */

/**
 * Short trips are statistically meaningless — two honks in forty seconds is not
 * a chaotic commute, it is a small sample. The score is blended toward neutral
 * until a trip reaches five minutes or one kilometre.
 */
export const SHORT_TRIP = {
  fullCreditMs: 300_000,
  fullCreditM: 1000,
  neutralScore: 70,
} as const;

/** Below this coverage the report shows a "Partial data" chip. */
export const PARTIAL_DATA_THRESHOLD = 0.85;
