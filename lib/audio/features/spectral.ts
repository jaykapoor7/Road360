/**
 * Spectral features shared by every detector class.
 *
 * All of these take a precomputed magnitude spectrum and a bin width, and none
 * allocate — they run on every audio hop for the length of a drive.
 */

export const binForHz = (hz: number, binWidth: number): number => Math.round(hz / binWidth);

/** Summed energy (magnitude²) across a frequency band. */
export function bandEnergy(
  magnitudes: Float32Array,
  binWidth: number,
  loHz: number,
  hiHz: number,
): number {
  const lo = Math.max(0, binForHz(loHz, binWidth));
  const hi = Math.min(magnitudes.length - 1, binForHz(hiHz, binWidth));
  let energy = 0;
  for (let i = lo; i <= hi; i++) energy += magnitudes[i]! * magnitudes[i]!;
  return energy;
}

export interface PeakInfo {
  bin: number;
  hz: number;
  magnitude: number;
}

/** Largest bin within a band. */
export function findPeak(
  magnitudes: Float32Array,
  binWidth: number,
  loHz: number,
  hiHz: number,
): PeakInfo {
  const lo = Math.max(0, binForHz(loHz, binWidth));
  const hi = Math.min(magnitudes.length - 1, binForHz(hiHz, binWidth));

  let bin = lo;
  let magnitude = -Infinity;
  for (let i = lo; i <= hi; i++) {
    const m = magnitudes[i]!;
    if (m > magnitude) {
      magnitude = m;
      bin = i;
    }
  }
  return { bin, hz: bin * binWidth, magnitude: magnitude === -Infinity ? 0 : magnitude };
}

/** Median magnitude across a band. Used as the reference for peak prominence. */
export function bandMedian(
  magnitudes: Float32Array,
  binWidth: number,
  loHz: number,
  hiHz: number,
  scratch: number[],
): number {
  const lo = Math.max(0, binForHz(loHz, binWidth));
  const hi = Math.min(magnitudes.length - 1, binForHz(hiHz, binWidth));

  scratch.length = 0;
  for (let i = lo; i <= hi; i++) scratch.push(magnitudes[i]!);
  if (scratch.length === 0) return 0;

  scratch.sort((a, b) => a - b);
  const mid = scratch.length >> 1;
  return scratch.length % 2 === 0 ? (scratch[mid - 1]! + scratch[mid]!) / 2 : scratch[mid]!;
}

/**
 * Ratio of the strongest peak to the band median.
 *
 * This is the "is anything actually sticking out" test. Broadband road and wind
 * noise has a prominence near 1; a horn's fundamental is 10–30× the median.
 */
export function peakProminence(peak: PeakInfo, median: number): number {
  if (median <= 1e-12) return peak.magnitude > 1e-9 ? 100 : 0;
  return peak.magnitude / median;
}

/**
 * Spectral flatness (Wiener entropy): geometric mean over arithmetic mean.
 *
 * Near 1 for noise, near 0 for a pure tone. The single cheapest way to tell a
 * tonal event from tyre roar.
 */
export function spectralFlatness(
  magnitudes: Float32Array,
  binWidth: number,
  loHz: number,
  hiHz: number,
): number {
  const lo = Math.max(1, binForHz(loHz, binWidth));
  const hi = Math.min(magnitudes.length - 1, binForHz(hiHz, binWidth));
  if (hi <= lo) return 1;

  let logSum = 0;
  let sum = 0;
  let count = 0;

  for (let i = lo; i <= hi; i++) {
    const m = Math.max(magnitudes[i]!, 1e-12);
    logSum += Math.log(m);
    sum += m;
    count += 1;
  }
  if (count === 0) return 1;

  const geometric = Math.exp(logSum / count);
  const arithmetic = sum / count;
  return arithmetic <= 1e-12 ? 1 : Math.min(1, geometric / arithmetic);
}

/** Energy-weighted mean frequency. A siren's centroid sweeps; a horn's does not. */
export function spectralCentroid(
  magnitudes: Float32Array,
  binWidth: number,
  loHz: number,
  hiHz: number,
): number {
  const lo = Math.max(0, binForHz(loHz, binWidth));
  const hi = Math.min(magnitudes.length - 1, binForHz(hiHz, binWidth));

  let weighted = 0;
  let total = 0;
  for (let i = lo; i <= hi; i++) {
    const m = magnitudes[i]!;
    weighted += m * i * binWidth;
    total += m;
  }
  return total <= 1e-12 ? 0 : weighted / total;
}

/**
 * How many of harmonics 2f₀…4f₀ are present above `threshold × fundamental`.
 *
 * A car horn is not a sine wave — it is a chord of two reeds with a strong
 * harmonic stack. Requiring harmonics rejects tonal-but-inharmonic sources like
 * reversing beepers reasonably well.
 */
export function harmonicScore(
  magnitudes: Float32Array,
  binWidth: number,
  fundamentalHz: number,
  fundamentalMag: number,
  threshold = 0.25,
  tolerance = 3,
): number {
  if (fundamentalHz <= 0 || fundamentalMag <= 1e-12) return 0;

  let matched = 0;
  const harmonics = [2, 3, 4];

  for (const n of harmonics) {
    const centre = binForHz(fundamentalHz * n, binWidth);
    if (centre >= magnitudes.length) continue;

    let best = 0;
    const lo = Math.max(0, centre - tolerance);
    const hi = Math.min(magnitudes.length - 1, centre + tolerance);
    for (let i = lo; i <= hi; i++) {
      if (magnitudes[i]! > best) best = magnitudes[i]!;
    }
    if (best >= fundamentalMag * threshold) matched += 1;
  }

  return matched / harmonics.length;
}
