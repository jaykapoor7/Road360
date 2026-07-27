import type { Millis, Offset, SyncMeta, TripId } from './schema';

/**
 * The trip event log — and, at the same time, the trip timeline.
 *
 * There is deliberately no parallel `horns[] / brakes[] / accels[]` structure.
 * One chronological, persisted, discriminated union feeds the live ticker, the
 * report timeline and the replay, and counts are derived by selector. Adding a
 * new kind of moment means adding a variant here, not a new array everywhere.
 */

/** Sound classes the detector can emit. Generic from day one so new classes are additive. */
export type SoundEventType = 'horn' | 'siren' | 'whistle' | 'unknown';

export const SOUND_EVENT_TYPES: readonly SoundEventType[] = [
  'horn',
  'siren',
  'whistle',
  'unknown',
] as const;

export type EventSource = 'audio' | 'motion' | 'gps' | 'derived';

export interface BaseEvent extends SyncMeta {
  id: string;
  tripId: TripId;
  /** Per-trip monotonic sequence. Composite key is [tripId, seq]. */
  seq: number;
  t: Offset;
  lat: number | null;
  lon: number | null;
  gh: string | null;
  source: EventSource;
  /** 0..1. Sensor-proxied events carry lower confidence than directly measured ones. */
  confidence: number;
}

export interface SoundEvent extends BaseEvent {
  type: 'sound';
  source: 'audio';
  sound: SoundEventType;
  /** Full class distribution, not just the winner — useful for later re-scoring. */
  scores: Partial<Record<SoundEventType, number>>;
  db: number;
  peakHz: number;
  durationMs: number;
  /** Blasts collapsed into this event; a three-tap honk is one event with blasts: 3. */
  blasts: number;
  /**
   * Which detector produced this, so historical data stays interpretable after
   * the heuristic is replaced by a model.
   */
  detectorId: string;
  detectorVersion: string;
}

export interface BrakeEvent extends BaseEvent {
  type: 'brake';
  severity: 'hard' | 'severe';
  /** Peak longitudinal deceleration, m/s² (negative). */
  peakDecel: number;
  speedBefore: number | null;
  durationMs: number;
}

export interface AccelEvent extends BaseEvent {
  type: 'accel';
  severity: 'rapid' | 'aggressive';
  peakAccel: number;
  durationMs: number;
}

export interface StopEvent extends BaseEvent {
  type: 'stop';
  source: 'derived';
  /** Only stops of 5 s or longer are recorded — otherwise a city drive is all events. */
  durationMs: number;
}

export interface PeakDbEvent extends BaseEvent {
  type: 'peakDb';
  source: 'audio';
  db: number;
}

/**
 * Recorded when the page was suspended (screen lock, backgrounding). The window
 * is excluded from `activeMs` so a 20-minute pocket does not silently read as
 * twenty peaceful minutes.
 */
export interface GapEvent extends BaseEvent {
  type: 'gap';
  source: 'derived';
  durationMs: number;
  reason: 'hidden' | 'suspended' | 'sensor-loss';
}

export type TripEvent =
  | SoundEvent
  | BrakeEvent
  | AccelEvent
  | StopEvent
  | PeakDbEvent
  | GapEvent;

export type TripEventType = TripEvent['type'];

/**
 * `Omit` over a union collapses to the keys the members share, which would
 * erase every variant-specific field. This distributes over the union so each
 * member keeps its own shape.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type DraftOf<E extends TripEvent> = Omit<
  E,
  keyof SyncMeta | 'id' | 'tripId' | 'seq' | 't' | 'lat' | 'lon' | 'gh'
> &
  Partial<Pick<E, 'lat' | 'lon' | 'gh'>>;

/**
 * An event as authored by the recording engine, before identity, sequence and
 * sync metadata are stamped on. Position is optional because a GPS-denied trip
 * still produces perfectly valid brake and horn events.
 */
export type TripEventDraft = TripEvent extends infer E
  ? E extends TripEvent
    ? DraftOf<E>
    : never
  : never;

export type { DistributiveOmit };

/* --------------------------------- guards -------------------------------- */

export const isSound = (e: TripEvent): e is SoundEvent => e.type === 'sound';
export const isBrake = (e: TripEvent): e is BrakeEvent => e.type === 'brake';
export const isAccel = (e: TripEvent): e is AccelEvent => e.type === 'accel';
export const isStop = (e: TripEvent): e is StopEvent => e.type === 'stop';
export const isGap = (e: TripEvent): e is GapEvent => e.type === 'gap';

export const isHorn = (e: TripEvent): e is SoundEvent => isSound(e) && e.sound === 'horn';

/** Events that belong on the user-facing timeline. Gaps are bookkeeping, not moments. */
export const isTimelineVisible = (e: TripEvent): boolean => e.type !== 'gap';

/* ------------------------------- absolute time --------------------------- */

export function eventAbsoluteTime(event: TripEvent, tripStartedAt: Millis): Millis {
  return tripStartedAt + event.t;
}
