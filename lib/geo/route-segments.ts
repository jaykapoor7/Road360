import type { TripSample } from '@/lib/domain/samples';
import type { TripEvent } from '@/lib/domain/events';
import { isBrake, isHorn } from '@/lib/domain/events';
import { clamp01 } from '@/lib/utils/math';

/**
 * Colour the route by how chaotic each stretch was.
 *
 * A per-sample "chaos" value blends noise above ambient with proximity to horns
 * and hard brakes, then contiguous samples of the same intensity bucket are
 * emitted as one run. Rendering one polyline per run (rather than per segment)
 * keeps the vertex count low, and a one-point overlap between runs means no
 * visible gaps where the colour changes.
 */

export interface IntensityRun {
  points: [number, number][];
  /** 0..4, low to high chaos. */
  level: number;
}

/** Five-stop ramp, green → red. Hex, so it also works inside share-card rasters. */
export const INTENSITY_COLORS = ['#22D3EE', '#34D399', '#FBBF24', '#FB923C', '#F43F5E'] as const;

const NEAR_EVENT_MS = 4000;

function chaosAt(sample: TripSample, events: readonly TripEvent[]): number {
  // Noise contribution: nothing below 60 dB, full by ~92 dB.
  const noise = clamp01((sample.db - 60) / 32);

  // Event proximity: a horn or hard brake within a few seconds lights the road.
  let eventBoost = 0;
  for (const event of events) {
    if (!isHorn(event) && !isBrake(event)) continue;
    const dt = Math.abs(event.t - sample.t);
    if (dt <= NEAR_EVENT_MS) {
      eventBoost = Math.max(eventBoost, 1 - dt / NEAR_EVENT_MS);
    }
  }

  // Stationary stretches are their own mild kind of stress.
  const stopped = sample.mov === 0 ? 0.2 : 0;

  return clamp01(0.5 * noise + 0.6 * eventBoost + stopped);
}

const levelFor = (chaos: number): number => Math.min(4, Math.floor(chaos * 5));

export function buildIntensityRuns(
  samples: readonly TripSample[],
  events: readonly TripEvent[],
): IntensityRun[] {
  const located = samples.filter((s) => s.lat !== null && s.lon !== null);
  if (located.length < 2) return [];

  const runs: IntensityRun[] = [];
  let current: IntensityRun | null = null;

  for (const sample of located) {
    const level = levelFor(chaosAt(sample, events));
    const point: [number, number] = [sample.lat!, sample.lon!];

    if (!current || current.level !== level) {
      // Overlap one vertex so adjacent runs meet with no gap.
      if (current) current.points.push(point);
      current = { points: [point], level };
      runs.push(current);
    } else {
      current.points.push(point);
    }
  }

  return runs;
}

export interface EventMarker {
  lat: number;
  lon: number;
  kind: 'horn' | 'brake';
  t: number;
}

/** Positioned horn and hard-brake markers for the report map. */
export function buildEventMarkers(events: readonly TripEvent[]): EventMarker[] {
  const markers: EventMarker[] = [];
  for (const event of events) {
    if (event.lat === null || event.lon === null) continue;
    if (isHorn(event)) markers.push({ lat: event.lat, lon: event.lon, kind: 'horn', t: event.t });
    else if (isBrake(event))
      markers.push({ lat: event.lat, lon: event.lon, kind: 'brake', t: event.t });
  }
  return markers;
}
