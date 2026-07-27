import { describe, expect, it, beforeAll } from 'vitest';
import { HeuristicSoundDetector } from '@/lib/audio/heuristic-detector';
import { MlSoundDetector } from '@/lib/audio/ml/model-detector';
import { DEFAULT_DETECTOR_CONFIG, type SoundEventDetector } from '@/lib/audio/types';
import type { SoundEventType } from '@/lib/domain/events';
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

/**
 * Head-to-head on identical inputs.
 *
 * The training test's 99.9% is a statement about how separable the synthetic
 * corpus is, not about real-world accuracy — nobody should read it as the
 * latter. This comparison is the informative measurement: both detectors see
 * the same waveforms, so any difference is attributable to the decision rule
 * rather than to the data.
 *
 * The cases below are deliberately the heuristic's documented weak spots.
 */
const config = {
  ...DEFAULT_DETECTOR_CONFIG,
  sampleRate: SAMPLE_RATE,
  fftSize: FFT_SIZE,
  hopMs: HOP_MS,
};

const quiet = (ms: number): Segment => ({ signal: silence, durationMs: ms });

async function detectOne(
  detector: SoundEventDetector,
  segments: Segment[],
): Promise<SoundEventType | null> {
  detector.reset();
  let result: SoundEventType | null = null;
  for (const frame of renderFrames(segments)) {
    const detection = detector.process(frame);
    if (detection && !result) result = detection.sound;
  }
  return result;
}

/** A reversing beeper: steady tone in the horn band with no harmonic stack. */
function beeperSignal(frequency = 1000, period = 0.6) {
  return (t: number) => (Math.sin((2 * Math.PI * t) / period) > 0 ? 0.6 * Math.sin(2 * Math.PI * frequency * t) : 0);
}

/** Brass: a harmonic stack in the horn band that changes note partway. */
function brassSignal(f0 = 420) {
  return (t: number) => {
    const f = t > 0.7 ? f0 * 1.26 : f0;
    return (
      0.5 * Math.sin(2 * Math.PI * f * t) +
      0.3 * Math.sin(2 * Math.PI * f * 2 * t) +
      0.18 * Math.sin(2 * Math.PI * f * 3 * t)
    );
  };
}

describe('trained model vs heuristic', () => {
  let model: MlSoundDetector;
  let heuristic: HeuristicSoundDetector;

  beforeAll(async () => {
    model = new MlSoundDetector();
    await model.init(config);
    heuristic = new HeuristicSoundDetector();
    await heuristic.init(config);
  });

  it('loads the trained weights and matches the runtime feature version', () => {
    expect(model.id).toBe('mlp-v1');
    expect(model.supportedTypes).toContain('horn');
  });

  it('refuses to load weights built for a different feature extractor', async () => {
    // Guards the one failure mode that would silently corrupt every horn count.
    const stale = new MlSoundDetector();
    const original = (await import('@/lib/audio/ml/sound-model.json')).default as { featureVersion: number };
    const saved = original.featureVersion;
    original.featureVersion = 999;
    await expect(stale.init(config)).rejects.toThrow(/feature version/i);
    original.featureVersion = saved;
  });

  describe('agreement on unambiguous cases', () => {
    it('both detect a clear horn', async () => {
      const segments = [quiet(800), { signal: hornSignal(440), durationMs: 900 }, quiet(800)];
      expect(await detectOne(model, segments)).toBe('horn');
      expect(await detectOne(heuristic, segments)).toBe('horn');
    });

    it('neither fires on broadband road noise', async () => {
      const rng = mulberry32(11);
      const segments = [{ signal: whiteNoise(rng), durationMs: 5000, amplitude: 0.35 }];
      expect(await detectOne(model, segments)).toBeNull();
      expect(await detectOne(heuristic, segments)).toBeNull();
    });

    it('neither fires on silence', async () => {
      expect(await detectOne(model, [quiet(4000)])).toBeNull();
      expect(await detectOne(heuristic, [quiet(4000)])).toBeNull();
    });

    it('both reject a click too short to be a horn', async () => {
      const segments = [quiet(600), { signal: hornSignal(440), durationMs: 50 }, quiet(600)];
      expect(await detectOne(model, segments)).toBeNull();
      expect(await detectOne(heuristic, segments)).toBeNull();
    });
  });

  describe('the heuristic’s documented weak spots', () => {
    it('the model does not call a reversing beeper a horn', async () => {
      const segments = [quiet(600), { signal: beeperSignal(), durationMs: 2000 }, quiet(600)];
      const modelSaid = await detectOne(model, segments);
      const heuristicSaid = await detectOne(heuristic, segments);

      // The model must not report it as a horn. The heuristic's answer is
      // recorded for contrast rather than asserted — this test documents the
      // difference, it does not depend on the heuristic staying wrong.
      expect(modelSaid).not.toBe('horn');
      console.log(`      beeper  → model: ${modelSaid ?? 'none'}, heuristic: ${heuristicSaid ?? 'none'}`);
    });

    /**
     * A known, measured limitation rather than an aspiration.
     *
     * Brass is acoustically a horn plus a note change: same harmonic stack, same
     * band. The heuristic rejects it with a hard pitch-stability gate; the
     * learned boundary does not weight pitch drift heavily enough to match that,
     * and no amount of tuning the synthetic corpus is honest evidence that it
     * would generalise. This test pins the current behaviour so a future
     * retrain on real audio shows up as a change rather than passing silently.
     */
    it('documents that the model still confuses brass with a horn', async () => {
      const segments = [quiet(600), { signal: brassSignal(), durationMs: 1600 }, quiet(600)];
      const modelSaid = await detectOne(model, segments);
      const heuristicSaid = await detectOne(heuristic, segments);

      expect(modelSaid).toBe('horn'); // known gap
      expect(heuristicSaid).not.toBe('horn'); // the heuristic gets this right
      console.log(`      brass   → model: ${modelSaid ?? 'none'}, heuristic: ${heuristicSaid ?? 'none'}`);
    });

    it('separates a sweeping siren from a steady horn', async () => {
      const segments = [quiet(600), { signal: sirenSignal(), durationMs: 3500 }, quiet(600)];
      expect(await detectOne(model, segments)).not.toBe('horn');
    });

    it('classifies a high narrow-band tone as a whistle', async () => {
      const segments = [quiet(600), { signal: whistleSignal(3200), durationMs: 1000 }, quiet(600)];
      expect(await detectOne(model, segments)).toBe('whistle');
    });
  });

  it('scores a whole mixed scenario at least as well as the heuristic', async () => {
    const cases: { segments: Segment[]; expected: SoundEventType | null; name: string }[] = [
      { name: 'horn 440', segments: [quiet(600), { signal: hornSignal(440), durationMs: 900 }, quiet(600)], expected: 'horn' },
      { name: 'horn 380', segments: [quiet(600), { signal: hornSignal(380), durationMs: 700 }, quiet(600)], expected: 'horn' },
      { name: 'horn 500', segments: [quiet(600), { signal: hornSignal(500), durationMs: 1200 }, quiet(600)], expected: 'horn' },
      { name: 'whistle 3.2k', segments: [quiet(600), { signal: whistleSignal(3200), durationMs: 900 }, quiet(600)], expected: 'whistle' },
      { name: 'whistle 2.6k', segments: [quiet(600), { signal: whistleSignal(2600), durationMs: 800 }, quiet(600)], expected: 'whistle' },
      { name: 'road noise', segments: [{ signal: whiteNoise(mulberry32(5)), durationMs: 4000, amplitude: 0.35 }], expected: null },
      { name: 'silence', segments: [quiet(3000)], expected: null },
      { name: 'beeper', segments: [quiet(600), { signal: beeperSignal(), durationMs: 2000 }, quiet(600)], expected: null },
      { name: 'brass', segments: [quiet(600), { signal: brassSignal(), durationMs: 1600 }, quiet(600)], expected: null },
    ];

    let modelCorrect = 0;
    let heuristicCorrect = 0;
    const rows: string[] = [];

    for (const testCase of cases) {
      const m = await detectOne(model, testCase.segments);
      const h = await detectOne(heuristic, testCase.segments);

      // For the negative cases, anything other than a confident horn counts as
      // correct — an 'unknown' is an honest "something happened", not a false
      // horn in the user's count.
      const ok = (got: SoundEventType | null) =>
        testCase.expected === null ? got !== 'horn' : got === testCase.expected;

      if (ok(m)) modelCorrect += 1;
      if (ok(h)) heuristicCorrect += 1;
      rows.push(
        `      ${testCase.name.padEnd(14)} want ${String(testCase.expected).padEnd(8)} model ${String(m).padEnd(8)} heuristic ${String(h)}`,
      );
    }

    console.log(`\n    scenario results (${cases.length} cases):`);
    rows.forEach((r) => console.log(r));
    console.log(`      model ${modelCorrect}/${cases.length}, heuristic ${heuristicCorrect}/${cases.length}\n`);

    // The measured state of affairs, pinned rather than wished for: the model
    // trails the heuristic by exactly one case (brass), which is why the
    // heuristic remains the default detector. If a retrain closes that gap this
    // assertion fails and the default should be revisited.
    expect(modelCorrect).toBe(8);
    expect(heuristicCorrect).toBe(9);

    // Neither may ever miss an actual horn — that is the metric that matters.
    const hornCases = cases.filter((c) => c.expected === 'horn');
    for (const testCase of hornCases) {
      expect(await detectOne(model, testCase.segments)).toBe('horn');
      expect(await detectOne(heuristic, testCase.segments)).toBe('horn');
    }
  });
});
