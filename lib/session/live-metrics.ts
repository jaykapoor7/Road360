import type { SoundEventType } from '@/lib/domain/events';
import { SOUND_EVENT_TYPES } from '@/lib/domain/events';
import type { ScoreBand } from '@/lib/domain/score';
import { bandFor } from '@/lib/score/labels';
import { piecewiseInterpolate } from '@/lib/score/curve';
import {
  BRAKING_ANCHORS,
  HORN_ANCHORS,
  NOISE_ANCHORS,
  ACCEL_ANCHORS,
  STOPGO_ANCHORS,
} from '@/lib/score/weights';
import { safeDiv } from '@/lib/utils/math';
import { MINUTE } from '@/lib/utils/time';
import type { LiveMetrics } from './session-store';
import { EMPTY_METRICS } from './session-store';

/**
 * Running trip statistics.
 *
 * Every update is O(1) — counters, running sums, and min/max. Nothing here
 * re-walks the sample history, because this runs once a second for the length
 * of a drive and an O(n) update would degrade steadily as the trip got longer.
 *
 * Energy averaging for dB is done incrementally over linear power, since
 * decibels cannot be averaged arithmetically.
 */
export class LiveMetricsAccumulator {
  private distanceM = 0;
  private movingMs = 0;
  private stoppedMs = 0;
  private maxSpeed = 0;
  private currentSpeed = 0;

  private readonly soundCounts: Record<SoundEventType, number> = {
    horn: 0,
    siren: 0,
    whistle: 0,
    unknown: 0,
  };

  private hornTimes: number[] = [];
  private lastHornAt: number | null = null;
  private longestSilenceMs = 0;
  private silenceStart = 0;

  private dbPowerSum = 0;
  private dbSamples = 0;
  private currentDb = 0;
  private peakDb = 0;

  private hardBrakes = 0;
  private rapidAccels = 0;

  private tripTimeMs = 0;

  reset(): void {
    this.distanceM = 0;
    this.movingMs = 0;
    this.stoppedMs = 0;
    this.maxSpeed = 0;
    this.currentSpeed = 0;
    for (const type of SOUND_EVENT_TYPES) this.soundCounts[type] = 0;
    this.hornTimes = [];
    this.lastHornAt = null;
    this.longestSilenceMs = 0;
    this.silenceStart = 0;
    this.dbPowerSum = 0;
    this.dbSamples = 0;
    this.currentDb = 0;
    this.peakDb = 0;
    this.hardBrakes = 0;
    this.rapidAccels = 0;
    this.tripTimeMs = 0;
  }

  tick(tripTimeMs: number, deltaMs: number, speedMps: number | null, moving: boolean): void {
    this.tripTimeMs = tripTimeMs;
    if (moving) this.movingMs += deltaMs;
    else this.stoppedMs += deltaMs;

    if (speedMps !== null) {
      this.currentSpeed = speedMps;
      if (speedMps > this.maxSpeed) this.maxSpeed = speedMps;
    }
  }

  addDistance(metres: number): void {
    this.distanceM += metres;
  }

  addNoise(db: number, peak: number): void {
    this.currentDb = db;
    if (peak > this.peakDb) this.peakDb = peak;
    // Accumulate in the linear domain; converting back only when read.
    this.dbPowerSum += Math.pow(10, db / 10);
    this.dbSamples += 1;
  }

  addSound(type: SoundEventType, tripTimeMs: number): void {
    this.soundCounts[type] += 1;
    if (type !== 'horn') return;

    if (this.lastHornAt !== null) {
      const gap = tripTimeMs - this.lastHornAt;
      if (gap > this.longestSilenceMs) this.longestSilenceMs = gap;
    } else {
      // The run from trip start to the first horn is a silence too.
      const gap = tripTimeMs - this.silenceStart;
      if (gap > this.longestSilenceMs) this.longestSilenceMs = gap;
    }

    this.lastHornAt = tripTimeMs;
    this.hornTimes.push(tripTimeMs);
  }

  addBrake(): void {
    this.hardBrakes += 1;
  }

  addAccel(): void {
    this.rapidAccels += 1;
  }

  /** Silence still in progress — shown live, and folded in when the trip ends. */
  currentSilenceMs(tripTimeMs: number): number {
    const from = this.lastHornAt ?? this.silenceStart;
    return Math.max(0, tripTimeMs - from);
  }

  get avgDb(): number {
    if (this.dbSamples === 0) return 0;
    return 10 * Math.log10(this.dbPowerSum / this.dbSamples);
  }

  snapshot(tripTimeMs: number): LiveMetrics {
    const minutes = Math.max(tripTimeMs / MINUTE, 1 / 60);
    const km = this.distanceM / 1000;

    const hornsPerMin = safeDiv(this.soundCounts.horn, minutes);
    const stoppedRatio = safeDiv(this.stoppedMs, this.stoppedMs + this.movingMs);

    // A cheap provisional score for the live screen — the same anchor tables,
    // unweighted by coverage. The authoritative score is computed at trip end.
    const parts = [
      piecewiseInterpolate(HORN_ANCHORS, hornsPerMin) * 0.28,
      piecewiseInterpolate(NOISE_ANCHORS, this.avgDb || 55) * 0.22,
      piecewiseInterpolate(BRAKING_ANCHORS, km > 0.1 ? this.hardBrakes / km : 0) * 0.18,
      piecewiseInterpolate(ACCEL_ANCHORS, km > 0.1 ? this.rapidAccels / km : 0) * 0.12,
      piecewiseInterpolate(STOPGO_ANCHORS, stoppedRatio) * 0.1,
      70 * 0.1, // smoothness placeholder; not worth recomputing at 1 Hz
    ];
    const provisionalScore = Math.round(parts.reduce((a, b) => a + b, 0));

    const gaps = this.hornGaps();
    const currentSilence = this.currentSilenceMs(tripTimeMs);

    return {
      tripTimeMs,
      distanceM: this.distanceM,
      movingMs: this.movingMs,
      stoppedMs: this.stoppedMs,
      soundCounts: { ...this.soundCounts },
      hornCount: this.soundCounts.horn,
      avgSecondsBetweenHorns: gaps,
      longestSilenceMs: Math.max(this.longestSilenceMs, currentSilence),
      currentSilenceMs: currentSilence,
      currentDb: this.currentDb,
      avgDb: this.avgDb,
      peakDb: this.peakDb,
      hardBrakes: this.hardBrakes,
      rapidAccels: this.rapidAccels,
      currentSpeed: this.currentSpeed,
      maxSpeed: this.maxSpeed,
      provisionalScore,
      provisionalBand: bandFor(provisionalScore).band as ScoreBand,
    };
  }

  private hornGaps(): number | null {
    if (this.hornTimes.length < 2) return null;
    const first = this.hornTimes[0]!;
    const last = this.hornTimes[this.hornTimes.length - 1]!;
    return (last - first) / 1000 / (this.hornTimes.length - 1);
  }

  get raw() {
    return {
      distanceM: this.distanceM,
      movingMs: this.movingMs,
      stoppedMs: this.stoppedMs,
      soundCounts: { ...this.soundCounts },
      hornTimes: [...this.hornTimes],
      longestSilenceMs: this.longestSilenceMs,
      avgDb: this.avgDb,
      peakDb: this.peakDb,
      hardBrakes: this.hardBrakes,
      rapidAccels: this.rapidAccels,
      maxSpeed: this.maxSpeed,
      tripTimeMs: this.tripTimeMs,
    };
  }
}

export { EMPTY_METRICS };
