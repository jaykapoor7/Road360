/**
 * A minimal MLP: dense layers, ReLU hidden, softmax output.
 *
 * Hand-rolled rather than TensorFlow.js because the model is tiny (a few
 * thousand parameters) and inference is a couple of matrix-vector products.
 * Pulling in a multi-megabyte runtime and a WASM backend to run that would
 * cost far more battery and bundle than it saves — and it would put a heavy
 * dependency on the critical path of every drive.
 *
 * The `SoundEventDetector` interface still accepts a TFJS or ONNX
 * implementation for a genuinely large model; this is simply the right size of
 * tool for this job.
 */
export interface DenseLayer {
  /** Row-major, shape [outputs][inputs], flattened. */
  weights: number[];
  bias: number[];
  inputs: number;
  outputs: number;
  activation: 'relu' | 'softmax';
}

export interface MlpModel {
  featureVersion: number;
  inputSize: number;
  classes: string[];
  /** Per-feature standardisation captured at training time. */
  mean: number[];
  std: number[];
  layers: DenseLayer[];
  /** Held-out accuracy at export, for the record. */
  accuracy?: number;
  trainedAt?: string;
}

export class Mlp {
  private readonly buffers: Float32Array[];

  constructor(readonly model: MlpModel) {
    // Preallocate one buffer per layer output so inference never allocates.
    this.buffers = model.layers.map((layer) => new Float32Array(layer.outputs));
  }

  /** Standardise in place using the training-time mean/std. */
  normalize(features: Float32Array): void {
    const { mean, std } = this.model;
    for (let i = 0; i < features.length; i++) {
      const s = std[i] || 1;
      features[i] = (features[i]! - (mean[i] ?? 0)) / s;
    }
  }

  /**
   * Run inference. `features` is standardised in place, so pass a scratch
   * buffer you own. Returns class probabilities (aliased to an internal
   * buffer — copy if you need to retain it).
   */
  predict(features: Float32Array): Float32Array {
    this.normalize(features);

    let input: Float32Array = features;
    for (let l = 0; l < this.model.layers.length; l++) {
      const layer = this.model.layers[l]!;
      const output = this.buffers[l]!;

      for (let o = 0; o < layer.outputs; o++) {
        let sum = layer.bias[o] ?? 0;
        const rowOffset = o * layer.inputs;
        for (let i = 0; i < layer.inputs; i++) {
          sum += layer.weights[rowOffset + i]! * input[i]!;
        }
        output[o] = sum;
      }

      if (layer.activation === 'relu') {
        for (let o = 0; o < layer.outputs; o++) {
          if (output[o]! < 0) output[o] = 0;
        }
      } else {
        softmaxInPlace(output);
      }

      input = output;
    }

    return input;
  }
}

/** Numerically stable softmax — subtracting the max avoids overflow. */
export function softmaxInPlace(values: Float32Array): void {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) if (values[i]! > max) max = values[i]!;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const e = Math.exp(values[i]! - max);
    values[i] = e;
    sum += e;
  }

  if (sum <= 0) return;
  for (let i = 0; i < values.length; i++) values[i] = values[i]! / sum;
}
