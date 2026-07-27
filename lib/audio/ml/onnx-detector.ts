import type { SoundEventType } from '@/lib/domain/events';
import type {
  DetectorConfig,
  DetectorFrame,
  SoundEventDetection,
  SoundEventDetector,
} from '../types';

/**
 * ONNX Runtime Web detector slot.
 *
 * Not implemented. A CRNN implementation would `await import('onnxruntime-web')`
 * inside `init`, create a session against a quantised `.onnx` file, and run
 * inference over a rolling mel-spectrogram window built from the frames this
 * interface already supplies (`requiresSpectrum = true`).
 *
 * Kept alongside the TFJS slot to make the point that the interface is not
 * shaped around one runtime.
 */
export class OnnxSoundDetector implements SoundEventDetector {
  readonly id = 'onnx-crnn-v1';
  readonly version = '0.0.0-stub';
  readonly supportedTypes: readonly SoundEventType[] = ['horn', 'siren', 'whistle', 'unknown'];
  readonly requiresSpectrum = true;

  async init(_config: DetectorConfig): Promise<void> {
    throw new Error(
      'onnx-crnn-v1 is not implemented. Register a real factory in lib/audio/registry.ts.',
    );
  }

  process(_frame: DetectorFrame): SoundEventDetection | null {
    return null;
  }

  reset(): void {}

  async dispose(): Promise<void> {}
}

export const createOnnxDetector = async (): Promise<SoundEventDetector> => new OnnxSoundDetector();
