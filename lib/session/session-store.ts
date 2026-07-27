import type { SoundEventType, TripEvent } from '@/lib/domain/events';
import type { SensorKind, SensorStatus } from '@/lib/domain/sensors';
import type { ScoreBand } from '@/lib/domain/score';

/**
 * A channelled external store, consumed through `useSyncExternalStore`.
 *
 * This is the single most consequential performance decision in the app.
 *
 * Sensors produce data at up to 50 Hz. Pushing that into React state — via
 * Context, a reducer, or a naive store — re-renders the subtree at sensor rate
 * and is exactly how a tracking app ends up cooking a phone. Instead:
 *
 *  - raw data never touches React; it lives in plain objects owned by the engine;
 *  - each *channel* commits on its own cadence (metrics 1 Hz, route 0.2 Hz,
 *    events only when something happens);
 *  - components subscribe to one channel and select a *primitive*, so React's
 *    `Object.is` bail-out means the horn card re-renders only when the horn
 *    count actually changes;
 *  - the dB meter subscribes imperatively and paints to canvas, so it re-renders
 *    literally never.
 */

export type Channel = 'status' | 'metrics' | 'route' | 'events' | 'sensors' | 'meter';

export type SessionStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'finishing' | 'error';

export interface LiveMetrics {
  tripTimeMs: number;
  distanceM: number;
  movingMs: number;
  stoppedMs: number;

  soundCounts: Record<SoundEventType, number>;
  hornCount: number;
  avgSecondsBetweenHorns: number | null;
  longestSilenceMs: number;
  currentSilenceMs: number;

  currentDb: number;
  avgDb: number;
  peakDb: number;

  hardBrakes: number;
  rapidAccels: number;

  currentSpeed: number;
  maxSpeed: number;

  provisionalScore: number;
  provisionalBand: ScoreBand;
}

export interface MeterSnapshot {
  db: number;
  floorDb: number;
  peakDb: number;
}

export interface RouteSnapshot {
  points: [number, number][];
  /** Bumped on every commit so consumers can diff cheaply. */
  revision: number;
}

export interface SensorSnapshot {
  statuses: Record<SensorKind, SensorStatus>;
  active: SensorKind[];
}

export interface SessionSnapshots {
  status: SessionStatus;
  metrics: LiveMetrics;
  route: RouteSnapshot;
  events: TripEvent[];
  sensors: SensorSnapshot;
  meter: MeterSnapshot;
}

export const EMPTY_METRICS: LiveMetrics = {
  tripTimeMs: 0,
  distanceM: 0,
  movingMs: 0,
  stoppedMs: 0,
  soundCounts: { horn: 0, siren: 0, whistle: 0, unknown: 0 },
  hornCount: 0,
  avgSecondsBetweenHorns: null,
  longestSilenceMs: 0,
  currentSilenceMs: 0,
  currentDb: 0,
  avgDb: 0,
  peakDb: 0,
  hardBrakes: 0,
  rapidAccels: 0,
  currentSpeed: 0,
  maxSpeed: 0,
  provisionalScore: 70,
  provisionalBand: 'normal',
};

export const EMPTY_ROUTE: RouteSnapshot = { points: [], revision: 0 };
export const EMPTY_EVENTS: TripEvent[] = [];
export const EMPTY_METER: MeterSnapshot = { db: 0, floorDb: 0, peakDb: 0 };
export const EMPTY_SENSORS: SensorSnapshot = {
  statuses: { gps: 'idle', audio: 'idle', motion: 'idle' },
  active: [],
};

export class SessionStore {
  private snapshots: SessionSnapshots = {
    status: 'idle',
    metrics: EMPTY_METRICS,
    route: EMPTY_ROUTE,
    events: EMPTY_EVENTS,
    sensors: EMPTY_SENSORS,
    meter: EMPTY_METER,
  };

  private readonly listeners: Record<Channel, Set<() => void>> = {
    status: new Set(),
    metrics: new Set(),
    route: new Set(),
    events: new Set(),
    sensors: new Set(),
    meter: new Set(),
  };

  subscribe(channel: Channel, listener: () => void): () => void {
    this.listeners[channel].add(listener);
    return () => {
      this.listeners[channel].delete(listener);
    };
  }

  getSnapshot<C extends Channel>(channel: C): SessionSnapshots[C] {
    return this.snapshots[channel];
  }

  /**
   * Server snapshot must be referentially stable across calls or React throws
   * an infinite-loop error during hydration.
   */
  getServerSnapshot<C extends Channel>(channel: C): SessionSnapshots[C] {
    return SERVER_SNAPSHOTS[channel];
  }

  commit<C extends Channel>(channel: C, next: SessionSnapshots[C]): void {
    if (Object.is(this.snapshots[channel], next)) return;
    this.snapshots[channel] = next;
    for (const listener of this.listeners[channel]) listener();
  }

  reset(): void {
    this.snapshots = {
      status: 'idle',
      metrics: EMPTY_METRICS,
      route: EMPTY_ROUTE,
      events: EMPTY_EVENTS,
      sensors: EMPTY_SENSORS,
      meter: EMPTY_METER,
    };
    for (const channel of Object.keys(this.listeners) as Channel[]) {
      for (const listener of this.listeners[channel]) listener();
    }
  }
}

const SERVER_SNAPSHOTS: SessionSnapshots = {
  status: 'idle',
  metrics: EMPTY_METRICS,
  route: EMPTY_ROUTE,
  events: EMPTY_EVENTS,
  sensors: EMPTY_SENSORS,
  meter: EMPTY_METER,
};

/** One store per app. The drive session attaches to it and detaches on stop. */
let storeInstance: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!storeInstance) storeInstance = new SessionStore();
  return storeInstance;
}
