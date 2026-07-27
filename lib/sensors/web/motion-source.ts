import { BaseSensorSource, type MotionReading } from '../types';
import type { SensorError, SensorKind } from '@/lib/domain/sensors';
import { Err, Ok, type Result } from '@/lib/utils/result';
import { MotionRingBuffer } from '../ring-buffer';
import {
  jerkRms,
  projectLongitudinal,
  removeGravity,
  updateGravity,
  type GravityEstimate,
  type LinearAcceleration,
} from '../derive';
import { MOTION } from '@/lib/config/constants';

/** iOS 13+ exposes a permission gate that older type definitions do not describe. */
interface DeviceMotionEventWithPermission {
  requestPermission?: () => Promise<PermissionState>;
}

export class WebMotionSource extends BaseSensorSource<MotionReading> {
  readonly kind: SensorKind = 'motion';

  private readonly ring = new MotionRingBuffer(MOTION.ringCapacity);
  private gravity: GravityEstimate | null = null;
  private handler: ((event: DeviceMotionEvent) => void) | null = null;
  private lastEventAt = 0;
  private lastDrainT = 0;
  private eventCount = 0;
  /** Native delivery rate, halved above 60 Hz. */
  private decimate = 1;
  private decimateCounter = 0;

  async start(): Promise<Result<void, SensorError>> {
    if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') {
      this.setStatus('unsupported');
      return Err({ kind: 'motion', code: 'unsupported', message: 'Motion is not available.' });
    }

    this.setStatus('starting');

    // The handler is deliberately trivial: two array writes and nothing else.
    // All interpretation happens once per second in `drain()`.
    this.handler = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      this.eventCount += 1;
      if (this.decimate > 1) {
        this.decimateCounter = (this.decimateCounter + 1) % this.decimate;
        if (this.decimateCounter !== 0) return;
      }

      const now = performance.now();
      this.ring.push(acc.x, acc.y, acc.z, now);
      this.lastEventAt = now;
    };

    window.addEventListener('devicemotion', this.handler, { passive: true });

    // If nothing arrives, motion is effectively unavailable regardless of what
    // the permission API claims — notably on iOS, where a granted permission
    // does not always survive a new page load.
    const alive = await this.waitForFirstEvent(2000);
    if (!alive) {
      this.setStatus('unsupported');
      return Err({
        kind: 'motion',
        code: 'unsupported',
        message: 'No motion events were received.',
      });
    }

    this.setStatus('live');
    return Ok(undefined);
  }

  private waitForFirstEvent(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        if (this.ring.size > 0) return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(check, 100);
      };
      check();
    });
  }

  /**
   * Collapse the last second of raw samples into one reading.
   *
   * Called by the assembler on the master clock, not by the event handler —
   * doing this work 50 times a second would be pointless and expensive.
   */
  drain(nowMs: number): MotionReading | null {
    const samples: LinearAcceleration[] = [];
    const since = this.lastDrainT;

    this.ring.forEachSince(since, (x, y, z) => {
      this.gravity = updateGravity(this.gravity, x, y, z, MOTION.gravityAlpha);
      samples.push(removeGravity(x, y, z, this.gravity));
    });

    this.lastDrainT = this.lastEventAt;

    // Observed rate is well above what we need; halve it to save wakeups.
    if (this.eventCount > 70) this.decimate = 2;
    this.eventCount = 0;

    if (samples.length === 0) return null;

    let aMagSum = 0;
    let aMax = 0;
    for (const s of samples) {
      aMagSum += s.magnitude;
      if (s.magnitude > aMax) aMax = s.magnitude;
    }

    const { values } = projectLongitudinal(samples);
    let minLong = 0;
    let maxLong = 0;
    let longSum = 0;
    for (const v of values) {
      longSum += v;
      if (v < minLong) minLong = v;
      if (v > maxLong) maxLong = v;
    }

    const dt = 1 / Math.max(1, samples.length);
    const reading: MotionReading = {
      t: nowMs,
      aMag: aMagSum / samples.length,
      aMax,
      jerk: jerkRms(values, dt),
      longitudinal: values.length > 0 ? longSum / values.length : 0,
      minLongitudinal: minLong,
      maxLongitudinal: maxLong,
    };

    this.latest = reading;
    return reading;
  }

  async stop(): Promise<void> {
    if (this.handler) {
      window.removeEventListener('devicemotion', this.handler);
      this.handler = null;
    }
    this.ring.clear();
    this.gravity = null;
    this.setStatus('idle');
  }

  /**
   * iOS requires this inside a user gesture, and any `await` beforehand loses
   * the activation. Callers must invoke it as the first statement of a click
   * handler — see `PermissionWizard`.
   */
  static async requestIosPermission(): Promise<PermissionState> {
    const ctor = DeviceMotionEvent as unknown as DeviceMotionEventWithPermission;
    if (typeof ctor.requestPermission !== 'function') return 'granted';
    try {
      return await ctor.requestPermission();
    } catch {
      return 'denied';
    }
  }

  static needsExplicitPermission(): boolean {
    if (typeof DeviceMotionEvent === 'undefined') return false;
    const ctor = DeviceMotionEvent as unknown as DeviceMotionEventWithPermission;
    return typeof ctor.requestPermission === 'function';
  }
}
