import type { SoundEventType } from './events';
import type { Offset } from './schema';
import type { SensorCoverage } from './sensors';

export interface NoiseStats {
  /** Energy-averaged Leq over the trip, not an arithmetic mean of dB values. */
  avgDb: number;
  peakDb: number;
  minDb: number;
  p50Db: number;
  p90Db: number;
  p95Db: number;
  /** Seconds above 80 dB. */
  loudSeconds: number;
  /** Seconds below 60 dB. */
  quietSeconds: number;
  /** Median ambient floor. */
  floorDb: number;
  /**
   * dB added to the raw dBFS reading. A phone microphone is not a sound level
   * meter, so this is a user-adjustable offset, and `calibrated` stays false
   * until they set it — the UI says "approximate" rather than claiming SPL.
   */
  calibrationOffset: number;
  calibrated: boolean;
}

/** A slice of the trip, used to say things like "most braking in the final third". */
export interface SegmentStats {
  index: number;
  label: string;
  from: Offset;
  to: Offset;
  horns: number;
  hardBrakes: number;
  rapidAccels: number;
  avgDb: number;
  peakDb: number;
  distanceM: number;
  stoppedMs: number;
  avgSpeed: number;
}

export interface TripStats {
  /** Wall clock, including stops. */
  durationMs: number;
  /** durationMs minus suspended windows — the denominator for every rate. */
  activeMs: number;
  distanceM: number;
  movingMs: number;
  stoppedMs: number;
  stoppedRatio: number;
  stopCount: number;
  avgSpeed: number;
  maxSpeed: number;

  soundCounts: Record<SoundEventType, number>;
  /** Raw pre-grouping blast count — three taps of one horn count as three here. */
  hornBlasts: number;
  hornsPerMin: number;
  hornsPerKm: number;
  avgSecondsBetweenHorns: number | null;
  longestSilenceMs: number;
  longestSilenceAt: Offset | null;
  firstHornAt: Offset | null;
  lastHornAt: Offset | null;

  noise: NoiseStats;

  hardBrakes: number;
  severeBrakes: number;
  brakesPerKm: number;
  rapidAccels: number;
  aggressiveAccels: number;
  accelsPerKm: number;
  jerkRms: number;
  jerkP95: number;

  /** Thirds — coarse enough to make honest claims about where things happened. */
  segments: SegmentStats[];
  /** Fifths — used to locate a single "peak chaos" moment. */
  quintiles: SegmentStats[];
  coverage: SensorCoverage;
}

export const hornCount = (s: TripStats): number => s.soundCounts.horn;
