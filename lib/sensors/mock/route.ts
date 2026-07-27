import type { LatLon } from '@/lib/geo/haversine';

/**
 * A synthetic city commute through central London.
 *
 * Real-ish geometry matters: it exercises the map, the simplifier and the
 * geohash bucketing the same way a genuine trace would, and gives demo
 * screenshots something recognisable rather than a straight line through the
 * Atlantic.
 */
export const DEMO_ROUTE: LatLon[] = [
  { lat: 51.5286, lon: -0.1015 }, // Angel
  { lat: 51.5265, lon: -0.1035 },
  { lat: 51.5241, lon: -0.1042 },
  { lat: 51.5218, lon: -0.1039 },
  { lat: 51.5199, lon: -0.1028 },
  { lat: 51.5187, lon: -0.101 }, // Barbican
  { lat: 51.5174, lon: -0.0977 },
  { lat: 51.516, lon: -0.0942 },
  { lat: 51.5148, lon: -0.0925 }, // Bank
  { lat: 51.5133, lon: -0.0918 },
  { lat: 51.5115, lon: -0.0906 },
  { lat: 51.5098, lon: -0.0884 }, // Monument
  { lat: 51.5079, lon: -0.0877 },
  { lat: 51.5062, lon: -0.0885 }, // London Bridge
  { lat: 51.5043, lon: -0.0891 },
  { lat: 51.5027, lon: -0.0902 },
  { lat: 51.5008, lon: -0.0918 }, // Borough
  { lat: 51.4988, lon: -0.0951 },
  { lat: 51.4971, lon: -0.0989 },
  { lat: 51.4958, lon: -0.1031 }, // Elephant & Castle
  { lat: 51.4944, lon: -0.1068 },
  { lat: 51.4929, lon: -0.1102 },
  { lat: 51.4911, lon: -0.1128 },
  { lat: 51.4893, lon: -0.1149 }, // Kennington
  { lat: 51.4872, lon: -0.1163 },
  { lat: 51.4851, lon: -0.117 },
  { lat: 51.4829, lon: -0.1172 }, // Oval
  { lat: 51.4806, lon: -0.1168 },
  { lat: 51.4784, lon: -0.1159 },
  { lat: 51.4763, lon: -0.1144 }, // Stockwell
];

/** Total path length in metres, precomputed once. */
export function routeLength(route: readonly LatLon[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    // Equirectangular approximation is ample at these distances.
    const dx = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
    const dy = (b.lat - a.lat) * 110_540;
    cumulative.push(cumulative[i - 1]! + Math.hypot(dx, dy));
  }
  return cumulative;
}

/** Position at a given distance along the route. */
export function pointAtDistance(
  route: readonly LatLon[],
  cumulative: readonly number[],
  distance: number,
): { point: LatLon; bearing: number } {
  const total = cumulative[cumulative.length - 1]!;
  const d = Math.max(0, Math.min(distance, total));

  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i]! < d) i++;

  const a = route[i - 1]!;
  const b = route[i]!;
  const segStart = cumulative[i - 1]!;
  const segLen = cumulative[i]! - segStart;
  const t = segLen > 0 ? (d - segStart) / segLen : 0;

  const point = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  const bearing =
    (Math.atan2(b.lon - a.lon, b.lat - a.lat) * 180) / Math.PI;

  return { point, bearing: (bearing + 360) % 360 };
}
