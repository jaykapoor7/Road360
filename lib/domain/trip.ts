import type { Millis, SyncMeta, TripId } from './schema';
import type { Road360Score, ScoreBand } from './score';
import type { TripStats } from './stats';
import type { TripSummary } from './summary';
import type { SensorKind } from './sensors';

export type TripStatus = 'recording' | 'paused' | 'completed' | 'abandoned';

export interface RouteSummary {
  /** Douglas–Peucker simplified, ε = 12 m. For list previews and report maps. */
  simplified: [number, number][];
  bounds: [[number, number], [number, number]] | null;
  /** Geohash-5 (~5 km) — coarse enough to group trips by area without pinpointing a home. */
  startGeohash: string | null;
  endGeohash: string | null;
}

export interface TripRecord extends SyncMeta {
  id: TripId;
  status: TripStatus;
  startedAt: Millis;
  endedAt: Millis | null;
  /** Local UTC offset at start, so day/week/month bucketing survives travel and DST. */
  tzOffsetMin: number;
  dayKey: string; // YYYY-MM-DD, local
  weekKey: string; // YYYY-Www, ISO local
  monthKey: string; // YYYY-MM, local
  title: string | null;

  sampleCount: number;
  chunkCount: number;
  eventCount: number;

  /** Null while recording. */
  stats: TripStats | null;
  score: Road360Score | null;
  summary: TripSummary | null;
  achievementsUnlocked: string[];

  route: RouteSummary;
  sensorsUsed: SensorKind[];
  /** Demo trips are flagged and excluded from lifetime stats by default. */
  simulated: boolean;

  app: { version: string; detectorId: string; scoreVersion: string };
}

/**
 * Projection for list screens. History renders from these and never loads
 * samples, which is what keeps the screen instant with hundreds of trips.
 */
export interface TripListItem {
  id: TripId;
  startedAt: Millis;
  durationMs: number;
  distanceM: number;
  scoreValue: number;
  band: ScoreBand;
  hornCount: number;
  avgDb: number;
  title: string | null;
  dayKey: string;
  weekKey: string;
  simulated: boolean;
}

export function toListItem(trip: TripRecord): TripListItem {
  return {
    id: trip.id,
    startedAt: trip.startedAt,
    durationMs: trip.stats?.durationMs ?? 0,
    distanceM: trip.stats?.distanceM ?? 0,
    scoreValue: trip.score?.value ?? 0,
    band: trip.score?.band ?? 'normal',
    hornCount: trip.stats?.soundCounts.horn ?? 0,
    avgDb: trip.stats?.noise.avgDb ?? 0,
    title: trip.title,
    dayKey: trip.dayKey,
    weekKey: trip.weekKey,
    simulated: trip.simulated,
  };
}
