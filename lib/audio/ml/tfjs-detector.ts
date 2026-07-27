import type { SoundEventType } from '@/lib/domain/events';
import type {
  DetectorConfig,
  DetectorFrame,
  SoundEventDetection,
  SoundEventDetector,
} from '../types';

/**
 * TensorFlow.js detector slot.
 *
 * Not implemented — this file documents the contract a real model must satisfy,
 * and proves the interface can express it. A YAMNet-style implementation would:
 *
 *   1. `await import('@tensorflow/tfjs')` and the wasm backend inside `init`,
 *      so nothing enters the main bundle;
 *   2. load weights from a versioned URL and warm the graph with one dummy
 *      inference, because the first real one is otherwise ~10× slower;
 *   3. buffer ~975 ms of waveform (`requiresSpectrum = false` — YAMNet does its
 *      own mel spectrogram) and infer on a hop;
 *   4. map the AudioSet class indices for "Vehicle horn, car horn, honking",
 *      "Siren", "Whistle" onto our `SoundEventType`s and emit the argmax.
 *
 * Because this runs inside the detector worker, the runtime stays off the main
 * thread. Selecting it is a one-line change to `flags.detectorId`.
 */
export class TfjsSoundDetector implements SoundEventDetector {
  readonly id = 'tfjs-yamnet-v1';
  readonly version = '0.0.0-stub';
  readonly supportedTypes: readonly SoundEventType[] = ['horn', 'siren', 'whistle', 'unknown'];
  /** YAMNet consumes waveform and computes its own mel spectrogram. */
  readonly requiresSpectrum = false;

  async init(_config: DetectorConfig): Promise<void> {
    throw new Error(
      'tfjs-yamnet-v1 is not implemented. Register a real factory in lib/audio/registry.ts.',
    );
  }

  process(_frame: DetectorFrame): SoundEventDetection | null {
    return null;
  }

  reset(): void {}

  async dispose(): Promise<void> {}
}

export const createTfjsDetector = async (): Promise<SoundEventDetector> => new TfjsSoundDetector();
