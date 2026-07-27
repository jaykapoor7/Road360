import type { SoundEventType } from '@/lib/domain/events';
import { clamp01 } from '@/lib/utils/math';
import { findPeak, spectralCentroid } from '../features/spectral';
import {
  extractFeatures,
  extractTemporal,
  FEATURE_COUNT,
  FEATURE_VERSION,
  INPUT_SIZE,
} from '../features/feature-vector';
import { Mlp, type MlpModel } from './mlp';
import {
  DEFAULT_DETECTOR_CONFIG,
  type DetectorConfig,
  type DetectorFrame,
  type SoundEventDetection,
  type SoundEventDetector,
} from '../types';
import weights from './sound-model.json';

/**
 * The trained sound classifier.
 *
 * Same segmentation as the heuristic — a loudness gate opens a candidate, the
 * candidate accumulates until the sound stops — but the *decision* about what
 * the sound was is made by a learned model over the full feature vector rather
 * than by hand-written per-class rules.
 *
 * That is the substantive difference: the heuristic needs a human to define and
 * balance a rule for every class, and adding a class means re-tuning the others.
 * The model learns one decision boundary across all of them, and adding a class
 * means adding examples.
 */
export class MlSoundDetector implements SoundEventDetector {
  readonly id = 'mlp-v1';
  readonly version = '1.0.0';
  readonly supportedTypes: readonly SoundEventType[] = ['horn', 'siren', 'whistle', 'unknown'];
  readonly requiresSpectrum = true;

  private config: DetectorConfig = DEFAULT_DETECTOR_CONFIG;
  private mlp: Mlp | null = null;

  // Preallocated: inference runs 20x/second for the length of a drive.
  private readonly frameFeatures = new Float32Array(FEATURE_COUNT);
  private readonly accum = new Float32Array(FEATURE_COUNT);
  private readonly input = new Float32Array(INPUT_SIZE);
  private readonly scratch: number[] = [];

  private frames = 0;
  private startT = 0;
  private peakDbSeen = -Infinity;
  private minLevel = Infinity;
  private maxLevel = -Infinity;
  private minPeakHz = Infinity;
  private maxPeakHz = -Infinity;
  private centroidSum = 0;
  private centroidSqSum = 0;
  private dominantHz = 0;
  private refractoryUntil = 0;

  async init(config: DetectorConfig): Promise<void> {
    this.config = config;

    const model = weights as unknown as MlpModel;
    // A model trained against a different feature extractor would silently
    // misclassify everything. Refusing to load is the safe failure.
    if (model.featureVersion !== FEATURE_VERSION) {
      throw new Error(
        `Sound model feature version ${model.featureVersion} does not match runtime ${FEATURE_VERSION}. Retrain with: pnpm train:sound`,
      );
    }
    if (model.inputSize !== INPUT_SIZE) {
      throw new Error(`Sound model expects ${model.inputSize} inputs, runtime produces ${INPUT_SIZE}.`);
    }

    this.mlp = new Mlp(model);
    this.reset();
  }

  reset(): void {
    this.frames = 0;
    this.accum.fill(0);
    this.peakDbSeen = -Infinity;
    this.minLevel = Infinity;
    this.maxLevel = -Infinity;
    this.minPeakHz = Infinity;
    this.maxPeakHz = -Infinity;
    this.centroidSum = 0;
    this.centroidSqSum = 0;
    this.refractoryUntil = 0;
  }

  async dispose(): Promise<void> {
    this.mlp = null;
  }

  process(frame: DetectorFrame): SoundEventDetection | null {
    const aboveFloor = frame.peakDb - frame.floorDb;
    const loud =
      aboveFloor >= this.config.loudnessMarginDb && frame.peakDb >= this.config.absoluteFloorDb;

    if (!loud || frame.t < this.refractoryUntil) {
      return this.close(frame.t);
    }

    if (this.frames === 0) this.startT = frame.t;

    extractFeatures(
      {
        magnitudes: frame.magnitudes,
        binHz: frame.binHz,
        peakDb: frame.peakDb,
        floorDb: frame.floorDb,
      },
      this.frameFeatures,
      this.scratch,
    );
    for (let i = 0; i < FEATURE_COUNT; i++) this.accum[i] = this.accum[i]! + this.frameFeatures[i]!;

    const peak = findPeak(frame.magnitudes, frame.binHz, 100, 8000);
    const centroid = spectralCentroid(frame.magnitudes, frame.binHz, 100, 8000);

    this.centroidSum += centroid;
    this.centroidSqSum += centroid * centroid;
    if (peak.hz < this.minPeakHz) this.minPeakHz = peak.hz;
    if (peak.hz > this.maxPeakHz) this.maxPeakHz = peak.hz;
    if (frame.peakDb > this.peakDbSeen) {
      this.peakDbSeen = frame.peakDb;
      this.dominantHz = peak.hz;
    }
    if (frame.rmsDb < this.minLevel) this.minLevel = frame.rmsDb;
    if (frame.rmsDb > this.maxLevel) this.maxLevel = frame.rmsDb;

    this.frames += 1;

    // A sound that never stops is the environment, not an event.
    const maxFrames = Math.round(4000 / this.config.hopMs);
    if (this.frames > maxFrames) return this.close(frame.t);

    return null;
  }

  /** Classify an accumulated candidate now that its full extent is known. */
  private close(now: number): SoundEventDetection | null {
    const frames = this.frames;
    if (frames === 0) return null;

    const startT = this.startT;
    const durationMs = frames * this.config.hopMs;
    const peakDb = this.peakDbSeen;
    const dominantHz = this.dominantHz;

    const meanCentroid = this.centroidSum / frames;
    const variance = Math.max(0, this.centroidSqSum / frames - meanCentroid * meanCentroid);

    // Reset before any early return, so a rejected candidate cannot leak into
    // the next one.
    for (let i = 0; i < FEATURE_COUNT; i++) this.input[i] = this.accum[i]! / frames;
    extractTemporal(
      {
        pitchDriftHz: this.maxPeakHz - this.minPeakHz,
        centroidStdHz: Math.sqrt(variance),
        durationMs,
        levelRangeDb: this.maxLevel - this.minLevel,
      },
      this.input,
      FEATURE_COUNT,
    );

    this.frames = 0;
    this.accum.fill(0);
    this.peakDbSeen = -Infinity;
    this.minLevel = Infinity;
    this.maxLevel = -Infinity;
    this.minPeakHz = Infinity;
    this.maxPeakHz = -Infinity;
    this.centroidSum = 0;
    this.centroidSqSum = 0;

    // Too short to be anything but a click.
    if (durationMs < 150 || !this.mlp) return null;

    const probs = this.mlp.predict(this.input);
    const classes = this.mlp.model.classes;

    let best = 0;
    for (let c = 1; c < probs.length; c++) if (probs[c]! > probs[best]!) best = c;

    const scores: Partial<Record<SoundEventType, number>> = {};
    for (let c = 0; c < classes.length; c++) {
      const name = classes[c]!;
      // 'noise' is the model's negative class; it is not a reportable event
      // type, so it maps onto 'unknown' for callers.
      const type: SoundEventType =
        name === 'noise' ? 'unknown' : (name as SoundEventType);
      scores[type] = Math.max(scores[type] ?? 0, clamp01(probs[c]!));
    }

    const winner = classes[best]!;
    const confidence = clamp01(probs[best]!);

    // The negative class winning means "this was traffic", not "an unknown
    // event happened" — emit nothing at all.
    if (winner === 'noise') return null;
    if (confidence < this.config.minConfidence) return null;

    this.refractoryUntil = now + this.config.refractoryMs;

    return {
      t: startT,
      sound: winner as SoundEventType,
      confidence,
      scores,
      peakHz: dominantHz,
      db: peakDb,
      durationMs,
    };
  }
}

export const createMlDetector = async (): Promise<SoundEventDetector> => new MlSoundDetector();
