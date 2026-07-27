import type { TripSample } from '@/lib/domain/samples';
import type { TripEvent } from '@/lib/domain/events';
import { isBrake, isHorn } from '@/lib/domain/events';
import type { RoadSegmentContribution } from '@/lib/domain/sync';
import { SCHEMA_VERSION, type Millis } from '@/lib/domain/schema';
import { APP_VERSION, PRIVACY } from '@/lib/config/constants';
import { encodeGeohash } from './geohash';
import { haversine } from '@/lib/geo/haversine';
import { energyAverageDb, percentile, safeDiv } from '@/lib/utils/math';
import { hourOfWeek } from '@/lib/utils/time';

/**
 * Turn a trip into anonymous per-cell contributions.
 *
 * A GPS trace is among the most identifying data a phone can produce, so this
 * is deliberately lossy in specific ways:
 *
 *  - the first and last 250 m are dropped, so a trace never reveals where
 *    someone lives or works even at cell resolution;
 *  - positions collapse to ~150 m geohash cells;
 *  - absolute timestamps collapse to an hour-of-week bucket;
 *  - cells with fewer than three samples are discarded, so a single passer-by
 *    on a quiet road cannot be isolated;
 *  - no device id, trip id or sequence survives.
 *
 * This runs only when the user has opted in.
 */
export interface AnonymizeInput {
  samples: readonly TripSample[];
  events: readonly TripEvent[];
  startedAt: Millis;
}

interface CellAccumulator {
  geohash: string;
  hourOfWeek: number;
  dbs: number[];
  speeds: number[];
  stoppedSeconds: number;
  hornCount: number;
  hardBrakeCount: number;
}

/** Drop the leading and trailing `trimMetres` of the trace by path distance. */
export function trimEndpoints(
  samples: readonly TripSample[],
  trimM: number = PRIVACY.trimMetres,
): TripSample[] {
  const located = samples.filter((s) => s.lat !== null && s.lon !== null);
  if (located.length < 3) return [];

  const cumulative: number[] = [0];
  for (let i = 1; i < located.length; i++) {
    const prev = located[i - 1]!;
    const cur = located[i]!;
    const step = haversine(
      { lat: prev.lat!, lon: prev.lon! },
      { lat: cur.lat!, lon: cur.lon! },
    );
    cumulative.push(cumulative[i - 1]! + step);
  }

  const totalM = cumulative[cumulative.length - 1]!;
  // A trip shorter than both trims would be entirely removed anyway; returning
  // nothing is the correct, conservative answer.
  if (totalM <= trimM * 2) return [];

  return located.filter((_, i) => {
    const d = cumulative[i]!;
    return d >= trimM && d <= totalM - trimM;
  });
}

export function anonymizeTrip(input: AnonymizeInput): RoadSegmentContribution[] {
  const kept = trimEndpoints(input.samples);
  if (kept.length === 0) return [];

  const keptWindow = { from: kept[0]!.t, to: kept[kept.length - 1]!.t };
  const cells = new Map<string, CellAccumulator>();

  const cellKeyFor = (lat: number, lon: number, t: number) => {
    const gh = encodeGeohash(lat, lon, PRIVACY.contributionGeohashPrecision);
    const how = hourOfWeek(input.startedAt + t);
    return { key: `${gh}:${how}`, gh, how };
  };

  for (const sample of kept) {
    if (sample.lat === null || sample.lon === null) continue;
    const { key, gh, how } = cellKeyFor(sample.lat, sample.lon, sample.t);

    let cell = cells.get(key);
    if (!cell) {
      cell = {
        geohash: gh,
        hourOfWeek: how,
        dbs: [],
        speeds: [],
        stoppedSeconds: 0,
        hornCount: 0,
        hardBrakeCount: 0,
      };
      cells.set(key, cell);
    }

    cell.dbs.push(sample.db);
    if (sample.spd !== null) cell.speeds.push(sample.spd);
    if (sample.mov === 0) cell.stoppedSeconds += 1;
  }

  // Attribute events to their cell, ignoring any that fall inside a trimmed end.
  for (const event of input.events) {
    if (event.lat === null || event.lon === null) continue;
    if (event.t < keptWindow.from || event.t > keptWindow.to) continue;

    const { key } = cellKeyFor(event.lat, event.lon, event.t);
    const cell = cells.get(key);
    if (!cell) continue;

    if (isHorn(event)) cell.hornCount += 1;
    else if (isBrake(event)) cell.hardBrakeCount += 1;
  }

  const out: RoadSegmentContribution[] = [];

  for (const cell of cells.values()) {
    if (cell.dbs.length < PRIVACY.minCellSamples) continue;

    const avgDb = energyAverageDb(cell.dbs);
    const stoppedRatio = safeDiv(cell.stoppedSeconds, cell.dbs.length);
    const avgSpeed = cell.speeds.length > 0 ? cell.speeds.reduce((a, b) => a + b, 0) / cell.speeds.length : 0;

    // A coarse, self-contained chaos measure so the server can rank roads
    // without needing to re-run the full scoring engine.
    const noiseTerm = Math.min(1, Math.max(0, (avgDb - 55) / 35)) * 45;
    const hornTerm = Math.min(1, safeDiv(cell.hornCount, cell.dbs.length / 60)) * 30;
    const brakeTerm = Math.min(1, safeDiv(cell.hardBrakeCount, cell.dbs.length / 60)) * 15;
    const stopTerm = stoppedRatio * 10;

    out.push({
      geohash: cell.geohash,
      hourOfWeek: cell.hourOfWeek,
      sampleCount: cell.dbs.length,
      avgDb: Math.round(avgDb * 10) / 10,
      p90Db: Math.round(percentile(cell.dbs, 0.9) * 10) / 10,
      hornCount: cell.hornCount,
      hardBrakeCount: cell.hardBrakeCount,
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      stoppedRatio: Math.round(stoppedRatio * 100) / 100,
      chaosIndex: Math.round(Math.min(100, noiseTerm + hornTerm + brakeTerm + stopTerm)),
      schemaVersion: SCHEMA_VERSION,
      clientVersion: APP_VERSION,
    });
  }

  return out;
}
