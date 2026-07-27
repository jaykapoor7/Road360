import {
  bandEnergy,
  bandMedian,
  findPeak,
  harmonicScore,
  peakProminence,
  spectralCentroid,
  spectralFlatness,
} from './spectral';

/**
 * The feature vector shared by the trained classifier and its training script.
 *
 * This file is the contract between offline training and on-device inference:
 * if the extraction changes here, the model must be retrained, which is why
 * `FEATURE_VERSION` is stamped into the exported weights and checked at load.
 *
 * Features are deliberately scale-invariant (ratios, log-ratios, normalised
 * frequencies) rather than absolute magnitudes, so the model does not have to
 * learn to ignore recording gain.
 */
export const FEATURE_VERSION = 1;

export const FEATURE_NAMES = [
  'bandRatioLow', // 300–2000 Hz share of total energy — where horns live
  'bandRatioMid', // 2000–4000 Hz share
  'bandRatioHigh', // 4000–8000 Hz share — whistles live up here
  'flatness', // Wiener entropy: ~1 noise, ~0 tone
  'prominenceLog', // log peak-to-median ratio in the horn band
  'globalProminenceLog', // same, across the whole analysis band
  'harmonicScore', // how much of a harmonic stack sits above the fundamental
  'globalHarmonicScore',
  'peakHzNorm', // dominant frequency, normalised to Nyquist
  'centroidNorm', // spectral centre of mass, normalised
  'peakInHornBand', // 1 when the global peak sits in the horn band
  'aboveFloorNorm', // how far above the ambient floor, normalised
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export const FEATURE_COUNT = FEATURE_NAMES.length;

const HORN_BAND: readonly [number, number] = [300, 2000];
const MID_BAND: readonly [number, number] = [2000, 4000];
const HIGH_BAND: readonly [number, number] = [4000, 8000];
const ANALYSIS: readonly [number, number] = [100, 8000];

const log1pRatio = (value: number): number => Math.log1p(Math.max(0, value)) / Math.log(100);

export interface FeatureInput {
  magnitudes: Float32Array;
  binHz: number;
  /** Level of this frame, and the rolling ambient floor, in the same units. */
  peakDb: number;
  floorDb: number;
}

/**
 * Extract features into `out` (length `FEATURE_COUNT`).
 *
 * Takes a destination array so inference allocates nothing per frame — this
 * runs 20 times a second for the length of a drive.
 */
export function extractFeatures(
  input: FeatureInput,
  out: Float32Array,
  scratch: number[] = [],
): Float32Array {
  const { magnitudes, binHz } = input;
  const nyquist = (magnitudes.length * binHz) || 1;

  const total = bandEnergy(magnitudes, binHz, ANALYSIS[0], ANALYSIS[1]) || 1e-12;
  const low = bandEnergy(magnitudes, binHz, HORN_BAND[0], HORN_BAND[1]);
  const mid = bandEnergy(magnitudes, binHz, MID_BAND[0], MID_BAND[1]);
  const high = bandEnergy(magnitudes, binHz, HIGH_BAND[0], HIGH_BAND[1]);

  const hornPeak = findPeak(magnitudes, binHz, HORN_BAND[0], 800);
  const hornMedian = bandMedian(magnitudes, binHz, HORN_BAND[0], HORN_BAND[1], scratch);
  const globalPeak = findPeak(magnitudes, binHz, ANALYSIS[0], ANALYSIS[1]);
  const globalMedian = bandMedian(magnitudes, binHz, ANALYSIS[0], ANALYSIS[1], scratch);

  out[0] = low / total;
  out[1] = mid / total;
  out[2] = high / total;
  out[3] = spectralFlatness(magnitudes, binHz, ANALYSIS[0], ANALYSIS[1]);
  out[4] = log1pRatio(peakProminence(hornPeak, hornMedian));
  out[5] = log1pRatio(peakProminence(globalPeak, globalMedian));
  out[6] = harmonicScore(magnitudes, binHz, hornPeak.hz, hornPeak.magnitude);
  out[7] = harmonicScore(magnitudes, binHz, globalPeak.hz, globalPeak.magnitude);
  out[8] = Math.min(1, globalPeak.hz / nyquist);
  out[9] = Math.min(1, spectralCentroid(magnitudes, binHz, ANALYSIS[0], ANALYSIS[1]) / nyquist);
  out[10] = globalPeak.hz >= HORN_BAND[0] && globalPeak.hz <= HORN_BAND[1] ? 1 : 0;
  out[11] = Math.max(0, Math.min(1, (input.peakDb - input.floorDb) / 40));

  return out;
}

/**
 * Temporal features summarising a candidate sound over its whole duration.
 *
 * A single frame cannot separate a horn from a siren — they look nearly
 * identical instantaneously. What distinguishes them is behaviour over time:
 * pitch drift, centroid sweep, duration. These are appended to the mean of the
 * per-frame features to form the classifier's input.
 */
export const TEMPORAL_NAMES = [
  'pitchDriftNorm', // how far the fundamental wandered
  'centroidStdNorm', // how much the centre of mass swept — sirens sweep
  'durationNorm', // event length
  'levelRangeNorm', // dynamic range across the event
] as const;

export const TEMPORAL_COUNT = TEMPORAL_NAMES.length;
export const INPUT_SIZE = FEATURE_COUNT + TEMPORAL_COUNT;

export interface TemporalInput {
  pitchDriftHz: number;
  centroidStdHz: number;
  durationMs: number;
  levelRangeDb: number;
}

export function extractTemporal(input: TemporalInput, out: Float32Array, offset: number): void {
  out[offset] = Math.min(1, input.pitchDriftHz / 400);
  out[offset + 1] = Math.min(1, input.centroidStdHz / 1200);
  out[offset + 2] = Math.min(1, input.durationMs / 4000);
  out[offset + 3] = Math.min(1, input.levelRangeDb / 40);
}

export const CLASS_ORDER = ['horn', 'siren', 'whistle', 'noise'] as const;
export type ModelClass = (typeof CLASS_ORDER)[number];
