import type { TripEvent, SoundEventType } from '@/lib/domain/events';
import { isAccel, isBrake, isGap, isHorn, isSound, isStop } from '@/lib/domain/events';
import type { TripSample } from '@/lib/domain/samples';
import type { NoiseStats, TripStats } from '@/lib/domain/stats';
import type { SensorCoverage, SensorKind } from '@/lib/domain/sensors';
import { AUDIO } from '@/lib/config/constants';
import { energyAverageDb, percentile, rms, safeDiv } from '@/lib/utils/math';
import { MINUTE } from '@/lib/utils/time';
import { buildSegments } from './segments';

export interface AnalyticsInput {
  samples: readonly TripSample[];
  events: readonly TripEvent[];
  durationMs: number;
  coverage: Record<SensorKind, number>;
  sensorsUsed: SensorKind[];
  calibrationOffset?: number;
  calibrated?: boolean;
}

function noiseStatsFrom(
  samples: readonly TripSample[],
  calibrationOffset: number,
  calibrated: boolean,
): NoiseStats {
  const dbs = samples.map((s) => s.db).filter((db) => db > 0);
  const peaks = samples.map((s) => s.dbPk).filter((db) => db > 0);

  if (dbs.length === 0) {
    return {
      avgDb: 0,
      peakDb: 0,
      minDb: 0,
      p50Db: 0,
      p90Db: 0,
      p95Db: 0,
      loudSeconds: 0,
      quietSeconds: 0,
      floorDb: 0,
      calibrationOffset,
      calibrated,
    };
  }

  return {
    // Energy average, not arithmetic — decibels are logarithmic.
    avgDb: energyAverageDb(dbs),
    peakDb: peaks.length > 0 ? Math.max(...peaks) : Math.max(...dbs),
    minDb: Math.min(...dbs),
    p50Db: percentile(dbs, 0.5),
    p90Db: percentile(dbs, 0.9),
    p95Db: percentile(dbs, 0.95),
    loudSeconds: dbs.filter((db) => db >= AUDIO.loudThresholdDb).length,
    quietSeconds: dbs.filter((db) => db < AUDIO.quietThresholdDb).length,
    floorDb: percentile(dbs, 0.1),
    calibrationOffset,
    calibrated,
  };
}

/**
 * Fold samples and events into the trip's final statistics.
 *
 * Runs once, at the end of a trip, over data already in memory. Everything the
 * report and the score need comes from here, so this is the one place where a
 * definition like "what counts as a silence" is decided.
 */
export function computeTripStats(input: AnalyticsInput): TripStats {
  const { samples, events, durationMs } = input;

  // Suspended windows are excluded from every rate, so a phone in a pocket
  // does not read as twenty peaceful minutes.
  const gapMs = events.filter(isGap).reduce((acc, e) => acc + e.durationMs, 0);
  const activeMs = Math.max(0, durationMs - gapMs);

  let distanceM = 0;
  let movingMs = 0;
  let stoppedMs = 0;
  let maxSpeed = 0;
  let speedSum = 0;
  let speedCount = 0;

  for (let i = 0; i < samples.length; i++) {
    const cur = samples[i]!;
    const prev = i > 0 ? samples[i - 1]! : null;
    const deltaMs = prev ? cur.t - prev.t : 0;

    if (cur.mov === 1) movingMs += deltaMs;
    else stoppedMs += deltaMs;

    if (cur.spd !== null) {
      if (cur.spd > maxSpeed) maxSpeed = cur.spd;
      if (cur.mov === 1) {
        speedSum += cur.spd;
        speedCount += 1;
      }
      distanceM += cur.spd * (deltaMs / 1000);
    }
  }

  const soundCounts: Record<SoundEventType, number> = {
    horn: 0,
    siren: 0,
    whistle: 0,
    unknown: 0,
  };
  let hornBlasts = 0;
  const hornTimes: number[] = [];

  for (const event of events) {
    if (!isSound(event)) continue;
    soundCounts[event.sound] += 1;
    if (event.sound === 'horn') {
      hornBlasts += event.blasts;
      hornTimes.push(event.t);
    }
  }

  hornTimes.sort((a, b) => a - b);

  // The longest stretch with no horn — including the run-up to the first and
  // the run-out after the last, both of which are genuinely peaceful.
  let longestSilenceMs = 0;
  let longestSilenceAt: number | null = null;
  let previous = 0;
  for (const t of hornTimes) {
    const gap = t - previous;
    if (gap > longestSilenceMs) {
      longestSilenceMs = gap;
      longestSilenceAt = previous;
    }
    previous = t;
  }
  const tail = durationMs - previous;
  if (tail > longestSilenceMs) {
    longestSilenceMs = tail;
    longestSilenceAt = previous;
  }

  const avgSecondsBetweenHorns =
    hornTimes.length >= 2
      ? (hornTimes[hornTimes.length - 1]! - hornTimes[0]!) / 1000 / (hornTimes.length - 1)
      : null;

  const brakes = events.filter(isBrake);
  const accels = events.filter(isAccel);
  const jerks = samples.map((s) => s.jerk).filter((j) => j > 0);

  const km = distanceM / 1000;
  const activeMin = Math.max(activeMs / MINUTE, 1 / 60);

  const coverage: SensorCoverage = {
    gps: input.coverage.gps,
    audio: input.coverage.audio,
    motion: input.coverage.motion,
    available: input.sensorsUsed,
    denied: (['gps', 'audio', 'motion'] as SensorKind[]).filter(
      (k) => !input.sensorsUsed.includes(k),
    ),
  };

  return {
    durationMs,
    activeMs,
    distanceM,
    movingMs,
    stoppedMs,
    stoppedRatio: safeDiv(stoppedMs, movingMs + stoppedMs),
    stopCount: events.filter(isStop).length,
    avgSpeed: speedCount > 0 ? speedSum / speedCount : 0,
    maxSpeed,

    soundCounts,
    hornBlasts,
    hornsPerMin: safeDiv(soundCounts.horn, activeMin),
    hornsPerKm: km > 0 ? safeDiv(soundCounts.horn, km) : 0,
    avgSecondsBetweenHorns,
    longestSilenceMs,
    longestSilenceAt,
    firstHornAt: hornTimes[0] ?? null,
    lastHornAt: hornTimes[hornTimes.length - 1] ?? null,

    noise: noiseStatsFrom(
      samples,
      input.calibrationOffset ?? AUDIO.defaultCalibrationOffset,
      input.calibrated ?? false,
    ),

    hardBrakes: brakes.length,
    severeBrakes: brakes.filter((b) => b.severity === 'severe').length,
    brakesPerKm: km > 0 ? safeDiv(brakes.length, km) : 0,
    rapidAccels: accels.length,
    aggressiveAccels: accels.filter((a) => a.severity === 'aggressive').length,
    accelsPerKm: km > 0 ? safeDiv(accels.length, km) : 0,
    jerkRms: rms(jerks),
    jerkP95: percentile(jerks, 0.95),

    segments: buildSegments(samples, events, durationMs, 3),
    quintiles: buildSegments(samples, events, durationMs, 5),
    coverage,
  };
}

/**
 * Group horn detections that land within `windowMs` of each other.
 *
 * A driver leaning on the horn three times in quick succession is one angry
 * driver, not three events. The raw count survives as `blasts` so nothing is
 * lost.
 */
export function groupHornBlasts(events: TripEvent[], windowMs = 400): TripEvent[] {
  const out: TripEvent[] = [];
  let lastHornIndex = -1;
  // Compared against the most recent *blast*, not the start of the group — a
  // continuous run of taps must stay one event however long the run gets.
  let lastHornT = -Infinity;

  for (const event of events) {
    if (!isHorn(event)) {
      out.push(event);
      continue;
    }

    const previous = lastHornIndex >= 0 ? out[lastHornIndex] : null;
    if (previous && isHorn(previous) && event.t - lastHornT <= windowMs) {
      out[lastHornIndex] = {
        ...previous,
        blasts: previous.blasts + 1,
        durationMs: event.t + event.durationMs - previous.t,
        db: Math.max(previous.db, event.db),
        confidence: Math.max(previous.confidence, event.confidence),
      };
      lastHornT = event.t;
      continue;
    }

    out.push(event);
    lastHornIndex = out.length - 1;
    lastHornT = event.t;
  }

  return out;
}
