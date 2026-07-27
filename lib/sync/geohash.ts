const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Geohash encoding.
 *
 * Precision 7 (~153 m × 153 m) is the resolution used for anonymous community
 * contributions — fine enough to distinguish one road from the next, coarse
 * enough that a cell never identifies a driveway. Precision 5 (~5 km) is used
 * for grouping trips by rough area.
 */
export function encodeGeohash(lat: number, lon: number, precision = 7): string {
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  let hash = '';
  let bits = 0;
  let bit = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lon > mid) {
        bit = (bit << 1) + 1;
        lonMin = mid;
      } else {
        bit <<= 1;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat > mid) {
        bit = (bit << 1) + 1;
        latMin = mid;
      } else {
        bit <<= 1;
        latMax = mid;
      }
    }

    even = !even;
    bits += 1;

    if (bits === 5) {
      hash += BASE32[bit];
      bits = 0;
      bit = 0;
    }
  }

  return hash;
}

export interface GeohashBounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export function decodeGeohashBounds(hash: string): GeohashBounds {
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let even = true;

  for (const char of hash) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) continue;
    for (let n = 4; n >= 0; n--) {
      const bit = (idx >> n) & 1;
      if (even) {
        const mid = (lonMin + lonMax) / 2;
        if (bit === 1) lonMin = mid;
        else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bit === 1) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }

  return { latMin, latMax, lonMin, lonMax };
}

export function decodeGeohash(hash: string): { lat: number; lon: number } {
  const b = decodeGeohashBounds(hash);
  return { lat: (b.latMin + b.latMax) / 2, lon: (b.lonMin + b.lonMax) / 2 };
}
