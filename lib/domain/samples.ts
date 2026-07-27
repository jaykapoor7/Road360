import type { Offset, SyncMeta, TripId } from './schema';

/**
 * One second of merged telemetry.
 *
 * Keys are deliberately short: a 90-minute drive is ~5400 of these, and the
 * property names are repeated in every single one once serialised into
 * IndexedDB. `lat` over `latitude` is worth real megabytes at scale.
 */
export interface TripSample {
  /** Always a multiple of 1000 — one sample per second of the master clock. */
  t: Offset;
  lat: number | null;
  lon: number | null;
  /** GPS horizontal accuracy, metres. */
  acc: number | null;
  /** Speed, m/s. GPS-reported where available, otherwise derived. */
  spd: number | null;
  /** Heading, degrees. */
  hdg: number | null;
  /** Equivalent continuous sound level over this second (pseudo-SPL, dB). */
  db: number;
  /** Peak level within this second. */
  dbPk: number;
  /** Mean linear acceleration magnitude (gravity removed), m/s². */
  aMag: number;
  /** Max linear acceleration magnitude within this second, m/s². */
  aMax: number;
  /** RMS jerk over this second, m/s³. */
  jerk: number;
  /** Moving flag — speed > 1.0 m/s, or motion energy above threshold when GPS is absent. */
  mov: 0 | 1;
  /** Geohash precision 7 (~150 m). Precomputed so community aggregation is a group-by. */
  gh: string | null;
}

/**
 * Samples are persisted in fixed-size chunks rather than on the trip record.
 * The history screen reads trip headers only and never pages in megabytes of
 * telemetry it will not display.
 */
export const CHUNK_SIZE = 120; // 2 minutes per chunk

export interface TripSampleChunk extends SyncMeta {
  tripId: TripId;
  /** 0-based index. Composite key is [tripId, chunk]. */
  chunk: number;
  from: Offset;
  to: Offset;
  samples: TripSample[];
}

export function emptySample(t: Offset): TripSample {
  return {
    t,
    lat: null,
    lon: null,
    acc: null,
    spd: null,
    hdg: null,
    db: 0,
    dbPk: 0,
    aMag: 0,
    aMax: 0,
    jerk: 0,
    mov: 0,
    gh: null,
  };
}
