import type { TripStats, NoiseStats, SegmentStats } from '@/lib/domain/stats';
import type { SensorCoverage, SensorKind } from '@/lib/domain/sensors';
import type { TripSample } from '@/lib/domain/samples';
import type { SoundEvent, BrakeEvent, TripEvent } from '@/lib/domain/events';
import { newSyncMeta, type DeviceId, type TripId } from '@/lib/domain/schema';

export const TEST_DEVICE = 'TESTDEVICE0000000000000000' as DeviceId;
export const TEST_TRIP = 'TESTTRIP00000000000000000A' as TripId;

export function coverage(available: SensorKind[] = ['gps', 'audio', 'motion']): SensorCoverage {
  const all: SensorKind[] = ['gps', 'audio', 'motion'];
  return {
    gps: available.includes('gps') ? 1 : 0,
    audio: available.includes('audio') ? 1 : 0,
    motion: available.includes('motion') ? 1 : 0,
    available,
    denied: all.filter((k) => !available.includes(k)),
  };
}

export function noiseStats(overrides: Partial<NoiseStats> = {}): NoiseStats {
  return {
    avgDb: 68,
    peakDb: 88,
    minDb: 44,
    p50Db: 66,
    p90Db: 80,
    p95Db: 84,
    loudSeconds: 40,
    quietSeconds: 120,
    floorDb: 52,
    calibrationOffset: 94,
    calibrated: false,
    ...overrides,
  };
}

function segment(index: number, label: string): SegmentStats {
  return {
    index,
    label,
    from: index * 600_000,
    to: (index + 1) * 600_000,
    horns: 0,
    hardBrakes: 0,
    rapidAccels: 0,
    avgDb: 68,
    peakDb: 80,
    distanceM: 3000,
    stoppedMs: 60_000,
    avgSpeed: 8,
  };
}

/** A 30-minute, 9 km city drive — the baseline every scoring test perturbs. */
export function tripStats(overrides: Partial<TripStats> = {}): TripStats {
  const base: TripStats = {
    durationMs: 1_800_000,
    activeMs: 1_800_000,
    distanceM: 9000,
    movingMs: 1_500_000,
    stoppedMs: 300_000,
    stoppedRatio: 300_000 / 1_800_000,
    stopCount: 8,
    avgSpeed: 6,
    maxSpeed: 16,

    soundCounts: { horn: 12, siren: 1, whistle: 0, unknown: 3 },
    hornBlasts: 18,
    hornsPerMin: 12 / 30,
    hornsPerKm: 12 / 9,
    avgSecondsBetweenHorns: 150,
    longestSilenceMs: 420_000,
    longestSilenceAt: 600_000,
    firstHornAt: 60_000,
    lastHornAt: 1_700_000,

    noise: noiseStats(),

    hardBrakes: 4,
    severeBrakes: 1,
    brakesPerKm: 4 / 9,
    rapidAccels: 5,
    aggressiveAccels: 1,
    accelsPerKm: 5 / 9,
    jerkRms: 1.4,
    jerkP95: 3.1,

    segments: [segment(0, 'first'), segment(1, 'middle'), segment(2, 'final')],
    quintiles: [],
    coverage: coverage(),
    ...overrides,
  };
  return base;
}

export function sample(t: number, overrides: Partial<TripSample> = {}): TripSample {
  return {
    t,
    lat: 51.5074 + t / 1e8,
    lon: -0.1278 + t / 1e8,
    acc: 8,
    spd: 8,
    hdg: 90,
    db: 68,
    dbPk: 74,
    aMag: 0.6,
    aMax: 1.4,
    jerk: 1.2,
    mov: 1,
    gh: null,
    ...overrides,
  };
}

export function hornEvent(seq: number, t: number, overrides: Partial<SoundEvent> = {}): SoundEvent {
  return {
    ...newSyncMeta(TEST_DEVICE, 1_700_000_000_000),
    id: `evt-${seq}`,
    tripId: TEST_TRIP,
    seq,
    t,
    lat: 51.5074,
    lon: -0.1278,
    gh: null,
    source: 'audio',
    confidence: 0.8,
    type: 'sound',
    sound: 'horn',
    scores: { horn: 0.8 },
    db: 88,
    peakHz: 440,
    durationMs: 600,
    blasts: 1,
    detectorId: 'heuristic-v1',
    detectorVersion: '1.0.0',
    ...overrides,
  };
}

export function brakeEvent(seq: number, t: number, overrides: Partial<BrakeEvent> = {}): BrakeEvent {
  return {
    ...newSyncMeta(TEST_DEVICE, 1_700_000_000_000),
    id: `evt-${seq}`,
    tripId: TEST_TRIP,
    seq,
    t,
    lat: 51.5074,
    lon: -0.1278,
    gh: null,
    source: 'motion',
    confidence: 0.9,
    type: 'brake',
    severity: 'hard',
    peakDecel: -4.2,
    speedBefore: 9,
    durationMs: 450,
    ...overrides,
  };
}

export const asEvents = (...events: TripEvent[]): TripEvent[] => events;
