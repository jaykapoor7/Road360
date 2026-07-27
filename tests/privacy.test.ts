import { describe, expect, it } from 'vitest';
import { anonymizeTrip, trimEndpoints } from '@/lib/sync/anonymize';
import { encodeGeohash, decodeGeohash } from '@/lib/sync/geohash';
import { haversine } from '@/lib/geo/haversine';
import { simplifyPath } from '@/lib/geo/simplify';
import { PRIVACY } from '@/lib/config/constants';
import { sample, hornEvent } from './fixtures';
import type { TripSample } from '@/lib/domain/samples';

/** A straight ~2 km eastward run at roughly 10 m/s, one sample per second. */
function straightRoute(count = 200): TripSample[] {
  return Array.from({ length: count }, (_, i) =>
    sample(i * 1000, {
      lat: 51.5,
      // ~0.000143° lon ≈ 10 m at this latitude
      lon: -0.1 + i * 0.000143,
      spd: 10,
    }),
  );
}

describe('geohash', () => {
  it('encodes to the requested precision', () => {
    expect(encodeGeohash(51.5074, -0.1278, 7)).toHaveLength(7);
    expect(encodeGeohash(51.5074, -0.1278, 5)).toHaveLength(5);
  });

  it('round-trips to within the cell size', () => {
    const hash = encodeGeohash(51.5074, -0.1278, 7);
    const { lat, lon } = decodeGeohash(hash);
    // Precision 7 cells are ~153 m x 153 m, so the centre is within ~110 m.
    expect(haversine({ lat: 51.5074, lon: -0.1278 }, { lat, lon })).toBeLessThan(120);
  });

  it('gives neighbouring points inside one cell the same hash', () => {
    const a = encodeGeohash(51.50740, -0.12780, 7);
    const b = encodeGeohash(51.50741, -0.12781, 7);
    expect(a).toBe(b);
  });

  it('separates points that are far apart', () => {
    expect(encodeGeohash(51.5074, -0.1278, 7)).not.toBe(encodeGeohash(48.8566, 2.3522, 7));
  });
});

describe('trimEndpoints', () => {
  it('removes the leading and trailing 250 m of a trace', () => {
    const route = straightRoute();
    const kept = trimEndpoints(route);

    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(route.length);

    const start = route[0]!;
    const end = route[route.length - 1]!;
    const firstKept = kept[0]!;
    const lastKept = kept[kept.length - 1]!;

    expect(
      haversine({ lat: start.lat!, lon: start.lon! }, { lat: firstKept.lat!, lon: firstKept.lon! }),
    ).toBeGreaterThanOrEqual(PRIVACY.trimMetres - 15);

    expect(
      haversine({ lat: end.lat!, lon: end.lon! }, { lat: lastKept.lat!, lon: lastKept.lon! }),
    ).toBeGreaterThanOrEqual(PRIVACY.trimMetres - 15);
  });

  it('returns nothing for a trip too short to trim safely', () => {
    // 30 samples ≈ 300 m, less than the 500 m both trims need.
    expect(trimEndpoints(straightRoute(30))).toHaveLength(0);
  });

  it('returns nothing when there are no located samples', () => {
    const noGps = Array.from({ length: 50 }, (_, i) => sample(i * 1000, { lat: null, lon: null }));
    expect(trimEndpoints(noGps)).toHaveLength(0);
  });
});

describe('anonymizeTrip', () => {
  const startedAt = new Date('2026-07-20T08:30:00Z').getTime();

  it('carries no identifiers of any kind', () => {
    const cells = anonymizeTrip({ samples: straightRoute(), events: [], startedAt });
    expect(cells.length).toBeGreaterThan(0);

    for (const cell of cells) {
      const keys = Object.keys(cell);
      expect(keys).not.toContain('deviceId');
      expect(keys).not.toContain('tripId');
      expect(keys).not.toContain('id');
      expect(keys).not.toContain('t');
      // Absolute time is reduced to an hour-of-week bucket.
      expect(cell.hourOfWeek).toBeGreaterThanOrEqual(0);
      expect(cell.hourOfWeek).toBeLessThan(168);
    }
  });

  it('never emits a cell that includes a trip endpoint', () => {
    const route = straightRoute();
    const cells = anonymizeTrip({ samples: route, events: [], startedAt });

    const first = route[0]!;
    const last = route[route.length - 1]!;
    const startCell = encodeGeohash(first.lat!, first.lon!, PRIVACY.contributionGeohashPrecision);
    const endCell = encodeGeohash(last.lat!, last.lon!, PRIVACY.contributionGeohashPrecision);

    expect(cells.some((c) => c.geohash === startCell)).toBe(false);
    expect(cells.some((c) => c.geohash === endCell)).toBe(false);
  });

  it('drops cells with too few samples to be non-identifying', () => {
    const cells = anonymizeTrip({ samples: straightRoute(), events: [], startedAt });
    for (const cell of cells) {
      expect(cell.sampleCount).toBeGreaterThanOrEqual(PRIVACY.minCellSamples);
    }
  });

  it('attributes horns to the cell they occurred in', () => {
    const route = straightRoute();
    const mid = route[100]!;
    const cells = anonymizeTrip({
      samples: route,
      events: [hornEvent(1, mid.t, { lat: mid.lat, lon: mid.lon })],
      startedAt,
    });

    const total = cells.reduce((acc, c) => acc + c.hornCount, 0);
    expect(total).toBe(1);
  });

  it('ignores events that fall inside a trimmed endpoint', () => {
    const route = straightRoute();
    const start = route[2]!;
    const cells = anonymizeTrip({
      samples: route,
      events: [hornEvent(1, start.t, { lat: start.lat, lon: start.lon })],
      startedAt,
    });

    expect(cells.reduce((acc, c) => acc + c.hornCount, 0)).toBe(0);
  });

  it('produces a bounded chaos index', () => {
    const cells = anonymizeTrip({ samples: straightRoute(), events: [], startedAt });
    for (const cell of cells) {
      expect(cell.chaosIndex).toBeGreaterThanOrEqual(0);
      expect(cell.chaosIndex).toBeLessThanOrEqual(100);
    }
  });

  it('returns nothing for a trip with no usable location data', () => {
    const noGps = Array.from({ length: 100 }, (_, i) => sample(i * 1000, { lat: null, lon: null }));
    expect(anonymizeTrip({ samples: noGps, events: [], startedAt })).toHaveLength(0);
  });
});

describe('simplifyPath', () => {
  it('collapses a straight line to its endpoints', () => {
    const line = Array.from({ length: 100 }, (_, i) => ({ lat: 51.5, lon: -0.1 + i * 0.0001 }));
    expect(simplifyPath(line, 12)).toHaveLength(2);
  });

  it('keeps points that carry the shape', () => {
    const corner = [
      { lat: 51.5, lon: -0.1 },
      { lat: 51.5, lon: -0.09 },
      { lat: 51.51, lon: -0.09 },
    ];
    expect(simplifyPath(corner, 12)).toHaveLength(3);
  });

  it('leaves degenerate inputs alone', () => {
    expect(simplifyPath([], 12)).toHaveLength(0);
    expect(simplifyPath([{ lat: 1, lon: 1 }], 12)).toHaveLength(1);
  });

  it('handles a long path without exhausting the stack', () => {
    const many = Array.from({ length: 60_000 }, (_, i) => ({
      lat: 51.5 + Math.sin(i / 500) * 0.01,
      lon: -0.1 + i * 0.00001,
    }));
    expect(() => simplifyPath(many, 5)).not.toThrow();
  });
});
