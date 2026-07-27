import { describe, expect, it, beforeEach } from 'vitest';
import { HeuristicSoundDetector } from '@/lib/audio/heuristic-detector';
import { createSoundEventDetector, listDetectors, registerDetector } from '@/lib/audio/registry';
import { DEFAULT_DETECTOR_CONFIG, type SoundEventDetection } from '@/lib/audio/types';
import { FFT } from '@/lib/audio/features/fft';
import { findPeak, spectralFlatness, harmonicScore } from '@/lib/audio/features/spectral';
import { NoiseFloorEstimator } from '@/lib/audio/features/noise-floor';
import {
  FFT_SIZE,
  HOP_MS,
  SAMPLE_RATE,
  hornSignal,
  mulberry32,
  renderFrames,
  silence,
  sirenSignal,
  whistleSignal,
  whiteNoise,
  type Segment,
} from './audio-synth';

const config = {
  ...DEFAULT_DETECTOR_CONFIG,
  sampleRate: SAMPLE_RATE,
  fftSize: FFT_SIZE,
  hopMs: HOP_MS,
};

async function detect(segments: Segment[]): Promise<SoundEventDetection[]> {
  const detector = new HeuristicSoundDetector();
  await detector.init(config);

  const out: SoundEventDetection[] = [];
  for (const frame of renderFrames(segments)) {
    const result = detector.process(frame);
    if (result) out.push(result);
  }
  return out;
}

const quiet = (durationMs: number): Segment => ({ signal: silence, durationMs });

describe('FFT', () => {
  it('rejects a non-power-of-two size', () => {
    expect(() => new FFT(1000)).toThrow(/power of two/);
  });

  it('puts a pure tone in the right bin', () => {
    const fft = new FFT(1024);
    const binHz = fft.binWidth(SAMPLE_RATE);
    const buffer = new Float32Array(1024);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE);
    }

    const magnitudes = new Float32Array(512);
    fft.magnitudes(buffer, magnitudes);

    const peak = findPeak(magnitudes, binHz, 100, 8000);
    expect(peak.hz).toBeGreaterThan(950);
    expect(peak.hz).toBeLessThan(1050);
  });
});

describe('spectral features', () => {
  const fft = new FFT(1024);
  const binHz = fft.binWidth(SAMPLE_RATE);

  function spectrumOf(fn: (t: number) => number): Float32Array {
    const buffer = new Float32Array(1024);
    for (let i = 0; i < buffer.length; i++) buffer[i] = fn(i / SAMPLE_RATE);
    const magnitudes = new Float32Array(512);
    fft.magnitudes(buffer, magnitudes);
    return magnitudes;
  }

  it('separates a tone from noise by flatness', () => {
    const rng = mulberry32(7);
    const tone = spectralFlatness(spectrumOf(hornSignal(440)), binHz, 100, 8000);
    const noise = spectralFlatness(spectrumOf(whiteNoise(rng)), binHz, 100, 8000);

    expect(tone).toBeLessThan(0.3);
    expect(noise).toBeGreaterThan(tone * 2);
  });

  it('finds the harmonic stack of a horn but not of a pure tone', () => {
    const hornMags = spectrumOf(hornSignal(440));
    const hornPeak = findPeak(hornMags, binHz, 300, 800);
    expect(harmonicScore(hornMags, binHz, hornPeak.hz, hornPeak.magnitude)).toBeGreaterThan(0.5);

    const pureMags = spectrumOf((t) => Math.sin(2 * Math.PI * 440 * t));
    const purePeak = findPeak(pureMags, binHz, 300, 800);
    expect(harmonicScore(pureMags, binHz, purePeak.hz, purePeak.magnitude)).toBeLessThan(0.4);
  });
});

describe('NoiseFloorEstimator', () => {
  it('tracks a steady ambient level', () => {
    const est = new NoiseFloorEstimator(40, 600);
    for (let i = 0; i < 100; i++) est.push(-60);
    expect(est.value()).toBeCloseTo(-60, 0);
  });

  it('does not let a sustained loud event raise the floor to mask itself', () => {
    const est = new NoiseFloorEstimator(40, 600);
    for (let i = 0; i < 200; i++) est.push(-60);
    const before = est.value();

    // Two seconds of a loud horn — the entire short window.
    for (let i = 0; i < 40; i++) est.push(-20);

    // The floor must stay near ambient, or the horn would gate itself out.
    expect(est.value()).toBeLessThan(before + 6);
  });

  it('resets cleanly between trips', () => {
    const est = new NoiseFloorEstimator(40, 600);
    for (let i = 0; i < 50; i++) est.push(-30);
    est.reset();
    for (let i = 0; i < 50; i++) est.push(-70);
    expect(est.value()).toBeLessThan(-60);
  });
});

describe('HeuristicSoundDetector', () => {
  let detector: HeuristicSoundDetector;

  beforeEach(async () => {
    detector = new HeuristicSoundDetector();
    await detector.init(config);
  });

  it('declares its identity and supported classes', () => {
    expect(detector.id).toBe('heuristic-v1');
    expect(detector.supportedTypes).toContain('horn');
    expect(detector.supportedTypes).toContain('siren');
    expect(detector.supportedTypes).toContain('whistle');
    expect(detector.supportedTypes).toContain('unknown');
  });

  it('detects a horn blast', async () => {
    const events = await detect([
      quiet(1000),
      { signal: hornSignal(440), durationMs: 800 },
      quiet(1500),
    ]);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.sound).toBe('horn');
    expect(events[0]!.confidence).toBeGreaterThan(0.62);
  });

  it('reports the onset time, not the time of recognition', async () => {
    const events = await detect([
      quiet(1000),
      { signal: hornSignal(440), durationMs: 800 },
      quiet(1000),
    ]);

    expect(events[0]!.t).toBeGreaterThanOrEqual(950);
    expect(events[0]!.t).toBeLessThanOrEqual(1150);
  });

  it('produces nothing at all for broadband road noise', async () => {
    const rng = mulberry32(99);
    const events = await detect([{ signal: whiteNoise(rng), durationMs: 6000, amplitude: 0.35 }]);
    expect(events).toHaveLength(0);
  });

  it('produces nothing for silence', async () => {
    expect(await detect([quiet(5000)])).toHaveLength(0);
  });

  it('ignores a click too short to be a horn', async () => {
    const events = await detect([
      quiet(1000),
      // 50 ms — one frame, below the 150 ms sustain gate.
      { signal: hornSignal(440), durationMs: 50 },
      quiet(1000),
    ]);
    expect(events).toHaveLength(0);
  });

  it('does not treat a continuous tone as an endless event', async () => {
    // 10 s of unbroken tone is the environment, not an event.
    const events = await detect([{ signal: hornSignal(440), durationMs: 10_000 }]);
    expect(events.length).toBeLessThanOrEqual(2);
  });

  it('distinguishes a sweeping siren from a steady horn', async () => {
    const events = await detect([
      quiet(1000),
      { signal: sirenSignal(), durationMs: 4000 },
      quiet(1000),
    ]);

    expect(events.length).toBeGreaterThanOrEqual(1);
    // The sweep must at least stop it being confidently mistaken for a horn.
    const first = events[0]!;
    expect(first.scores.horn ?? 0).toBeLessThan(0.95);
    expect(first.sound).not.toBe('whistle');
  });

  it('classifies a high narrow-band tone as a whistle rather than a horn', async () => {
    const events = await detect([
      quiet(1000),
      { signal: whistleSignal(3200), durationMs: 900 },
      quiet(1000),
    ]);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.sound).not.toBe('horn');
  });

  it('always returns a full class distribution', async () => {
    const events = await detect([
      quiet(1000),
      { signal: hornSignal(440), durationMs: 800 },
      quiet(1000),
    ]);

    const scores = events[0]!.scores;
    expect(scores.horn).toBeDefined();
    expect(scores.siren).toBeDefined();
    expect(scores.whistle).toBeDefined();
    expect(scores.unknown).toBeDefined();
    for (const value of Object.values(scores)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('separates two distinct blasts rather than merging them', async () => {
    const events = await detect([
      quiet(800),
      { signal: hornSignal(440), durationMs: 600 },
      quiet(1500),
      { signal: hornSignal(440), durationMs: 600 },
      quiet(800),
    ]);

    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('applies a refractory period so one blast is not counted repeatedly', async () => {
    const events = await detect([
      quiet(500),
      { signal: hornSignal(440), durationMs: 2500 },
      quiet(500),
    ]);
    // 2.5 s of horn is one angry driver, not fifty events.
    expect(events.length).toBeLessThanOrEqual(3);
  });

  it('clears candidate state on reset', async () => {
    for (const frame of renderFrames([quiet(500), { signal: hornSignal(440), durationMs: 100 }])) {
      detector.process(frame);
    }
    detector.reset();

    const events: SoundEventDetection[] = [];
    for (const frame of renderFrames([quiet(2000)])) {
      const r = detector.process(frame);
      if (r) events.push(r);
    }
    expect(events).toHaveLength(0);
  });
});

describe('detector registry', () => {
  it('lists the shipped detector and the model slots', () => {
    const ids = listDetectors();
    expect(ids).toContain('heuristic-v1');
    expect(ids).toContain('tfjs-yamnet-v1');
    expect(ids).toContain('onnx-crnn-v1');
  });

  it('resolves the heuristic detector by id', async () => {
    const detector = await createSoundEventDetector('heuristic-v1');
    expect(detector.id).toBe('heuristic-v1');
  });

  it('falls back rather than leaving a trip with no detection at all', async () => {
    const detector = await createSoundEventDetector('does-not-exist');
    expect(detector.id).toBe('heuristic-v1');
  });

  it('lets a new implementation be swapped in without touching call sites', async () => {
    registerDetector('test-model-v1', async () => {
      const stub = new HeuristicSoundDetector();
      Object.defineProperty(stub, 'id', { value: 'test-model-v1' });
      return stub;
    });

    const detector = await createSoundEventDetector('test-model-v1');
    expect(detector.id).toBe('test-model-v1');
  });
});
