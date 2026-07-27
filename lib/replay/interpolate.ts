import type { TripSample } from '@/lib/domain/samples';
import type { TripEvent, SoundEventType } from '@/lib/domain/events';
import { isAccel, isBrake, isSound } from '@/lib/domain/events';
import { bearing, interpolatePoint, type LatLon } from '@/lib/geo/haversine';

/**
 * Everything the replay needs to know at a given playhead time.
 *
 * Pure functions over the recorded track, so the map, the stat readout and the
 * timeline highlight all derive from one source and stay in sync by construction
 * rather than by careful wiring.
 */
export interface ReplayFrame {
  position: LatLon | null;
  heading: number;
  /** Route drawn up to now, for the progressive polyline. */
  traveled: [number, number][];
  stats: ReplayStatsSnapshot;
  /** Index into the *timeline* (gaps excluded) of the most recent event. */
  activeEventIndex: number;
}

export interface ReplayStatsSnapshot {
  distanceM: number;
  hornCount: number;
  hardBrakes: number;
  rapidAccels: number;
  currentDb: number;
  soundCounts: Record<SoundEventType, number>;
}

/** Binary search for the last sample at or before `tMs`. */
function sampleIndexAt(samples: readonly TripSample[], tMs: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t <= tMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function locatedPosition(
  samples: readonly TripSample[],
  index: number,
  tMs: number,
): { position: LatLon | null; heading: number } {
  const cur = samples[index];
  if (!cur || cur.lat === null || cur.lon === null) return { position: null, heading: 0 };

  const next = samples[index + 1];
  if (next && next.lat !== null && next.lon !== null) {
    const span = next.t - cur.t;
    const t = span > 0 ? (tMs - cur.t) / span : 0;
    const a = { lat: cur.lat, lon: cur.lon };
    const b = { lat: next.lat, lon: next.lon };
    return { position: interpolatePoint(a, b, Math.max(0, Math.min(1, t))), heading: bearing(a, b) };
  }

  return { position: { lat: cur.lat, lon: cur.lon }, heading: cur.hdg ?? 0 };
}

const TIMELINE_VISIBLE = (e: TripEvent): boolean => e.type !== 'gap';

export function replayFrameAt(
  samples: readonly TripSample[],
  events: readonly TripEvent[],
  timelineEvents: readonly TripEvent[],
  tMs: number,
): ReplayFrame {
  if (samples.length === 0) {
    return {
      position: null,
      heading: 0,
      traveled: [],
      stats: {
        distanceM: 0,
        hornCount: 0,
        hardBrakes: 0,
        rapidAccels: 0,
        currentDb: 0,
        soundCounts: { horn: 0, siren: 0, whistle: 0, unknown: 0 },
      },
      activeEventIndex: -1,
    };
  }

  const index = sampleIndexAt(samples, tMs);
  const { position, heading } = locatedPosition(samples, index, tMs);

  // Progressive route: every located sample up to the playhead, plus the
  // interpolated cursor so the line reaches the marker.
  const traveled: [number, number][] = [];
  let distanceM = 0;
  let currentDb = 0;
  for (let i = 0; i <= index; i++) {
    const s = samples[i]!;
    if (s.lat !== null && s.lon !== null) traveled.push([s.lat, s.lon]);
    if (i > 0 && s.spd !== null) distanceM += s.spd * ((s.t - samples[i - 1]!.t) / 1000);
    if (s.db > 0) currentDb = s.db;
  }
  if (position) traveled.push([position.lat, position.lon]);

  const soundCounts: Record<SoundEventType, number> = { horn: 0, siren: 0, whistle: 0, unknown: 0 };
  let hardBrakes = 0;
  let rapidAccels = 0;
  for (const event of events) {
    if (event.t > tMs) continue;
    if (isSound(event)) soundCounts[event.sound] += 1;
    else if (isBrake(event)) hardBrakes += 1;
    else if (isAccel(event)) rapidAccels += 1;
  }

  // Most recent timeline event at or before the playhead.
  let activeEventIndex = -1;
  const visible = timelineEvents.filter(TIMELINE_VISIBLE);
  for (let i = 0; i < visible.length; i++) {
    if (visible[i]!.t <= tMs) activeEventIndex = i;
    else break;
  }

  return {
    position,
    heading,
    traveled,
    stats: {
      distanceM,
      hornCount: soundCounts.horn,
      hardBrakes,
      rapidAccels,
      currentDb,
      soundCounts,
    },
    activeEventIndex,
  };
}
