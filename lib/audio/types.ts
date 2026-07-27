import type { SoundEventType } from '@/lib/domain/events';
import type { Offset } from '@/lib/domain/schema';

/**
 * The classification seam.
 *
 * Detection is generic over sound classes rather than horn-specific, and lives
 * behind an interface so a TensorFlow.js or ONNX model can replace the shipped
 * heuristic without touching a single call site. That is the whole point of
 * this file: `heuristic-v1` is an implementation detail, not an assumption.
 */

export interface DetectorFrame {
  /** Milliseconds since trip start. */
  t: Offset;
  sampleRate: number;
  fftSize: number;
  binHz: number;
  magnitudes: Float32Array;
  /** Pseudo-SPL for this frame. */
  rmsDb: number;
  peakDb: number;
  /** Rolling ambient floor, same units. */
  floorDb: number;
}

export interface SoundEventDetection {
  /** Onset time, not the time the event was recognised. */
  t: Offset;
  sound: SoundEventType;
  confidence: number;
  /** Full class distribution, so a later re-scoring pass can use the runner-up. */
  scores: Partial<Record<SoundEventType, number>>;
  peakHz: number;
  db: number;
  durationMs: number;
  /** Debug only; stripped in production builds. */
  features?: Record<string, number>;
}

export interface DetectorConfig {
  sampleRate: number;
  fftSize: number;
  /** Milliseconds between frames. */
  hopMs: number;
  minConfidence: number;
  /** Lockout after an event closes, per class. */
  refractoryMs: number;
  /** How far above the floor a frame must be to be a candidate at all. */
  loudnessMarginDb: number;
  /** Absolute gate, so near-silence never produces candidates. */
  absoluteFloorDb: number;
  debug: boolean;
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  sampleRate: 16_000,
  fftSize: 1024,
  hopMs: 50,
  minConfidence: 0.62,
  refractoryMs: 700,
  loudnessMarginDb: 10,
  absoluteFloorDb: -48,
  debug: false,
};

export interface SoundEventDetector {
  readonly id: string;
  readonly version: string;
  readonly supportedTypes: readonly SoundEventType[];
  /** False for a model that consumes raw waveform rather than a spectrum. */
  readonly requiresSpectrum: boolean;

  init(config: DetectorConfig): Promise<void>;
  /**
   * Called once per hop. Must be synchronous and allocation-light — this runs
   * 20 times a second for the whole drive.
   *
   * Returns a detection only when an event *closes*, so callers get one result
   * per real-world event rather than one per frame.
   */
  process(frame: DetectorFrame): SoundEventDetection | null;
  /** New trip, or resumption after a gap. */
  reset(): void;
  dispose(): Promise<void>;
}

export type DetectorFactory = () => Promise<SoundEventDetector>;
