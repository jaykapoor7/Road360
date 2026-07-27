import type { TripEvent } from '@/lib/domain/events';
import { isAccel, isBrake, isHorn } from '@/lib/domain/events';
import type { TripSample } from '@/lib/domain/samples';
import type { SegmentStats } from '@/lib/domain/stats';
import { energyAverageDb } from '@/lib/utils/math';

const THIRD_LABELS = ['first', 'middle', 'final'] as const;
const FIFTH_LABELS = ['opening', 'early', 'middle', 'late', 'closing'] as const;

/** Split a trip into `count` equal time slices and summarise each. */
export function buildSegments(
  samples: readonly TripSample[],
  events: readonly TripEvent[],
  durationMs: number,
  count: number,
): SegmentStats[] {
  if (durationMs <= 0 || count <= 0) return [];

  const labels = count === 3 ? THIRD_LABELS : count === 5 ? FIFTH_LABELS : null;
  const span = durationMs / count;
  const segments: SegmentStats[] = [];

  for (let i = 0; i < count; i++) {
    const from = i * span;
    const to = i === count - 1 ? durationMs : (i + 1) * span;

    const inRange = samples.filter((s) => s.t >= from && s.t < to);
    const dbs = inRange.map((s) => s.db).filter((db) => db > 0);
    const eventsInRange = events.filter((e) => e.t >= from && e.t < to);

    let distanceM = 0;
    let stoppedMs = 0;
    let speedSum = 0;
    let speedCount = 0;

    for (let j = 1; j < inRange.length; j++) {
      const prev = inRange[j - 1]!;
      const cur = inRange[j]!;
      if (cur.spd !== null) {
        speedSum += cur.spd;
        speedCount += 1;
        distanceM += cur.spd * ((cur.t - prev.t) / 1000);
      }
      if (cur.mov === 0) stoppedMs += cur.t - prev.t;
    }

    segments.push({
      index: i,
      label: labels?.[i] ?? String(i),
      from,
      to,
      horns: eventsInRange.filter(isHorn).length,
      hardBrakes: eventsInRange.filter(isBrake).length,
      rapidAccels: eventsInRange.filter(isAccel).length,
      avgDb: dbs.length > 0 ? energyAverageDb(dbs) : 0,
      peakDb: dbs.length > 0 ? Math.max(...dbs) : 0,
      distanceM,
      stoppedMs,
      avgSpeed: speedCount > 0 ? speedSum / speedCount : 0,
    });
  }

  return segments;
}

export interface Concentration {
  segment: SegmentStats;
  count: number;
  total: number;
  share: number;
}

/**
 * Find a genuine concentration of events in one segment.
 *
 * The thresholds are the point of this function. Claiming "most hard braking
 * happened at the end" on the strength of 2 events out of 3 is the kind of
 * confident nonsense that makes an app feel fake, so a concentration is only
 * reported when one segment holds at least `minShare` of a total of at least
 * `minTotal`. Otherwise it returns null and the insight simply does not fire.
 */
export function findConcentration(
  segments: readonly SegmentStats[],
  pick: (s: SegmentStats) => number,
  minTotal = 4,
  minShare = 0.45,
): Concentration | null {
  if (segments.length === 0) return null;

  let total = 0;
  let best: SegmentStats | null = null;
  let bestCount = 0;

  for (const segment of segments) {
    const value = pick(segment);
    total += value;
    if (value > bestCount) {
      bestCount = value;
      best = segment;
    }
  }

  if (!best || total < minTotal) return null;
  const share = bestCount / total;
  if (share < minShare) return null;

  return { segment: best, count: bestCount, total, share };
}

/** Human phrasing for a segment position. */
export function segmentPhrase(label: string): string {
  switch (label) {
    case 'first':
      return 'in the first few minutes';
    case 'middle':
      return 'right around the halfway point';
    case 'final':
      return 'in the final third';
    case 'opening':
      return 'as you set off';
    case 'early':
      return 'early on';
    case 'late':
      return 'toward the end';
    case 'closing':
      return 'in the last stretch';
    default:
      return 'partway through';
  }
}
