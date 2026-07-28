import type { RoadSegmentContribution } from '@/lib/domain/sync';
import { decodeGeohash, decodeGeohashBounds } from '@/lib/sync/geohash';
import { energyAverageDb, clamp01, safeDiv } from '@/lib/utils/math';
import { bandFor } from '@/lib/score/labels';
import type {
  AreaRanking,
  CommunitySnapshot,
  HeatCell,
  HeatmapMetric,
  RoadScore,
} from './types';

/**
 * Fold anonymous contributions into heatmap cells, road scores and area
 * rankings.
 *
 * The same cell is contributed to many times — by the same driver on different
 * days, and eventually by different drivers — so folding is a weighted average
 * by `sampleCount`, not a plain mean. A cell built from 400 seconds of driving
 * should not be outvoted by one built from 4.
 */

/** Cells with too little behind them are noise, not signal. */
const MIN_CONTRIBUTIONS_FOR_RANKING = 2;
const MIN_SAMPLES_FOR_RANKING = 20;
/** Below this the whole snapshot is flagged sparse rather than presented as fact. */
const SPARSE_THRESHOLD = 12;

interface CellAccumulator {
  geohash: string;
  contributions: number;
  sampleCount: number;
  dbWeighted: number[];
  p90Max: number;
  hornCount: number;
  hardBrakeCount: number;
  speedWeighted: number;
  stoppedWeighted: number;
  chaosWeighted: number;
}

export function foldContributions(cells: readonly RoadSegmentContribution[]): Map<string, CellAccumulator> {
  const byCell = new Map<string, CellAccumulator>();

  for (const cell of cells) {
    let acc = byCell.get(cell.geohash);
    if (!acc) {
      acc = {
        geohash: cell.geohash,
        contributions: 0,
        sampleCount: 0,
        dbWeighted: [],
        p90Max: 0,
        hornCount: 0,
        hardBrakeCount: 0,
        speedWeighted: 0,
        stoppedWeighted: 0,
        chaosWeighted: 0,
      };
      byCell.set(cell.geohash, acc);
    }

    acc.contributions += 1;
    acc.sampleCount += cell.sampleCount;
    // Repeat the level once per second of driving so the energy average is
    // weighted by exposure rather than by number of visits.
    for (let i = 0; i < Math.min(cell.sampleCount, 600); i++) acc.dbWeighted.push(cell.avgDb);
    acc.p90Max = Math.max(acc.p90Max, cell.p90Db);
    acc.hornCount += cell.hornCount;
    acc.hardBrakeCount += cell.hardBrakeCount;
    acc.speedWeighted += cell.avgSpeed * cell.sampleCount;
    acc.stoppedWeighted += cell.stoppedRatio * cell.sampleCount;
    acc.chaosWeighted += cell.chaosIndex * cell.sampleCount;
  }

  return byCell;
}

function intensityFor(metric: HeatmapMetric, acc: CellAccumulator, avgDb: number): number {
  const perMinute = (count: number) => safeDiv(count, Math.max(1, acc.sampleCount / 60));

  switch (metric) {
    case 'noise':
      // 55 dB is background, 90 dB is the top of the scale.
      return clamp01((avgDb - 55) / 35);
    case 'brakes':
      return clamp01(perMinute(acc.hardBrakeCount) / 2);
    case 'horns':
      return clamp01(perMinute(acc.hornCount) / 4);
    case 'chaos':
      return clamp01(safeDiv(acc.chaosWeighted, acc.sampleCount) / 100);
  }
}

export function buildHeatCells(
  contributions: readonly RoadSegmentContribution[],
  metric: HeatmapMetric,
): HeatCell[] {
  const folded = foldContributions(contributions);
  const cells: HeatCell[] = [];

  for (const acc of folded.values()) {
    const { lat, lon } = decodeGeohash(acc.geohash);
    const b = decodeGeohashBounds(acc.geohash);
    const avgDb = acc.dbWeighted.length > 0 ? energyAverageDb(acc.dbWeighted) : 0;

    cells.push({
      geohash: acc.geohash,
      lat,
      lon,
      bounds: [
        [b.latMin, b.lonMin],
        [b.latMax, b.lonMax],
      ],
      contributions: acc.contributions,
      sampleCount: acc.sampleCount,
      avgDb,
      p90Db: acc.p90Max,
      hornCount: acc.hornCount,
      hardBrakeCount: acc.hardBrakeCount,
      avgSpeed: safeDiv(acc.speedWeighted, acc.sampleCount),
      stoppedRatio: safeDiv(acc.stoppedWeighted, acc.sampleCount),
      chaosIndex: safeDiv(acc.chaosWeighted, acc.sampleCount),
      intensity: intensityFor(metric, acc, avgDb),
    });
  }

  return cells.sort((a, b) => b.intensity - a.intensity);
}

/**
 * Per-cell road scores, oriented like the Road360 Score: higher is calmer.
 *
 * Only cells with enough behind them are scored. Publishing a "noisiest road"
 * derived from one seven-second pass would be worse than publishing nothing.
 */
export function buildRoadScores(contributions: readonly RoadSegmentContribution[]): RoadScore[] {
  const folded = foldContributions(contributions);
  const scores: RoadScore[] = [];

  for (const acc of folded.values()) {
    if (acc.contributions < MIN_CONTRIBUTIONS_FOR_RANKING) continue;
    if (acc.sampleCount < MIN_SAMPLES_FOR_RANKING) continue;

    const { lat, lon } = decodeGeohash(acc.geohash);
    const avgDb = acc.dbWeighted.length > 0 ? energyAverageDb(acc.dbWeighted) : 0;
    const chaos = safeDiv(acc.chaosWeighted, acc.sampleCount);
    const score = Math.round(Math.max(0, Math.min(100, 100 - chaos)));

    scores.push({
      geohash: acc.geohash,
      lat,
      lon,
      score,
      label: bandFor(score).label,
      contributions: acc.contributions,
      avgDb,
      hornCount: acc.hornCount,
      hardBrakeCount: acc.hardBrakeCount,
    });
  }

  return scores;
}

/**
 * Roll cells up to precision-5 geohashes (~5 km) as a stand-in for districts.
 *
 * Without a geocoder there are no place names, so areas are identified by
 * coordinates. Naming them would need a reverse-geocoding service, and
 * inventing labels would be worse than showing none.
 */
export function buildAreaRankings(contributions: readonly RoadSegmentContribution[]): AreaRanking[] {
  const byArea = new Map<string, { cells: Set<string>; contributions: number; dbs: number[]; chaos: number[]; horns: number }>();

  for (const cell of contributions) {
    const areaHash = cell.geohash.slice(0, 5);
    let area = byArea.get(areaHash);
    if (!area) {
      area = { cells: new Set(), contributions: 0, dbs: [], chaos: [], horns: 0 };
      byArea.set(areaHash, area);
    }
    area.cells.add(cell.geohash);
    area.contributions += 1;
    area.dbs.push(cell.avgDb);
    area.chaos.push(cell.chaosIndex);
    area.horns += cell.hornCount;
  }

  const rankings: AreaRanking[] = [];
  for (const [geohash, area] of byArea) {
    const { lat, lon } = decodeGeohash(geohash);
    const avgChaos = area.chaos.reduce((a, b) => a + b, 0) / Math.max(1, area.chaos.length);
    rankings.push({
      geohash,
      lat,
      lon,
      cellCount: area.cells.size,
      contributions: area.contributions,
      avgDb: area.dbs.length > 0 ? energyAverageDb(area.dbs) : 0,
      avgChaos,
      score: Math.round(Math.max(0, Math.min(100, 100 - avgChaos))),
      totalHorns: area.horns,
    });
  }

  return rankings.sort((a, b) => b.score - a.score);
}

export function buildCommunitySnapshot(
  contributions: readonly RoadSegmentContribution[],
  metric: HeatmapMetric,
  source: 'local' | 'community',
): CommunitySnapshot {
  const cells = buildHeatCells(contributions, metric);
  const scores = buildRoadScores(contributions);
  const byScore = [...scores].sort((a, b) => b.score - a.score);

  return {
    cells,
    quietest: byScore.slice(0, 5),
    noisiest: [...byScore].reverse().slice(0, 5),
    areas: buildAreaRankings(contributions),
    totalContributions: contributions.length,
    sparse: contributions.length < SPARSE_THRESHOLD,
    source,
  };
}

/** Green → red ramp for heat cells. Hex, matching the rest of the app. */
export const HEAT_COLORS = ['#34D9A0', '#7F8A9E', '#D0A35C', '#C8814F', '#CD6D6D'] as const;

export function heatColor(intensity: number): string {
  const index = Math.min(HEAT_COLORS.length - 1, Math.floor(clamp01(intensity) * HEAT_COLORS.length));
  return HEAT_COLORS[index]!;
}
