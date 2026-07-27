import type { LatLon } from './haversine';

export type Bounds = [[number, number], [number, number]];

export function boundsOf(points: readonly LatLon[]): Bounds | null {
  if (points.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  // A stationary trip produces a degenerate box that Leaflet cannot fit to.
  if (minLat === maxLat && minLon === maxLon) {
    const pad = 0.001; // ~110 m
    return [
      [minLat - pad, minLon - pad],
      [maxLat + pad, maxLon + pad],
    ];
  }

  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

export function boundsCenter(bounds: Bounds): LatLon {
  const [[minLat, minLon], [maxLat, maxLon]] = bounds;
  return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
}
