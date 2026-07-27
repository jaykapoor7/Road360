import { GPS } from '@/lib/config/constants';
import { haversine } from '@/lib/geo/haversine';
import type { GpsFix } from './types';

/**
 * Derivations shared by the real and simulated pipelines.
 *
 * These live outside the sources themselves so that a simulated trip goes
 * through exactly the same filtering as a real one — otherwise demo mode would
 * flatter the app by feeding it data no phone ever produces.
 */

export interface GpsAcceptance {
  accepted: boolean;
  reason?: 'accuracy' | 'teleport' | 'too-soon';
  /** Distance to add to the trip total. Zero when below the jitter threshold. */
  distanceM: number;
  /** Speed derived from displacement, used when the fix reports none. */
  derivedSpeed: number | null;
}

/**
 * Decide whether a fix is real movement or noise.
 *
 * The displacement threshold is the important one: without it, GPS jitter while
 * parked at a light silently accumulates hundreds of metres, and a stationary
 * commute reports a kilometre of driving.
 */
export function evaluateFix(previous: GpsFix | null, fix: GpsFix): GpsAcceptance {
  if (fix.accuracy > GPS.maxAccuracyM) {
    return { accepted: false, reason: 'accuracy', distanceM: 0, derivedSpeed: null };
  }

  if (!previous) {
    return { accepted: true, distanceM: 0, derivedSpeed: null };
  }

  const dt = (fix.t - previous.t) / 1000;
  if (dt <= 0 || fix.t - previous.t < GPS.minFixIntervalMs) {
    return { accepted: false, reason: 'too-soon', distanceM: 0, derivedSpeed: null };
  }

  const displacement = haversine(
    { lat: previous.lat, lon: previous.lon },
    { lat: fix.lat, lon: fix.lon },
  );
  const impliedSpeed = displacement / dt;

  // Tower-based fixes can jump kilometres between samples.
  if (impliedSpeed > GPS.maxPlausibleSpeedMps) {
    return { accepted: false, reason: 'teleport', distanceM: 0, derivedSpeed: null };
  }

  const threshold = Math.max(GPS.minDisplacementM, fix.accuracy * GPS.accuracyFactor);
  const counts = displacement > threshold;

  return {
    accepted: true,
    distanceM: counts ? displacement : 0,
    derivedSpeed: counts ? impliedSpeed : 0,
  };
}

export const isMoving = (speedMps: number | null): boolean =>
  speedMps !== null && speedMps >= GPS.movingSpeedMps;

/* ------------------------------ motion maths ----------------------------- */

export interface GravityEstimate {
  x: number;
  y: number;
  z: number;
}

/** Per-axis EWMA. Gravity is the slow component of the accelerometer signal. */
export function updateGravity(
  current: GravityEstimate | null,
  x: number,
  y: number,
  z: number,
  alpha: number,
): GravityEstimate {
  if (!current) return { x, y, z };
  return {
    x: current.x + alpha * (x - current.x),
    y: current.y + alpha * (y - current.y),
    z: current.z + alpha * (z - current.z),
  };
}

export interface LinearAcceleration {
  x: number;
  y: number;
  z: number;
  magnitude: number;
}

export function removeGravity(
  x: number,
  y: number,
  z: number,
  gravity: GravityEstimate,
): LinearAcceleration {
  const lx = x - gravity.x;
  const ly = y - gravity.y;
  const lz = z - gravity.z;
  return { x: lx, y: ly, z: lz, magnitude: Math.hypot(lx, ly, lz) };
}

/**
 * Project linear acceleration onto the vehicle's forward axis.
 *
 * A phone in a cupholder, a cradle and a pocket all have different
 * orientations, so raw axes are meaningless. The forward axis is estimated as
 * the direction of greatest variance in the horizontal plane — which, over a
 * few seconds of driving, is the axis you accelerate and brake along.
 */
export function projectLongitudinal(
  samples: readonly LinearAcceleration[],
): { axis: { x: number; y: number; z: number }; values: number[] } {
  if (samples.length === 0) {
    return { axis: { x: 1, y: 0, z: 0 }, values: [] };
  }

  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const s of samples) {
    mx += s.x;
    my += s.y;
    mz += s.z;
  }
  mx /= samples.length;
  my /= samples.length;
  mz /= samples.length;

  // Power iteration on the covariance matrix — three passes is ample for a
  // dominant axis and far cheaper than a full eigendecomposition.
  let vx = 1;
  let vy = 0;
  let vz = 0;

  for (let iter = 0; iter < 3; iter++) {
    let nx = 0;
    let ny = 0;
    let nz = 0;

    for (const s of samples) {
      const dx = s.x - mx;
      const dy = s.y - my;
      const dz = s.z - mz;
      const dot = dx * vx + dy * vy + dz * vz;
      nx += dx * dot;
      ny += dy * dot;
      nz += dz * dot;
    }

    const norm = Math.hypot(nx, ny, nz);
    if (norm < 1e-9) break;
    vx = nx / norm;
    vy = ny / norm;
    vz = nz / norm;
  }

  const values = samples.map((s) => s.x * vx + s.y * vy + s.z * vz);
  return { axis: { x: vx, y: vy, z: vz }, values };
}

/** RMS of the first difference — how abruptly acceleration is changing. */
export function jerkRms(values: readonly number[], dtSeconds: number): number {
  if (values.length < 2 || dtSeconds <= 0) return 0;
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    const d = (values[i]! - values[i - 1]!) / dtSeconds;
    sum += d * d;
  }
  return Math.sqrt(sum / (values.length - 1));
}
