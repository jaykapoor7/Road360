import { describe, expect, it } from 'vitest';
import {
  buildCommunitySnapshot,
  buildHeatCells,
  buildRoadScores,
  buildAreaRankings,
  foldContributions,
  heatColor,
} from '@/lib/community/aggregate';
import { encodeGeohash } from '@/lib/sync/geohash';
import { SCHEMA_VERSION } from '@/lib/domain/schema';
import type { RoadSegmentContribution } from '@/lib/domain/sync';

function cell(overrides: Partial<RoadSegmentContribution> = {}): RoadSegmentContribution {
  return {
    geohash: encodeGeohash(51.5074, -0.1278, 7),
    hourOfWeek: 34,
    sampleCount: 60,
    avgDb: 70,
    p90Db: 80,
    hornCount: 2,
    hardBrakeCount: 1,
    avgSpeed: 8,
    stoppedRatio: 0.2,
    chaosIndex: 45,
    schemaVersion: SCHEMA_VERSION,
    clientVersion: '0.1.0',
    ...overrides,
  };
}

describe('folding contributions', () => {
  it('merges repeat visits to the same cell', () => {
    const folded = foldContributions([cell(), cell(), cell()]);
    expect(folded.size).toBe(1);

    const acc = [...folded.values()][0]!;
    expect(acc.contributions).toBe(3);
    expect(acc.sampleCount).toBe(180);
    expect(acc.hornCount).toBe(6);
  });

  it('keeps distinct cells apart', () => {
    const folded = foldContributions([
      cell({ geohash: encodeGeohash(51.5074, -0.1278, 7) }),
      cell({ geohash: encodeGeohash(48.8566, 2.3522, 7) }),
    ]);
    expect(folded.size).toBe(2);
  });

  it('weights the level average by exposure, not by visit count', () => {
    // One long quiet pass should outweigh one brief loud one.
    const cells = buildHeatCells(
      [
        cell({ avgDb: 60, sampleCount: 300 }),
        cell({ avgDb: 85, sampleCount: 10 }),
      ],
      'noise',
    );
    // A plain mean would give ~72.5; exposure weighting pulls it toward 60.
    expect(cells[0]!.avgDb).toBeLessThan(72);
  });
});

describe('heat cells', () => {
  it('gives every cell renderable bounds', () => {
    const cells = buildHeatCells([cell()], 'noise');
    expect(cells).toHaveLength(1);

    const [[latMin, lonMin], [latMax, lonMax]] = cells[0]!.bounds;
    expect(latMax).toBeGreaterThan(latMin);
    expect(lonMax).toBeGreaterThan(lonMin);
    // A precision-7 cell is roughly 150 m on a side.
    expect((latMax - latMin) * 111_000).toBeLessThan(300);
  });

  it('scales intensity with the selected metric', () => {
    const quiet = buildHeatCells([cell({ avgDb: 56 })], 'noise')[0]!;
    const loud = buildHeatCells([cell({ avgDb: 89 })], 'noise')[0]!;
    expect(loud.intensity).toBeGreaterThan(quiet.intensity);
  });

  it('responds to the metric being changed', () => {
    // Loud but no braking: hot on noise, cold on braking.
    const input = [cell({ avgDb: 88, hardBrakeCount: 0, hornCount: 0 })];
    expect(buildHeatCells(input, 'noise')[0]!.intensity).toBeGreaterThan(0.5);
    expect(buildHeatCells(input, 'brakes')[0]!.intensity).toBe(0);
  });

  it('clamps intensity to 0..1 even for absurd input', () => {
    const cells = buildHeatCells([cell({ avgDb: 200, hornCount: 9999 })], 'horns');
    expect(cells[0]!.intensity).toBeLessThanOrEqual(1);
    expect(cells[0]!.intensity).toBeGreaterThanOrEqual(0);
  });

  it('sorts hottest first', () => {
    const cells = buildHeatCells(
      [
        cell({ geohash: encodeGeohash(51.50, -0.12, 7), avgDb: 60 }),
        cell({ geohash: encodeGeohash(51.52, -0.10, 7), avgDb: 88 }),
      ],
      'noise',
    );
    expect(cells[0]!.intensity).toBeGreaterThan(cells[1]!.intensity);
  });

  it('maps intensity onto the colour ramp', () => {
    expect(heatColor(0)).not.toBe(heatColor(1));
    expect(heatColor(1)).toBe('#F43F5E');
  });
});

describe('road scores', () => {
  it('refuses to score a stretch seen only once', () => {
    // A "noisiest road" built from a single seven-second pass would be worse
    // than showing nothing.
    expect(buildRoadScores([cell()])).toHaveLength(0);
  });

  it('refuses to score a stretch with too few samples', () => {
    expect(buildRoadScores([cell({ sampleCount: 5 }), cell({ sampleCount: 5 })])).toHaveLength(0);
  });

  it('scores a stretch with enough passes behind it', () => {
    const scores = buildRoadScores([cell(), cell(), cell()]);
    expect(scores).toHaveLength(1);
    expect(scores[0]!.contributions).toBe(3);
    expect(scores[0]!.score).toBeGreaterThanOrEqual(0);
    expect(scores[0]!.score).toBeLessThanOrEqual(100);
  });

  it('orients the score like the Road360 Score — higher is calmer', () => {
    const calm = buildRoadScores([cell({ chaosIndex: 10 }), cell({ chaosIndex: 10 })])[0]!;
    const chaotic = buildRoadScores([cell({ chaosIndex: 90 }), cell({ chaosIndex: 90 })])[0]!;
    expect(calm.score).toBeGreaterThan(chaotic.score);
  });
});

describe('area rankings', () => {
  it('rolls cells up into coarser areas', () => {
    const london = [
      cell({ geohash: encodeGeohash(51.5074, -0.1278, 7) }),
      cell({ geohash: encodeGeohash(51.5080, -0.1280, 7) }),
    ];
    const paris = [cell({ geohash: encodeGeohash(48.8566, 2.3522, 7) })];

    const areas = buildAreaRankings([...london, ...paris]);
    expect(areas.length).toBe(2);
    expect(areas.every((a) => a.geohash.length === 5)).toBe(true);
  });

  it('ranks calmer areas first', () => {
    const areas = buildAreaRankings([
      cell({ geohash: encodeGeohash(51.5074, -0.1278, 7), chaosIndex: 80 }),
      cell({ geohash: encodeGeohash(48.8566, 2.3522, 7), chaosIndex: 10 }),
    ]);
    expect(areas[0]!.score).toBeGreaterThan(areas[1]!.score);
  });
});

describe('community snapshot', () => {
  it('flags a thin dataset as sparse rather than presenting it as fact', () => {
    const snapshot = buildCommunitySnapshot([cell(), cell()], 'noise', 'local');
    expect(snapshot.sparse).toBe(true);
  });

  it('stops flagging sparse once there is enough data', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      cell({ geohash: encodeGeohash(51.5 + i * 0.002, -0.12, 7) }),
    );
    expect(buildCommunitySnapshot(many, 'noise', 'local').sparse).toBe(false);
  });

  it('reports quietest and noisiest in opposite orders', () => {
    const cells = [
      cell({ geohash: encodeGeohash(51.50, -0.12, 7), chaosIndex: 10 }),
      cell({ geohash: encodeGeohash(51.50, -0.12, 7), chaosIndex: 10 }),
      cell({ geohash: encodeGeohash(51.52, -0.10, 7), chaosIndex: 90 }),
      cell({ geohash: encodeGeohash(51.52, -0.10, 7), chaosIndex: 90 }),
    ];
    const snapshot = buildCommunitySnapshot(cells, 'chaos', 'local');

    expect(snapshot.quietest[0]!.score).toBeGreaterThan(snapshot.noisiest[0]!.score);
  });

  it('handles an empty dataset without throwing', () => {
    const snapshot = buildCommunitySnapshot([], 'noise', 'local');
    expect(snapshot.cells).toHaveLength(0);
    expect(snapshot.quietest).toHaveLength(0);
    expect(snapshot.sparse).toBe(true);
  });

  it('carries no identifiers through aggregation', () => {
    const snapshot = buildCommunitySnapshot([cell(), cell()], 'noise', 'local');
    const serialised = JSON.stringify(snapshot);
    expect(serialised).not.toContain('deviceId');
    expect(serialised).not.toContain('tripId');
  });
});
