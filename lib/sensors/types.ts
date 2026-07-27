import type { SensorError, SensorKind, SensorStatus } from '@/lib/domain/sensors';
import type { Result } from '@/lib/utils/result';

/**
 * The capture contract.
 *
 * Two properties fall out of having exactly one interface here:
 *
 *  - demo mode is free — simulated sources are just another implementation, and
 *    nothing downstream can tell the difference;
 *  - a Capacitor / React Native port is a rewrite of `web/` alone.
 *
 * Note what this interface does *not* have: a data subscription. Sensor data is
 * pulled by the assembler once per second via `peek()`, never pushed into React.
 * A push API at 50 Hz is exactly how these apps end up re-rendering the world
 * sixty times a second and cooking the battery.
 */
export interface SensorSource<T> {
  readonly kind: SensorKind;
  start(): Promise<Result<void, SensorError>>;
  stop(): Promise<void>;
  readonly status: SensorStatus;
  /** Latest value, or null if none yet. Read by the assembler; never by a component. */
  peek(): T | null;
  /** Status transitions only — rare, and safe to render on. */
  onStatusChange(cb: (status: SensorStatus) => void): () => void;
}

/* ------------------------------ sample shapes ---------------------------- */

export interface GpsFix {
  t: number; // performance-clock ms
  lat: number;
  lon: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null; // m/s
  heading: number | null;
}

export interface AudioReading {
  t: number;
  /** Equivalent continuous level over the window, dBFS-derived pseudo-SPL. */
  rmsDb: number;
  peakDb: number;
  /** Rolling ambient floor. */
  floorDb: number;
}

export interface MotionReading {
  t: number;
  /** Mean linear acceleration magnitude over the window, m/s². */
  aMag: number;
  aMax: number;
  /** RMS jerk, m/s³. */
  jerk: number;
  /** Longitudinal acceleration, m/s². Negative is braking. */
  longitudinal: number;
  minLongitudinal: number;
  maxLongitudinal: number;
}

/** Raw spectral frame handed to the classifier. Capture produces it; capture does not interpret it. */
export interface AudioFrame {
  t: number;
  sampleRate: number;
  fftSize: number;
  magnitudes: Float32Array;
  rmsDb: number;
  peakDb: number;
}

export type GpsSource = SensorSource<GpsFix>;
export type AudioSource = SensorSource<AudioReading>;
export type MotionSource = SensorSource<MotionReading>;

/** Audio additionally streams spectral frames to the detector pipeline. */
export interface FrameProducer {
  onFrame(cb: (frame: AudioFrame) => void): () => void;
}

export type SensorMode = 'live' | 'simulated';

export interface SensorSuite {
  mode: SensorMode;
  gps: GpsSource;
  audio: AudioSource & Partial<FrameProducer>;
  motion: MotionSource;
}

/** Base class handling the status bookkeeping every source repeats. */
export abstract class BaseSensorSource<T> implements SensorSource<T> {
  abstract readonly kind: SensorKind;

  protected _status: SensorStatus = 'idle';
  protected latest: T | null = null;
  private listeners = new Set<(status: SensorStatus) => void>();

  get status(): SensorStatus {
    return this._status;
  }

  protected setStatus(status: SensorStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const listener of this.listeners) listener(status);
  }

  onStatusChange(cb: (status: SensorStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  peek(): T | null {
    return this.latest;
  }

  abstract start(): Promise<Result<void, SensorError>>;
  abstract stop(): Promise<void>;
}
