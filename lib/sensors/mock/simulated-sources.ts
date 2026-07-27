import {
  BaseSensorSource,
  type AudioFrame,
  type AudioReading,
  type FrameProducer,
  type GpsFix,
  type MotionReading,
} from '../types';
import type { SensorKind } from '@/lib/domain/sensors';
import type { SensorError } from '@/lib/domain/sensors';
import { Ok, type Result } from '@/lib/utils/result';
import { DEMO_ROUTE, pointAtDistance, routeLength } from './route';
import { SCENARIOS, type ScenarioId } from './scenarios';
import { AUDIO } from '@/lib/config/constants';
import { NoiseFloorEstimator } from '@/lib/audio/features/noise-floor';
import type { FFT } from '@/lib/audio/features/fft';

/**
 * Simulated sensors.
 *
 * These implement exactly the same `SensorSource` contract as the real ones, so
 * every layer above — assembler, detector, scoring, insights, storage, replay —
 * is exercised identically. Demo mode is not a separate code path with its own
 * bugs; it is a different implementation of one interface.
 *
 * They also run faster than real time when asked, which is what makes a
 * fifteen-minute commute verifiable in a fifteen-second test.
 */

/** Deterministic RNG so a demo drive is reproducible and screenshots are stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulationClock {
  /** Trip time in milliseconds. Driven by the session clock, not wall time. */
  now(): number;
}

interface SimulatedOptions {
  scenario: ScenarioId;
  clock: SimulationClock;
  seed?: number;
}

/* --------------------------------- shared -------------------------------- */

/**
 * The speed profile is shared by GPS and motion so the two agree — a simulated
 * hard brake must correspond to a real drop in simulated speed, or the derived
 * stats contradict the events.
 */
class DriveProfile {
  private readonly rng: () => number;
  private readonly cumulative: number[];
  readonly totalDistanceM: number;

  constructor(
    private readonly scenario: (typeof SCENARIOS)[ScenarioId],
    seed: number,
  ) {
    this.rng = mulberry32(seed);
    this.cumulative = routeLength(DEMO_ROUTE);
    this.totalDistanceM = this.cumulative[this.cumulative.length - 1]!;
  }

  /** Fraction of the trip elapsed, 0..1. */
  progress(tMs: number): number {
    return Math.max(0, Math.min(1, tMs / (this.scenario.durationS * 1000)));
  }

  /**
   * Speed at a given moment. Stops are carved out of the profile using a slow
   * pseudo-random wave, so they cluster the way real traffic does rather than
   * appearing uniformly.
   */
  speedAt(tMs: number): number {
    const s = this.scenario;
    const tS = tMs / 1000;

    const congestion = 0.5 + 0.5 * Math.sin(tS / 37) * Math.sin(tS / 11 + 1.3);
    const stopped = congestion < s.stopRatio;
    if (stopped) return 0;

    const variation = 0.75 + 0.5 * (0.5 + 0.5 * Math.sin(tS / 5.5));
    return s.cruiseSpeed * variation;
  }

  distanceAt(tMs: number): number {
    // Integrating the speed profile every call would be O(t); the trip is
    // short enough that a coarse 1 s march is both accurate and cheap.
    let distance = 0;
    for (let t = 0; t < tMs; t += 1000) {
      distance += this.speedAt(t);
    }
    return Math.min(distance, this.totalDistanceM);
  }

  positionAt(tMs: number): { lat: number; lon: number; bearing: number } {
    const { point, bearing } = pointAtDistance(DEMO_ROUTE, this.cumulative, this.distanceAt(tMs));
    return { lat: point.lat, lon: point.lon, bearing };
  }

  /**
   * Whether an event of the given per-minute rate fires in this second.
   * `endLoading` biases events toward the end of the trip so the segment
   * analysis has a genuine signal to find.
   */
  fires(ratePerMin: number, tMs: number): boolean {
    if (ratePerMin <= 0) return false;
    const p = this.progress(tMs);
    const bias = 1 + (this.scenario.endLoading - 0.5) * 2 * (p - 0.5) * 2;
    const perSecond = (ratePerMin / 60) * Math.max(0.1, bias);
    return this.rng() < perSecond;
  }

  random(): number {
    return this.rng();
  }
}

/* ---------------------------------- GPS ---------------------------------- */

export class SimulatedGpsSource extends BaseSensorSource<GpsFix> {
  readonly kind: SensorKind = 'gps';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly profile: DriveProfile,
    private readonly clock: SimulationClock,
  ) {
    super();
  }

  async start(): Promise<Result<void, SensorError>> {
    this.setStatus('live');
    this.emit();
    // Real GPS delivers at ~1 Hz; the simulation matches so downstream
    // filtering behaves identically.
    this.timer = setInterval(() => this.emit(), 1000);
    return Ok(undefined);
  }

  private emit(): void {
    const t = this.clock.now();
    const { lat, lon, bearing } = this.profile.positionAt(t);
    const speed = this.profile.speedAt(t);

    // A little jitter, so the displacement filter has something to reject.
    const jitter = () => (this.profile.random() - 0.5) * 0.00002;

    this.latest = {
      t: performance.now(),
      lat: lat + jitter(),
      lon: lon + jitter(),
      accuracy: 6 + this.profile.random() * 8,
      altitude: 20,
      speed,
      heading: bearing,
    };
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setStatus('idle');
  }
}

/* --------------------------------- motion -------------------------------- */

export class SimulatedMotionSource extends BaseSensorSource<MotionReading> {
  readonly kind: SensorKind = 'motion';
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingBrake = 0;
  private pendingAccel = 0;

  constructor(
    private readonly profile: DriveProfile,
    private readonly scenario: (typeof SCENARIOS)[ScenarioId],
    private readonly clock: SimulationClock,
  ) {
    super();
  }

  async start(): Promise<Result<void, SensorError>> {
    this.setStatus('live');
    this.timer = setInterval(() => this.emit(), 200);
    this.emit();
    return Ok(undefined);
  }

  private emit(): void {
    const t = this.clock.now();

    if (this.pendingBrake <= 0 && this.profile.fires(this.scenario.brakesPerMin, t)) {
      this.pendingBrake = 2; // spans ~400 ms, past the 300 ms sustain gate
    }
    if (this.pendingAccel <= 0 && this.profile.fires(this.scenario.accelsPerMin, t)) {
      this.pendingAccel = 3;
    }

    let longitudinal = (this.profile.random() - 0.5) * 0.8;

    if (this.pendingBrake > 0) {
      longitudinal = -4.2 - this.profile.random() * 1.6;
      this.pendingBrake -= 1;
    } else if (this.pendingAccel > 0) {
      longitudinal = 3.1 + this.profile.random() * 1.4;
      this.pendingAccel -= 1;
    }

    const magnitude = Math.abs(longitudinal) + 0.3 + this.profile.random() * 0.4;

    this.latest = {
      t,
      aMag: magnitude,
      aMax: magnitude * 1.3,
      jerk: Math.abs(longitudinal) * 0.8 + this.profile.random() * 0.5,
      longitudinal,
      minLongitudinal: Math.min(0, longitudinal),
      maxLongitudinal: Math.max(0, longitudinal),
    };
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setStatus('idle');
  }
}

/* --------------------------------- audio --------------------------------- */

/**
 * Synthesises real waveforms and runs them through the real FFT, so the actual
 * shipped detector does the classification. Faking detections directly would
 * make demo mode prove nothing about whether detection works.
 */
export class SimulatedAudioSource
  extends BaseSensorSource<AudioReading>
  implements FrameProducer
{
  readonly kind: SensorKind = 'audio';

  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly frameListeners = new Set<(frame: AudioFrame) => void>();
  private readonly floor = new NoiseFloorEstimator(
    Math.round(AUDIO.noiseFloorWindowMs / AUDIO.hopMs),
    Math.round(AUDIO.noiseFloorEwmaMs / AUDIO.hopMs),
  );

  private hornFramesLeft = 0;
  private sirenFramesLeft = 0;
  private hornFundamental = 440;
  private phase = 0;

  private readonly buffer = new Float32Array(AUDIO.fftSize);
  private readonly magnitudes = new Float32Array(AUDIO.fftSize / 2);
  private fft: FFT | null = null;

  constructor(
    private readonly profile: DriveProfile,
    private readonly scenario: (typeof SCENARIOS)[ScenarioId],
    private readonly clock: SimulationClock,
  ) {
    super();
  }

  onFrame(cb: (frame: AudioFrame) => void): () => void {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  async start(): Promise<Result<void, SensorError>> {
    const { FFT } = await import('@/lib/audio/features/fft');
    this.fft = new FFT(AUDIO.fftSize);

    this.setStatus('live');
    this.timer = setInterval(() => this.emit(), AUDIO.hopMs);
    return Ok(undefined);
  }

  private emit(): void {
    if (!this.fft) return;
    const t = this.clock.now();
    const s = this.scenario;

    // Ambient level breathes with traffic.
    const swell = 0.5 + 0.5 * Math.sin(t / 9000);
    const ambientDb = s.baseDb + swell * s.noiseSwingDb * 0.4;
    const ambientAmp = Math.pow(10, (ambientDb - AUDIO.defaultCalibrationOffset) / 20);

    if (this.hornFramesLeft <= 0 && this.sirenFramesLeft <= 0) {
      if (this.profile.fires(s.hornsPerMin * (AUDIO.hopMs / 1000) * 60, t)) {
        // 300–900 ms, comfortably past the sustain gate.
        this.hornFramesLeft = 6 + Math.floor(this.profile.random() * 12);
        this.hornFundamental = 380 + this.profile.random() * 160;
      } else if (this.profile.fires(s.sirensPerMin * (AUDIO.hopMs / 1000) * 60, t)) {
        this.sirenFramesLeft = 60 + Math.floor(this.profile.random() * 40);
      }
    }

    const sampleRate = AUDIO.targetSampleRate;
    const eventAmp = Math.pow(10, (s.baseDb + 22 - AUDIO.defaultCalibrationOffset) / 20);

    for (let i = 0; i < this.buffer.length; i++) {
      const time = (this.phase + i) / sampleRate;
      let value = (this.profile.random() * 2 - 1) * ambientAmp;

      if (this.hornFramesLeft > 0) {
        const f = this.hornFundamental;
        value +=
          eventAmp *
          (0.6 * Math.sin(2 * Math.PI * f * time) +
            0.45 * Math.sin(2 * Math.PI * f * 1.19 * time) +
            0.3 * Math.sin(2 * Math.PI * f * 2 * time) +
            0.2 * Math.sin(2 * Math.PI * f * 3 * time) +
            0.12 * Math.sin(2 * Math.PI * f * 4 * time));
      } else if (this.sirenFramesLeft > 0) {
        const sweep = 500 + 900 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * time));
        value +=
          eventAmp * (0.6 * Math.sin(2 * Math.PI * sweep * time) + 0.25 * Math.sin(4 * Math.PI * sweep * time));
      }

      this.buffer[i] = value;
    }

    this.phase += Math.round((sampleRate * AUDIO.hopMs) / 1000);
    if (this.hornFramesLeft > 0) this.hornFramesLeft -= 1;
    if (this.sirenFramesLeft > 0) this.sirenFramesLeft -= 1;

    const { amplitudeToDb, bufferPeak, bufferRms } = simpleLevels;
    const rmsDb = amplitudeToDb(bufferRms(this.buffer)) + AUDIO.defaultCalibrationOffset;
    const peakDb = amplitudeToDb(bufferPeak(this.buffer)) + AUDIO.defaultCalibrationOffset;
    const floorDb = this.floor.push(rmsDb);

    this.latest = { t, rmsDb, peakDb, floorDb };

    if (this.frameListeners.size > 0) {
      this.fft.magnitudes(this.buffer, this.magnitudes);
      const frame: AudioFrame = {
        t,
        sampleRate,
        fftSize: AUDIO.fftSize,
        magnitudes: this.magnitudes,
        rmsDb,
        peakDb,
      };
      for (const listener of this.frameListeners) listener(frame);
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.floor.reset();
    this.setStatus('idle');
  }
}

/** Small local copies so this module does not pull the FFT in eagerly. */
const simpleLevels = {
  amplitudeToDb: (amplitude: number): number => 20 * Math.log10(Math.max(amplitude, 1e-10)),
  bufferRms: (buffer: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i]! * buffer[i]!;
    return Math.sqrt(sum / Math.max(1, buffer.length));
  },
  bufferPeak: (buffer: Float32Array): number => {
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.abs(buffer[i]!);
      if (v > peak) peak = v;
    }
    return peak;
  },
};

/* -------------------------------- factory -------------------------------- */

export function createSimulatedSuite(options: SimulatedOptions) {
  const scenario = SCENARIOS[options.scenario];
  const profile = new DriveProfile(scenario, options.seed ?? 20260727);

  return {
    gps: new SimulatedGpsSource(profile, options.clock),
    audio: new SimulatedAudioSource(profile, scenario, options.clock),
    motion: new SimulatedMotionSource(profile, scenario, options.clock),
    scenario,
  };
}
