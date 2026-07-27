import { FFT, amplitudeToDb, bufferPeak, bufferRms } from '@/lib/audio/features/fft';
import { NoiseFloorEstimator } from '@/lib/audio/features/noise-floor';
import type { DetectorFrame } from '@/lib/audio/types';
import { AUDIO } from '@/lib/config/constants';

/**
 * Synthesised audio for detector tests.
 *
 * The detector is judged on what it does with signals whose ground truth we
 * control: a harmonic-stacked steady tone (horn), a sweeping tone (siren),
 * a high pure tone (whistle), and white noise (road, which must produce
 * nothing at all).
 */

export const SAMPLE_RATE = 16_000;
export const FFT_SIZE = 1024;
export const HOP_MS = 50;
const HOP_SAMPLES = Math.round((SAMPLE_RATE * HOP_MS) / 1000);

export interface SynthOptions {
  durationMs: number;
  amplitude?: number;
  noiseAmplitude?: number;
}

type Signal = (tSeconds: number) => number;

/** A car horn: two-reed chord with a strong harmonic stack. */
export function hornSignal(fundamental = 440): Signal {
  return (t) =>
    0.6 * Math.sin(2 * Math.PI * fundamental * t) +
    0.45 * Math.sin(2 * Math.PI * fundamental * 1.19 * t) + // second reed, a minor third up
    0.3 * Math.sin(2 * Math.PI * fundamental * 2 * t) +
    0.2 * Math.sin(2 * Math.PI * fundamental * 3 * t) +
    0.12 * Math.sin(2 * Math.PI * fundamental * 4 * t);
}

/** A siren: same tonal character, but the pitch sweeps. */
export function sirenSignal(lo = 500, hi = 1400, sweepHz = 0.5): Signal {
  return (t) => {
    const f = lo + (hi - lo) * (0.5 + 0.5 * Math.sin(2 * Math.PI * sweepHz * t));
    return 0.6 * Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t);
  };
}

/** A whistle: high, narrow-band, essentially no harmonics. */
export function whistleSignal(frequency = 3200): Signal {
  return (t) => 0.7 * Math.sin(2 * Math.PI * frequency * t);
}

export const silence: Signal = () => 0;

/** Broadband road noise — the thing that must never register as an event. */
export function whiteNoise(rng: () => number): Signal {
  return () => rng() * 2 - 1;
}

/** Deterministic RNG so detector tests never flake. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Segment {
  signal: Signal;
  durationMs: number;
  amplitude?: number;
}

/**
 * Render a sequence of segments into detector frames, maintaining the same
 * noise-floor estimator the real pipeline uses so the loudness gate behaves
 * identically.
 */
export function renderFrames(segments: readonly Segment[], noiseFloorAmp = 0.006): DetectorFrame[] {
  const fft = new FFT(FFT_SIZE);
  const binHz = fft.binWidth(SAMPLE_RATE);
  const floorEstimator = new NoiseFloorEstimator(
    Math.round(AUDIO.noiseFloorWindowMs / HOP_MS),
    Math.round(AUDIO.noiseFloorEwmaMs / HOP_MS),
  );
  const rng = mulberry32(1234);

  const frames: DetectorFrame[] = [];
  const buffer = new Float32Array(FFT_SIZE);
  let sampleIndex = 0;
  let tMs = 0;

  for (const segment of segments) {
    const hops = Math.max(1, Math.round(segment.durationMs / HOP_MS));
    const amp = segment.amplitude ?? 1;

    for (let h = 0; h < hops; h++) {
      for (let i = 0; i < FFT_SIZE; i++) {
        const t = (sampleIndex + i) / SAMPLE_RATE;
        const floorNoise = (rng() * 2 - 1) * noiseFloorAmp;
        buffer[i] = segment.signal(t) * amp + floorNoise;
      }

      const magnitudes = new Float32Array(FFT_SIZE / 2);
      fft.magnitudes(buffer, magnitudes);

      const rmsDb = amplitudeToDb(bufferRms(buffer));
      const peakDb = amplitudeToDb(bufferPeak(buffer));
      const floorDb = floorEstimator.push(rmsDb);

      frames.push({
        t: tMs,
        sampleRate: SAMPLE_RATE,
        fftSize: FFT_SIZE,
        binHz,
        magnitudes,
        rmsDb,
        peakDb,
        floorDb,
      });

      sampleIndex += HOP_SAMPLES;
      tMs += HOP_MS;
    }
  }

  return frames;
}
