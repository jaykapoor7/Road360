import type { DetectorFactory, SoundEventDetector } from './types';
import { createHeuristicDetector } from './heuristic-detector';

/**
 * Detector registry.
 *
 * This is the mechanism that makes "plug in TensorFlow.js later" a real claim
 * rather than an aspiration. Factories are async and only invoked on demand, so
 * a model runtime is never pulled into the main bundle by the mere existence of
 * its registration.
 */
const registry = new Map<string, DetectorFactory>();

export function registerDetector(id: string, factory: DetectorFactory): void {
  registry.set(id, factory);
}

export function listDetectors(): string[] {
  return [...registry.keys()];
}

export const FALLBACK_DETECTOR_ID = 'heuristic-v1';

export async function createSoundEventDetector(id: string): Promise<SoundEventDetector> {
  const factory = registry.get(id);
  if (factory) return factory();

  // An unknown id must not silently disable horn detection for the whole trip.
  const fallback = registry.get(FALLBACK_DETECTOR_ID);
  if (!fallback) throw new Error('No sound event detector registered');
  return fallback();
}

registerDetector(FALLBACK_DETECTOR_ID, createHeuristicDetector);

// The trained classifier. Its weights are a 5 KB JSON blob and inference is two
// matrix-vector products, so unlike the model runtimes below it is cheap enough
// to register eagerly and is the shipped default.
registerDetector('mlp-v1', async () => {
  const { createMlDetector } = await import('./ml/model-detector');
  return createMlDetector();
});

// Registered lazily: the import only resolves if the flag selects them, so
// neither runtime is bundled by default.
registerDetector('tfjs-yamnet-v1', async () => {
  const { createTfjsDetector } = await import('./ml/tfjs-detector');
  return createTfjsDetector();
});

registerDetector('onnx-crnn-v1', async () => {
  const { createOnnxDetector } = await import('./ml/onnx-detector');
  return createOnnxDetector();
});
