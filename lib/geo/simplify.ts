import { pointToSegmentDistance, type LatLon } from './haversine';

/**
 * Douglas–Peucker line simplification.
 *
 * A 45-minute drive is ~2700 GPS points. Rendering that as SVG or even canvas
 * polylines janks badly on mobile, and most of the points are visually
 * redundant. At ε = 12 m a city route reduces to a few hundred points with no
 * perceptible change in shape.
 *
 * Implemented iteratively rather than recursively — a long highway trip can
 * otherwise blow the stack.
 */
export function simplifyPath(points: readonly LatLon[], epsilonM: number): LatLon[] {
  if (points.length <= 2) return [...points];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;

    let maxDist = 0;
    let index = -1;
    const a = points[first]!;
    const b = points[last]!;

    for (let i = first + 1; i < last; i++) {
      const d = pointToSegmentDistance(points[i]!, a, b);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }

    if (maxDist > epsilonM && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out: LatLon[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]!);
  }
  return out;
}

/** Simplification tolerance for a given map zoom level. */
export function epsilonForZoom(zoom: number): number {
  if (zoom >= 16) return 5;
  if (zoom >= 13) return 15;
  return 40;
}

export const toTuples = (points: readonly LatLon[]): [number, number][] =>
  points.map((p) => [p.lat, p.lon]);

export const fromTuples = (tuples: readonly [number, number][]): LatLon[] =>
  tuples.map(([lat, lon]) => ({ lat, lon }));
