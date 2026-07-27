import { FFT, amplitudeToDb, bufferPeak, bufferRms } from '../features/fft';
import {
  extractFeatures,
  extractTemporal,
  FEATURE_COUNT,
  INPUT_SIZE,
  type ModelClass,
} from '../features/feature-vector';
import { spectralCentroid, findPeak } from '../features/spectral';

/**
 * Synthetic training corpus.
 *
 * Being honest about what this is: the classifier is trained on *synthesised*
 * audio, not field recordings. That bounds what it can learn — it will be good
 * at the acoustic structure these generators express (harmonic stacks, pitch
 * stability, sweep, band placement) and it has never heard a real street.
 *
 * It is still a meaningful improvement over the hand-tuned heuristic, because
 * it learns the decision boundary between those structures rather than having
 * one hand-written per class, and it is measured on held-out samples with
 * randomised parameters. Retraining on real labelled audio is a matter of
 * replacing this file — everything downstream is unchanged.
 */

export const SAMPLE_RATE = 16_000;
export const FFT_SIZE = 1024;
export const HOP_MS = 50;

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: Rng, lo: number, hi: number): number => lo + rng() * (hi - lo);

export interface Sample {
  features: Float32Array;
  label: ModelClass;
}

type Signal = (t: number) => number;

/**
 * A car horn: two reeds a rough minor third apart with a strong harmonic
 * stack, holding a steady pitch.
 */
function hornSignal(rng: Rng): { signal: Signal; durationMs: number; drift: number } {
  const f0 = between(rng, 330, 520);
  const ratio = between(rng, 1.15, 1.28);
  const h2 = between(rng, 0.25, 0.45);
  const h3 = between(rng, 0.12, 0.3);
  const h4 = between(rng, 0.05, 0.2);
  // Real horns wobble a few Hz; perfectly rigid pitch would be a giveaway.
  const drift = between(rng, 0, 25);

  return {
    signal: (t) => {
      const f = f0 + Math.sin(t * 3) * drift;
      return (
        0.6 * Math.sin(2 * Math.PI * f * t) +
        0.45 * Math.sin(2 * Math.PI * f * ratio * t) +
        h2 * Math.sin(2 * Math.PI * f * 2 * t) +
        h3 * Math.sin(2 * Math.PI * f * 3 * t) +
        h4 * Math.sin(2 * Math.PI * f * 4 * t)
      );
    },
    durationMs: between(rng, 250, 1800),
    drift,
  };
}

/** A siren: tonal like a horn, but the pitch sweeps continuously. */
function sirenSignal(rng: Rng): { signal: Signal; durationMs: number; drift: number } {
  const lo = between(rng, 450, 700);
  const hi = between(rng, 1100, 1700);
  const rate = between(rng, 0.25, 0.9);

  return {
    signal: (t) => {
      const f = lo + (hi - lo) * (0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t));
      return 0.6 * Math.sin(2 * Math.PI * f * t) + 0.28 * Math.sin(2 * Math.PI * f * 2 * t);
    },
    durationMs: between(rng, 2200, 4000),
    drift: hi - lo,
  };
}

/** A whistle: high, narrow-band, effectively no harmonic structure. */
function whistleSignal(rng: Rng): { signal: Signal; durationMs: number; drift: number } {
  const f = between(rng, 2200, 4800);
  const vibrato = between(rng, 0, 40);

  return {
    signal: (t) => 0.7 * Math.sin(2 * Math.PI * (f + Math.sin(t * 6) * vibrato) * t),
    durationMs: between(rng, 300, 1500),
    drift: vibrato,
  };
}

/**
 * The negative class: everything that must NOT register as an event.
 * Road roar, wind, engine rumble, speech-like formants, and music-like chords —
 * the last two matter because they are tonal and would fool a naive tonality test.
 */
function noiseSignal(rng: Rng): { signal: Signal; durationMs: number; drift: number } {
  const kind = Math.floor(rng() * 7);
  const noise = () => rng() * 2 - 1;

  switch (kind) {
    case 5: {
      // Reversing beeper: a steady tone in or just above the horn band, but a
      // near-pure single partial with no harmonic stack. The heuristic's
      // documented false positive.
      //
      // Deliberately NOT gated on/off. The segmenter closes a candidate at the
      // first loudness gap, so it only ever hands the classifier ONE beep —
      // training on the full gated sequence (including its silences) taught the
      // model to average features across silence, a distribution it never sees
      // at inference. Match what the segmenter actually delivers.
      const f = between(rng, 700, 1600);
      return {
        signal: (t) =>
          0.65 * Math.sin(2 * Math.PI * f * t) +
          // A trace of second harmonic at most; nothing like a horn's stack.
          between(rng, 0, 0.06) * Math.sin(2 * Math.PI * f * 2 * t),
        durationMs: between(rng, 200, 900),
        drift: 0,
      };
    }
    case 6: {
      // Brass-like: harmonic stack in the horn band. Acoustically very close to
      // a horn; separated mainly by note changes over time.
      const f0 = between(rng, 300, 550);
      const step = between(rng, 0, 1) > 0.5 ? 1.26 : 1.5;
      return {
        signal: (t) => {
          // Changes note partway through, which a horn never does.
          const f = t > 0.7 ? f0 * step : f0;
          return (
            0.5 * Math.sin(2 * Math.PI * f * t) +
            0.3 * Math.sin(2 * Math.PI * f * 2 * t) +
            0.18 * Math.sin(2 * Math.PI * f * 3 * t) +
            noise() * 0.15
          );
        },
        durationMs: between(rng, 900, 3000),
        drift: f0 * (step - 1),
      };
    }
    case 0: // broadband road roar
      return { signal: () => noise() * 0.8, durationMs: between(rng, 300, 3000), drift: 0 };
    case 1: {
      // engine rumble: low fundamental, weak harmonics, plus noise
      const f = between(rng, 60, 160);
      return {
        signal: (t) =>
          0.5 * Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * f * 2 * t) + noise() * 0.4,
        durationMs: between(rng, 500, 3000),
        drift: between(rng, 0, 30),
      };
    }
    case 2: {
      // speech-like: shifting formants, unstable pitch
      const f0 = between(rng, 90, 250);
      return {
        signal: (t) => {
          const wobble = f0 * (1 + 0.25 * Math.sin(t * 18));
          return (
            0.4 * Math.sin(2 * Math.PI * wobble * t) +
            0.3 * Math.sin(2 * Math.PI * between(rng, 500, 1200) * t) +
            noise() * 0.35
          );
        },
        durationMs: between(rng, 400, 2500),
        drift: between(rng, 80, 300),
      };
    }
    case 3: {
      // music-like chord: tonal and harmonic, but inharmonic intervals
      const root = between(rng, 200, 600);
      return {
        signal: (t) =>
          0.35 * Math.sin(2 * Math.PI * root * t) +
          0.3 * Math.sin(2 * Math.PI * root * 1.26 * t) +
          0.3 * Math.sin(2 * Math.PI * root * 1.5 * t) +
          noise() * 0.2,
        durationMs: between(rng, 800, 4000),
        drift: between(rng, 20, 150),
      };
    }
    default: {
      // wind: filtered noise that drifts in level
      let last = 0;
      return {
        signal: () => {
          last = last * 0.92 + noise() * 0.4;
          return last;
        },
        durationMs: between(rng, 500, 3000),
        drift: 0,
      };
    }
  }
}

const GENERATORS: Record<ModelClass, (rng: Rng) => { signal: Signal; durationMs: number; drift: number }> = {
  horn: hornSignal,
  siren: sirenSignal,
  whistle: whistleSignal,
  noise: noiseSignal,
};

/**
 * A traffic background bed — road roar plus engine rumble.
 *
 * Every example is mixed over one of these. A horn heard in silence is a
 * laboratory signal; a horn heard over traffic is the actual problem, and a
 * model trained on the former learns a boundary that does not exist on a road.
 */
function backgroundBed(rng: Rng): Signal {
  const engineF = between(rng, 60, 170);
  const engineLevel = between(rng, 0.15, 0.5);
  const roarLevel = between(rng, 0.3, 0.9);
  let lowpass = 0;

  return (t) => {
    const white = rng() * 2 - 1;
    // A one-pole lowpass gives the noise a road-like spectral tilt rather than
    // a flat white spectrum, which is far easier to tell a tone from.
    lowpass = lowpass * 0.85 + white * 0.15;
    return (
      roarLevel * (lowpass * 2.2 + white * 0.35) +
      engineLevel * (Math.sin(2 * Math.PI * engineF * t) + 0.4 * Math.sin(2 * Math.PI * engineF * 2 * t))
    );
  };
}

/**
 * Render one labelled example: synthesise the sound over a traffic bed at a
 * randomised signal-to-noise ratio, run it through the real FFT, average
 * per-frame features across the event, and append the temporal features. This
 * is exactly the path inference takes, which keeps training and runtime in
 * agreement.
 */
export function generateSample(label: ModelClass, rng: Rng, fft: FFT): Sample {
  const { signal, durationMs } = GENERATORS[label](rng);
  const bed = backgroundBed(rng);

  // Randomised absolute gain, so the model cannot key on level.
  const gain = between(rng, 0.25, 1.0);
  const floorAmp = between(rng, 0.002, 0.05);

  /**
   * SNR spans marginal to effectively clean (~45 dB).
   *
   * The full range matters, and the top of it was a real bug: training only on
   * bedded audio (1–22 dB) produced a model that misclassified a *clean* tone,
   * because it had never seen one. A detector meets both — a horn across a
   * quiet street and a horn in heavy traffic — so the training distribution has
   * to cover both. The comparison test caught this.
   *
   * The negative class keeps its foreground: those are the hard confusers
   * (beepers, brass, speech) and they appear at every SNR too.
   */
  const snrDb = between(rng, 1, 45);
  const bedLevel = gain / Math.pow(10, snrDb / 20);

  const hops = Math.max(3, Math.round(durationMs / HOP_MS));
  const hopSamples = Math.round((SAMPLE_RATE * HOP_MS) / 1000);

  const buffer = new Float32Array(FFT_SIZE);
  const magnitudes = new Float32Array(FFT_SIZE / 2);
  const accum = new Float32Array(FEATURE_COUNT);
  const frameFeatures = new Float32Array(FEATURE_COUNT);
  const scratch: number[] = [];

  const centroids: number[] = [];
  const peaks: number[] = [];
  const levels: number[] = [];

  // The ambient floor the detector would have measured just before the event.
  const floorDb = amplitudeToDb(floorAmp * 0.6);

  for (let h = 0; h < hops; h++) {
    for (let i = 0; i < FFT_SIZE; i++) {
      const t = (h * hopSamples + i) / SAMPLE_RATE;
      buffer[i] = signal(t) * gain + bed(t) * bedLevel + (rng() * 2 - 1) * floorAmp;
    }

    fft.magnitudes(buffer, magnitudes);
    const binHz = fft.binWidth(SAMPLE_RATE);
    const peakDb = amplitudeToDb(bufferPeak(buffer));

    extractFeatures({ magnitudes, binHz, peakDb, floorDb }, frameFeatures, scratch);
    for (let i = 0; i < FEATURE_COUNT; i++) accum[i] = accum[i]! + frameFeatures[i]!;

    centroids.push(spectralCentroid(magnitudes, binHz, 100, 8000));
    peaks.push(findPeak(magnitudes, binHz, 100, 8000).hz);
    levels.push(amplitudeToDb(bufferRms(buffer)));
  }

  const features = new Float32Array(INPUT_SIZE);
  for (let i = 0; i < FEATURE_COUNT; i++) features[i] = accum[i]! / hops;

  extractTemporal(
    {
      pitchDriftHz: Math.max(...peaks) - Math.min(...peaks),
      centroidStdHz: standardDeviation(centroids),
      durationMs,
      levelRangeDb: Math.max(...levels) - Math.min(...levels),
    },
    features,
    FEATURE_COUNT,
  );

  return { features, label };
}

export function buildDataset(countPerClass: number, seed: number): Sample[] {
  const rng = mulberry32(seed);
  const fft = new FFT(FFT_SIZE);
  const samples: Sample[] = [];

  for (const label of ['horn', 'siren', 'whistle', 'noise'] as ModelClass[]) {
    // The negative class gets extra weight: false positives are the failure
    // mode that destroys trust in a horn count.
    const n = label === 'noise' ? countPerClass * 2 : countPerClass;
    for (let i = 0; i < n; i++) samples.push(generateSample(label, rng, fft));
  }

  // Shuffle so batches are not class-ordered.
  for (let i = samples.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [samples[i], samples[j]] = [samples[j]!, samples[i]!];
  }

  return samples;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
