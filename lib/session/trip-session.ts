import type { SensorKind, SensorStatus } from '@/lib/domain/sensors';
import type { SoundEventType, TripEvent, TripEventDraft } from '@/lib/domain/events';
import type { TripSample, TripSampleChunk } from '@/lib/domain/samples';
import { CHUNK_SIZE } from '@/lib/domain/samples';
import { newSyncMeta, type DeviceId, type TripId } from '@/lib/domain/schema';
import { newEventId, newTripId } from '@/lib/utils/id';
import { encodeGeohash } from '@/lib/sync/geohash';
import {
  AUDIO,
  CHECKPOINT_INTERVAL_MS,
  COMMIT,
  MOTION,
  PRIVACY,
  SAMPLE_INTERVAL_MS,
  STORAGE,
} from '@/lib/config/constants';
import { haversine } from '@/lib/geo/haversine';
import { SessionClock } from './session-clock';
import { LiveMetricsAccumulator } from './live-metrics';
import type { SessionStore } from './session-store';
import type { SensorSuite } from '@/lib/sensors/types';
import type { SoundEventDetector } from '@/lib/audio/types';
import { DEFAULT_DETECTOR_CONFIG } from '@/lib/audio/types';
import { evaluateFix } from '@/lib/sensors/derive';
import type { GpsFix } from '@/lib/sensors/types';

export interface TripSessionCallbacks {
  onChunk(chunk: TripSampleChunk): void | Promise<void>;
  onEvents(events: TripEvent[]): void | Promise<void>;
  onError(error: Error): void;
}

export interface TripSessionOptions {
  store: SessionStore;
  suite: SensorSuite;
  detector: SoundEventDetector | null;
  deviceId: DeviceId;
  callbacks: TripSessionCallbacks;
  simulated: boolean;
}

/**
 * The recording engine.
 *
 * Owns the master clock, merges the three sensor streams into one sample per
 * second, runs the sound detector over audio frames, records events, and
 * commits to the store on per-channel cadences.
 *
 * Nothing in here imports React. The whole recording pipeline is plain
 * TypeScript, which is what makes it portable and testable.
 */
export class TripSession {
  readonly tripId: TripId;
  readonly startedAt: number;

  private readonly clock: SessionClock;
  private readonly metrics = new LiveMetricsAccumulator();
  private readonly samples: TripSample[] = [];
  private readonly pendingEvents: TripEvent[] = [];
  private readonly allEvents: TripEvent[] = [];
  private readonly routePoints: [number, number][] = [];

  private seq = 0;
  private chunkIndex = 0;
  private lastCheckpointAt = 0;
  private lastRouteCommitAt = 0;
  private lastRoutePoint: { lat: number; lon: number } | null = null;
  private lastGpsFix: GpsFix | null = null;
  private lastMeterCommitAt = 0;

  private brakeRefractoryUntil = 0;
  private accelRefractoryUntil = 0;
  private stopStartedAt: number | null = null;

  private hidden = false;
  private hiddenSince: number | null = null;
  private detachFrames: (() => void) | null = null;
  private detachStatus: (() => void)[] = [];
  private stopped = false;

  private readonly sensorStatuses: Record<SensorKind, SensorStatus> = {
    gps: 'idle',
    audio: 'idle',
    motion: 'idle',
  };

  /** Seconds in which each sensor produced usable data — the coverage numerator. */
  private readonly coverageTicks: Record<SensorKind, number> = { gps: 0, audio: 0, motion: 0 };
  private totalTicks = 0;

  constructor(private readonly options: TripSessionOptions) {
    this.startedAt = Date.now();
    this.tripId = newTripId(this.startedAt);
    this.clock = new SessionClock((t) => this.tick(t), SAMPLE_INTERVAL_MS);
  }

  /* ------------------------------- lifecycle ------------------------------ */

  async start(): Promise<void> {
    const { suite, store, detector } = this.options;

    store.commit('status', 'requesting');

    // Sensors start in parallel; any that fail simply stay unavailable. A trip
    // needs only one working sensor to be worth recording.
    const results = await Promise.allSettled([
      suite.gps.start(),
      suite.audio.start(),
      suite.motion.start(),
    ]);

    if (results.every((r) => r.status === 'fulfilled' && !r.value.ok)) {
      store.commit('status', 'error');
      throw new Error('No sensors could be started.');
    }

    for (const source of [suite.gps, suite.audio, suite.motion]) {
      this.sensorStatuses[source.kind] = source.status;
      this.detachStatus.push(
        source.onStatusChange((status) => {
          this.sensorStatuses[source.kind] = status;
          this.commitSensors();
        }),
      );
    }
    this.commitSensors();

    if (detector && suite.audio.onFrame) {
      await detector.init({
        ...DEFAULT_DETECTOR_CONFIG,
        sampleRate: AUDIO.targetSampleRate,
        fftSize: AUDIO.fftSize,
        hopMs: AUDIO.hopMs,
      });

      this.detachFrames = suite.audio.onFrame((frame) => {
        // Runs at 20 Hz. It must not allocate or touch React — it appends to a
        // plain array at most a few times a minute.
        const detection = detector.process({
          t: frame.t,
          sampleRate: frame.sampleRate,
          fftSize: frame.fftSize,
          binHz: frame.sampleRate / frame.fftSize,
          magnitudes: frame.magnitudes,
          rmsDb: frame.rmsDb,
          peakDb: frame.peakDb,
          floorDb: suite.audio.peek()?.floorDb ?? frame.rmsDb - 10,
        });
        if (detection) this.recordSound(detection, detector);
      });
    }

    store.commit('status', 'recording');
    this.clock.start();
  }

  pause(): void {
    this.clock.pause();
    this.options.store.commit('status', 'paused');
  }

  resume(): void {
    this.clock.resume();
    this.options.store.commit('status', 'recording');
  }

  get isPaused(): boolean {
    return this.clock.paused;
  }

  async stop(): Promise<{
    samples: TripSample[];
    events: TripEvent[];
    coverage: Record<SensorKind, number>;
    sensorsUsed: SensorKind[];
  }> {
    if (this.stopped) {
      return this.result();
    }
    this.stopped = true;

    this.options.store.commit('status', 'finishing');
    this.clock.stop();

    this.detachFrames?.();
    for (const detach of this.detachStatus) detach();
    this.detachStatus = [];

    const { suite } = this.options;
    await Promise.allSettled([suite.gps.stop(), suite.audio.stop(), suite.motion.stop()]);

    // Close any stop that was still open when the trip ended.
    this.closeStop(this.clock.elapsed());
    await this.flushChunk(true);
    await this.flushEvents();

    this.options.store.commit('status', 'idle');
    return this.result();
  }

  private result() {
    const sensorsUsed = (Object.keys(this.coverageTicks) as SensorKind[]).filter(
      (kind) => this.coverageTicks[kind] > 0,
    );
    const coverage: Record<SensorKind, number> = {
      gps: this.totalTicks > 0 ? this.coverageTicks.gps / this.totalTicks : 0,
      audio: this.totalTicks > 0 ? this.coverageTicks.audio / this.totalTicks : 0,
      motion: this.totalTicks > 0 ? this.coverageTicks.motion / this.totalTicks : 0,
    };
    return { samples: [...this.samples], events: [...this.allEvents], coverage, sensorsUsed };
  }

  /* --------------------------- visibility handling ------------------------ */

  /**
   * The page was hidden or shown.
   *
   * Sensors keep running, but store commits drop to a trickle — there is
   * nothing to render. On return, a gap longer than a few seconds is recorded
   * as an explicit event rather than silently inflating the "peaceful" time,
   * because iOS suspends pages and we must never claim to have been listening
   * when we were not.
   */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;

    if (hidden) {
      this.hiddenSince = Date.now();
      return;
    }

    if (this.hiddenSince !== null) {
      const durationMs = Date.now() - this.hiddenSince;
      if (durationMs >= STORAGE.minGapMs) {
        this.pushEvent({
          type: 'gap',
          source: 'derived',
          durationMs,
          reason: 'hidden',
          confidence: 1,
        });
      }
      this.hiddenSince = null;
    }
  }

  /* --------------------------------- tick --------------------------------- */

  private tick(tripTimeMs: number): void {
    const { suite, store } = this.options;
    this.totalTicks += 1;

    const gps = suite.gps.peek();
    const audio = suite.audio.peek();
    const motionSource = suite.motion as unknown as { drain?: (t: number) => unknown };
    const motion =
      typeof motionSource.drain === 'function'
        ? (motionSource.drain(tripTimeMs) as ReturnType<typeof suite.motion.peek>)
        : suite.motion.peek();

    let lat: number | null = null;
    let lon: number | null = null;
    let accuracy: number | null = null;
    let speed: number | null = null;
    let heading: number | null = null;
    let geohash: string | null = null;

    if (gps) {
      this.coverageTicks.gps += 1;
      const verdict = evaluateFix(this.lastGpsFix, gps);
      if (verdict.accepted) {
        if (verdict.distanceM > 0) this.metrics.addDistance(verdict.distanceM);
        this.lastGpsFix = gps;
      }

      lat = gps.lat;
      lon = gps.lon;
      accuracy = gps.accuracy;
      speed = gps.speed;
      heading = gps.heading;
      geohash = encodeGeohash(gps.lat, gps.lon, PRIVACY.contributionGeohashPrecision);

      this.maybeCommitRoute(gps, tripTimeMs);
    }

    let db = 0;
    let dbPeak = 0;
    if (audio) {
      this.coverageTicks.audio += 1;
      db = audio.rmsDb;
      dbPeak = audio.peakDb;
      this.metrics.addNoise(db, dbPeak);
      this.maybeCommitMeter(audio.rmsDb, audio.floorDb, audio.peakDb, tripTimeMs);
    }

    let aMag = 0;
    let aMax = 0;
    let jerk = 0;
    if (motion) {
      this.coverageTicks.motion += 1;
      aMag = motion.aMag;
      aMax = motion.aMax;
      jerk = motion.jerk;
      this.evaluateMotionEvents(motion, tripTimeMs, speed, lat, lon, geohash);
    }

    const moving = speed !== null ? speed >= 1.0 : aMag > 0.6;
    this.trackStops(moving, tripTimeMs, lat, lon, geohash);
    this.metrics.tick(tripTimeMs, SAMPLE_INTERVAL_MS, speed, moving);

    this.samples.push({
      t: tripTimeMs,
      lat,
      lon,
      acc: accuracy,
      spd: speed,
      hdg: heading,
      db,
      dbPk: dbPeak,
      aMag,
      aMax,
      jerk,
      mov: moving ? 1 : 0,
      gh: geohash,
    });

    // Metrics commit at 1 Hz normally, once a second when hidden — there is
    // nothing on screen to update, so the work would be pure battery cost.
    if (!this.hidden) {
      store.commit('metrics', this.metrics.snapshot(tripTimeMs));
    }

    void this.maybeCheckpoint(tripTimeMs);
  }

  /* -------------------------------- events -------------------------------- */

  private evaluateMotionEvents(
    motion: NonNullable<ReturnType<SensorSuite['motion']['peek']>>,
    tripTimeMs: number,
    speed: number | null,
    lat: number | null,
    lon: number | null,
    gh: string | null,
  ): void {
    // Below walking pace, "braking" is someone picking their phone up.
    const fastEnough = speed === null || speed >= MOTION.minSpeedForEventMps;

    if (
      fastEnough &&
      motion.minLongitudinal <= MOTION.hardBrakeMps2 &&
      tripTimeMs >= this.brakeRefractoryUntil
    ) {
      this.brakeRefractoryUntil = tripTimeMs + MOTION.refractoryMs;
      this.metrics.addBrake();
      this.pushEvent({
        type: 'brake',
        source: 'motion',
        severity: motion.minLongitudinal <= MOTION.severeBrakeMps2 ? 'severe' : 'hard',
        peakDecel: motion.minLongitudinal,
        speedBefore: speed,
        durationMs: MOTION.minBrakeDurationMs,
        confidence: 0.9,
        lat,
        lon,
        gh,
      });
    }

    if (
      fastEnough &&
      motion.maxLongitudinal >= MOTION.rapidAccelMps2 &&
      tripTimeMs >= this.accelRefractoryUntil
    ) {
      this.accelRefractoryUntil = tripTimeMs + MOTION.refractoryMs;
      this.metrics.addAccel();
      this.pushEvent({
        type: 'accel',
        source: 'motion',
        severity: motion.maxLongitudinal >= MOTION.aggressiveAccelMps2 ? 'aggressive' : 'rapid',
        peakAccel: motion.maxLongitudinal,
        durationMs: MOTION.minAccelDurationMs,
        confidence: 0.9,
        lat,
        lon,
        gh,
      });
    }
  }

  private trackStops(
    moving: boolean,
    tripTimeMs: number,
    lat: number | null,
    lon: number | null,
    gh: string | null,
  ): void {
    if (!moving && this.stopStartedAt === null) {
      this.stopStartedAt = tripTimeMs;
      return;
    }
    if (moving && this.stopStartedAt !== null) {
      this.closeStop(tripTimeMs, lat, lon, gh);
    }
  }

  private closeStop(
    tripTimeMs: number,
    lat: number | null = null,
    lon: number | null = null,
    gh: string | null = null,
  ): void {
    if (this.stopStartedAt === null) return;
    const durationMs = tripTimeMs - this.stopStartedAt;
    const startedAt = this.stopStartedAt;
    this.stopStartedAt = null;

    // A two-second pause at a junction is not an event worth recording.
    if (durationMs < STORAGE.minStopDurationMs) return;

    this.pushEvent(
      { type: 'stop', source: 'derived', durationMs, confidence: 1, lat, lon, gh },
      startedAt,
    );
  }

  private recordSound(
    detection: { t: number; sound: SoundEventType; confidence: number; scores: Partial<Record<SoundEventType, number>>; peakHz: number; db: number; durationMs: number },
    detector: SoundEventDetector,
  ): void {
    const fix = this.options.suite.gps.peek();
    this.metrics.addSound(detection.sound, detection.t);

    this.pushEvent(
      {
        type: 'sound',
        source: 'audio',
        sound: detection.sound,
        scores: detection.scores,
        db: detection.db,
        peakHz: detection.peakHz,
        durationMs: detection.durationMs,
        blasts: 1,
        detectorId: detector.id,
        detectorVersion: detector.version,
        confidence: detection.confidence,
        lat: fix?.lat ?? null,
        lon: fix?.lon ?? null,
        gh: fix ? encodeGeohash(fix.lat, fix.lon, PRIVACY.contributionGeohashPrecision) : null,
      },
      detection.t,
    );
  }

  /** The single writer for the event log. Assigns sequence and sync metadata. */
  private pushEvent(partial: TripEventDraft, tripTimeMs: number = this.clock.elapsed()): void {
    const event = {
      ...newSyncMeta(this.options.deviceId, Date.now()),
      id: newEventId(),
      tripId: this.tripId,
      seq: this.seq++,
      t: Math.round(tripTimeMs),
      lat: partial.lat ?? null,
      lon: partial.lon ?? null,
      gh: partial.gh ?? null,
      ...partial,
    } as TripEvent;

    this.allEvents.push(event);
    this.pendingEvents.push(event);

    // Events are rare, so committing on every one is cheap and keeps the live
    // ticker responsive.
    this.options.store.commit('events', this.allEvents.slice(-12));
  }

  /* ------------------------------- commits -------------------------------- */

  private maybeCommitRoute(fix: GpsFix, tripTimeMs: number): void {
    const moved = this.lastRoutePoint
      ? haversine(this.lastRoutePoint, { lat: fix.lat, lon: fix.lon })
      : Infinity;

    const dueByTime = tripTimeMs - this.lastRouteCommitAt >= COMMIT.route;
    const dueByDistance = moved >= COMMIT.routeMinDistanceM;
    if (!dueByTime && !dueByDistance) return;

    this.routePoints.push([fix.lat, fix.lon]);
    this.lastRoutePoint = { lat: fix.lat, lon: fix.lon };
    this.lastRouteCommitAt = tripTimeMs;

    if (this.hidden) return;
    this.options.store.commit('route', {
      points: this.routePoints,
      revision: this.routePoints.length,
    });
  }

  private maybeCommitMeter(db: number, floorDb: number, peakDb: number, tripTimeMs: number): void {
    if (this.hidden) return;
    if (tripTimeMs - this.lastMeterCommitAt < COMMIT.meter) return;
    this.lastMeterCommitAt = tripTimeMs;
    this.options.store.commit('meter', { db, floorDb, peakDb });
  }

  private commitSensors(): void {
    const active = (Object.keys(this.sensorStatuses) as SensorKind[]).filter(
      (kind) => this.sensorStatuses[kind] === 'live' || this.sensorStatuses[kind] === 'degraded',
    );
    this.options.store.commit('sensors', { statuses: { ...this.sensorStatuses }, active });
  }

  /* ------------------------------ persistence ----------------------------- */

  /**
   * Flush completed chunks and events periodically, so a crash or a killed tab
   * costs at most half a minute of a drive rather than the whole thing.
   */
  private async maybeCheckpoint(tripTimeMs: number): Promise<void> {
    if (tripTimeMs - this.lastCheckpointAt < CHECKPOINT_INTERVAL_MS) return;
    this.lastCheckpointAt = tripTimeMs;
    await this.flushChunk(false);
    await this.flushEvents();
  }

  private async flushChunk(final: boolean): Promise<void> {
    const start = this.chunkIndex * CHUNK_SIZE;
    const available = this.samples.length - start;
    if (available <= 0) return;
    if (!final && available < CHUNK_SIZE) return;

    const count = final ? available : Math.floor(available / CHUNK_SIZE) * CHUNK_SIZE;
    for (let offset = 0; offset < count; offset += CHUNK_SIZE) {
      const slice = this.samples.slice(start + offset, start + offset + CHUNK_SIZE);
      if (slice.length === 0) continue;

      const chunk: TripSampleChunk = {
        ...newSyncMeta(this.options.deviceId, Date.now()),
        tripId: this.tripId,
        chunk: this.chunkIndex,
        from: slice[0]!.t,
        to: slice[slice.length - 1]!.t,
        samples: slice,
      };
      this.chunkIndex += 1;
      await this.options.callbacks.onChunk(chunk);
    }
  }

  private async flushEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) return;
    const batch = this.pendingEvents.splice(0, this.pendingEvents.length);
    await this.options.callbacks.onEvents(batch);
  }

  /* --------------------------------- reads -------------------------------- */

  get sampleCount(): number {
    return this.samples.length;
  }

  get eventCount(): number {
    return this.allEvents.length;
  }

  get elapsedMs(): number {
    return this.clock.elapsed();
  }

  get route(): [number, number][] {
    return this.routePoints;
  }
}
