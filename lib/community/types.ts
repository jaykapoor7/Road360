import type { RoadSegmentContribution } from '@/lib/domain/sync';

/**
 * Community aggregation types.
 *
 * The unit of community data is a ~150 m geohash cell for an hour-of-week
 * bucket — never a trip, never a person. Everything here folds those cells;
 * nothing can reach back to an individual drive, because the identifiers were
 * discarded before the cells were ever created.
 */

export type HeatmapMetric = 'noise' | 'brakes' | 'horns' | 'chaos';

export interface HeatCell {
  geohash: string;
  lat: number;
  lon: number;
  /** Bounds of the cell, for rendering it as a rectangle. */
  bounds: [[number, number], [number, number]];
  /** How many contributions were folded in — the confidence in this cell. */
  contributions: number;
  sampleCount: number;
  avgDb: number;
  p90Db: number;
  hornCount: number;
  hardBrakeCount: number;
  avgSpeed: number;
  stoppedRatio: number;
  chaosIndex: number;
  /** 0..1 for the selected metric, for colouring. */
  intensity: number;
}

export interface RoadScore {
  geohash: string;
  lat: number;
  lon: number;
  /** 0–100, higher is calmer — same orientation as the Road360 Score. */
  score: number;
  label: string;
  contributions: number;
  avgDb: number;
  hornCount: number;
  hardBrakeCount: number;
}

export interface AreaRanking {
  /** Coarser geohash (precision 5, ~5 km) standing in for a district. */
  geohash: string;
  lat: number;
  lon: number;
  cellCount: number;
  contributions: number;
  avgDb: number;
  avgChaos: number;
  score: number;
  totalHorns: number;
}

export interface CommunitySnapshot {
  cells: HeatCell[];
  quietest: RoadScore[];
  noisiest: RoadScore[];
  areas: AreaRanking[];
  totalContributions: number;
  /** True when there is too little data to draw conclusions from. */
  sparse: boolean;
  /** Where the data came from — local-only until sync is switched on. */
  source: 'local' | 'community';
}

export interface CommunitySource {
  readonly id: 'local' | 'community';
  fetchContributions(): Promise<RoadSegmentContribution[]>;
}
