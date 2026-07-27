export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** Normalise `x` into 0..1 across [lo, hi], clamped at both ends. */
export function norm(x: number, lo: number, hi: number): number {
  if (hi === lo) return x >= hi ? 1 : 0;
  return clamp01((x - lo) / (hi - lo));
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = norm(x, edge0, edge1);
  return t * t * (3 - 2 * t);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Linear-interpolated percentile over an *unsorted* input. Copies before
 * sorting so callers can pass live buffers safely.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp01(p) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return lerp(sorted[lo]!, sorted[hi]!, idx - lo);
}

export const median = (values: readonly number[]): number => percentile(values, 0.5);

/** Root mean square. */
export function rms(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v * v;
  return Math.sqrt(sum / values.length);
}

/**
 * Energy-average a set of dB values.
 *
 * Averaging decibels arithmetically is wrong — they are logarithmic, so a
 * second at 100 dB and a second at 60 dB average to ~97 dB, not 80. Every
 * noise average in the app goes through here.
 */
export function energyAverageDb(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += Math.pow(10, v / 10);
  return 10 * Math.log10(sum / values.length);
}

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

export function round(value: number, places = 0): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Safe division that yields 0 rather than Infinity/NaN on a zero denominator. */
export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0;
  const out = numerator / denominator;
  return Number.isFinite(out) ? out : 0;
}
