import { CLASS_ORDER, INPUT_SIZE, type ModelClass } from '../features/feature-vector';
import type { MlpModel, DenseLayer } from '../ml/mlp';
import { softmaxInPlace } from '../ml/mlp';
import { mulberry32, type Sample, type Rng } from './corpus';

/**
 * Trains the sound classifier: a single-hidden-layer MLP with softmax output,
 * optimised by minibatch SGD with momentum on cross-entropy loss.
 *
 * Written from scratch (~150 lines) rather than pulling in a training
 * framework. The model has a few thousand parameters and trains in seconds;
 * a dependency here would be all cost and no benefit, and it keeps the
 * training path readable for whoever retrains on real audio later.
 */

export interface TrainOptions {
  hiddenUnits: number;
  epochs: number;
  batchSize: number;
  learningRate: number;
  momentum: number;
  /** L2 penalty. The synthetic corpus is easy to overfit. */
  weightDecay: number;
  seed: number;
}

export const DEFAULT_TRAIN_OPTIONS: TrainOptions = {
  hiddenUnits: 24,
  epochs: 240,
  batchSize: 32,
  learningRate: 0.06,
  momentum: 0.9,
  weightDecay: 1e-5,
  seed: 20260727,
};

interface Matrices {
  w1: Float64Array; // [hidden][input]
  b1: Float64Array;
  w2: Float64Array; // [classes][hidden]
  b2: Float64Array;
}

const classIndex = (label: ModelClass): number => CLASS_ORDER.indexOf(label);

/** Standardisation statistics, computed on the training split only. */
export function computeStandardization(samples: readonly Sample[]): {
  mean: Float64Array;
  std: Float64Array;
} {
  const mean = new Float64Array(INPUT_SIZE);
  const std = new Float64Array(INPUT_SIZE);

  for (const sample of samples) {
    for (let i = 0; i < INPUT_SIZE; i++) mean[i] = mean[i]! + sample.features[i]!;
  }
  for (let i = 0; i < INPUT_SIZE; i++) mean[i] = mean[i]! / samples.length;

  for (const sample of samples) {
    for (let i = 0; i < INPUT_SIZE; i++) {
      std[i] = std[i]! + (sample.features[i]! - mean[i]!) ** 2;
    }
  }
  for (let i = 0; i < INPUT_SIZE; i++) {
    // Guard against a constant feature producing a divide-by-zero.
    std[i] = Math.sqrt(std[i]! / samples.length) || 1;
  }

  return { mean, std };
}

function standardize(
  sample: Sample,
  mean: Float64Array,
  std: Float64Array,
  out: Float64Array,
): void {
  for (let i = 0; i < INPUT_SIZE; i++) {
    out[i] = (sample.features[i]! - mean[i]!) / std[i]!;
  }
}

/** He initialisation — the right scale for ReLU. */
function initMatrices(hidden: number, rng: Rng): Matrices {
  const classes = CLASS_ORDER.length;
  const w1 = new Float64Array(hidden * INPUT_SIZE);
  const w2 = new Float64Array(classes * hidden);

  const s1 = Math.sqrt(2 / INPUT_SIZE);
  const s2 = Math.sqrt(2 / hidden);

  // Box–Muller for normal samples from a uniform RNG.
  const normal = () => {
    const u = Math.max(rng(), 1e-9);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  for (let i = 0; i < w1.length; i++) w1[i] = normal() * s1;
  for (let i = 0; i < w2.length; i++) w2[i] = normal() * s2;

  return { w1, b1: new Float64Array(hidden), w2, b2: new Float64Array(classes) };
}

export interface TrainResult {
  model: MlpModel;
  trainAccuracy: number;
  testAccuracy: number;
  confusion: number[][];
  finalLoss: number;
}

export function trainModel(
  train: readonly Sample[],
  test: readonly Sample[],
  options: TrainOptions = DEFAULT_TRAIN_OPTIONS,
): TrainResult {
  const rng = mulberry32(options.seed);
  const classes = CLASS_ORDER.length;
  const hidden = options.hiddenUnits;

  const { mean, std } = computeStandardization(train);
  const m = initMatrices(hidden, rng);

  // Momentum buffers.
  const vW1 = new Float64Array(m.w1.length);
  const vB1 = new Float64Array(m.b1.length);
  const vW2 = new Float64Array(m.w2.length);
  const vB2 = new Float64Array(m.b2.length);

  // Scratch, reused across every example.
  const x = new Float64Array(INPUT_SIZE);
  const h = new Float64Array(hidden);
  const hRaw = new Float64Array(hidden);
  const logits = new Float32Array(classes);
  const dLogits = new Float64Array(classes);
  const dHidden = new Float64Array(hidden);

  const gW1 = new Float64Array(m.w1.length);
  const gB1 = new Float64Array(m.b1.length);
  const gW2 = new Float64Array(m.w2.length);
  const gB2 = new Float64Array(m.b2.length);

  const order = train.map((_, i) => i);
  let finalLoss = 0;

  for (let epoch = 0; epoch < options.epochs; epoch++) {
    // Reshuffle each epoch so batch composition varies.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }

    // Cosine decay: large steps early, fine adjustment late.
    const lr = options.learningRate * (0.5 * (1 + Math.cos((Math.PI * epoch) / options.epochs)));
    let epochLoss = 0;

    for (let start = 0; start < order.length; start += options.batchSize) {
      const end = Math.min(start + options.batchSize, order.length);
      const batch = end - start;

      gW1.fill(0);
      gB1.fill(0);
      gW2.fill(0);
      gB2.fill(0);

      for (let b = start; b < end; b++) {
        const sample = train[order[b]!]!;
        standardize(sample, mean, std, x);

        // Forward: input → hidden (ReLU)
        for (let j = 0; j < hidden; j++) {
          let sum = m.b1[j]!;
          const row = j * INPUT_SIZE;
          for (let i = 0; i < INPUT_SIZE; i++) sum += m.w1[row + i]! * x[i]!;
          hRaw[j] = sum;
          h[j] = sum > 0 ? sum : 0;
        }

        // Forward: hidden → classes (softmax)
        for (let c = 0; c < classes; c++) {
          let sum = m.b2[c]!;
          const row = c * hidden;
          for (let j = 0; j < hidden; j++) sum += m.w2[row + j]! * h[j]!;
          logits[c] = sum;
        }
        softmaxInPlace(logits);

        const target = classIndex(sample.label);
        epochLoss += -Math.log(Math.max(logits[target]!, 1e-9));

        // Cross-entropy + softmax gradient collapses to (p - y).
        for (let c = 0; c < classes; c++) dLogits[c] = logits[c]! - (c === target ? 1 : 0);

        // Backward: output layer
        dHidden.fill(0);
        for (let c = 0; c < classes; c++) {
          const row = c * hidden;
          const d = dLogits[c]!;
          gB2[c] = gB2[c]! + d;
          for (let j = 0; j < hidden; j++) {
            gW2[row + j] = gW2[row + j]! + d * h[j]!;
            dHidden[j] = dHidden[j]! + d * m.w2[row + j]!;
          }
        }

        // Backward: hidden layer (ReLU derivative)
        for (let j = 0; j < hidden; j++) {
          if (hRaw[j]! <= 0) continue;
          const d = dHidden[j]!;
          gB1[j] = gB1[j]! + d;
          const row = j * INPUT_SIZE;
          for (let i = 0; i < INPUT_SIZE; i++) gW1[row + i] = gW1[row + i]! + d * x[i]!;
        }
      }

      // SGD with momentum and L2 decay.
      const scale = lr / batch;
      applyUpdate(m.w1, gW1, vW1, scale, options.momentum, options.weightDecay, lr);
      applyUpdate(m.b1, gB1, vB1, scale, options.momentum, 0, lr);
      applyUpdate(m.w2, gW2, vW2, scale, options.momentum, options.weightDecay, lr);
      applyUpdate(m.b2, gB2, vB2, scale, options.momentum, 0, lr);
    }

    finalLoss = epochLoss / train.length;
  }

  const model = toModel(m, mean, std, hidden);
  const trainEval = evaluate(model, train);
  const testEval = evaluate(model, test);

  model.accuracy = testEval.accuracy;
  model.trainedAt = new Date().toISOString();

  return {
    model,
    trainAccuracy: trainEval.accuracy,
    testAccuracy: testEval.accuracy,
    confusion: testEval.confusion,
    finalLoss,
  };
}

function applyUpdate(
  weights: Float64Array,
  grad: Float64Array,
  velocity: Float64Array,
  scale: number,
  momentum: number,
  decay: number,
  lr: number,
): void {
  for (let i = 0; i < weights.length; i++) {
    const g = grad[i]! * scale + decay * weights[i]! * lr;
    velocity[i] = momentum * velocity[i]! - g;
    weights[i] = weights[i]! + velocity[i]!;
  }
}

function toModel(m: Matrices, mean: Float64Array, std: Float64Array, hidden: number): MlpModel {
  const layers: DenseLayer[] = [
    {
      weights: Array.from(m.w1, round6),
      bias: Array.from(m.b1, round6),
      inputs: INPUT_SIZE,
      outputs: hidden,
      activation: 'relu',
    },
    {
      weights: Array.from(m.w2, round6),
      bias: Array.from(m.b2, round6),
      inputs: hidden,
      outputs: CLASS_ORDER.length,
      activation: 'softmax',
    },
  ];

  return {
    featureVersion: 1,
    inputSize: INPUT_SIZE,
    classes: [...CLASS_ORDER],
    mean: Array.from(mean, round6),
    std: Array.from(std, round6),
    layers,
  };
}

// Six decimals keeps the exported JSON small without measurably moving accuracy.
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

export interface EvalResult {
  accuracy: number;
  confusion: number[][];
  perClass: Record<string, { precision: number; recall: number }>;
}

export function evaluate(model: MlpModel, samples: readonly Sample[]): EvalResult {
  const classes = model.classes.length;
  const confusion = Array.from({ length: classes }, () => new Array<number>(classes).fill(0));

  const scratch = new Float32Array(model.inputSize);
  let correct = 0;

  for (const sample of samples) {
    scratch.set(sample.features);
    const probs = runInference(model, scratch);

    let best = 0;
    for (let c = 1; c < classes; c++) if (probs[c]! > probs[best]!) best = c;

    const actual = classIndex(sample.label);
    confusion[actual]![best] = confusion[actual]![best]! + 1;
    if (best === actual) correct += 1;
  }

  const perClass: EvalResult['perClass'] = {};
  for (let c = 0; c < classes; c++) {
    const tp = confusion[c]![c]!;
    const predicted = confusion.reduce((acc, row) => acc + row[c]!, 0);
    const actual = confusion[c]!.reduce((a, b) => a + b, 0);
    perClass[model.classes[c]!] = {
      precision: predicted > 0 ? tp / predicted : 0,
      recall: actual > 0 ? tp / actual : 0,
    };
  }

  return { accuracy: correct / Math.max(1, samples.length), confusion, perClass };
}

/** Standalone forward pass, so evaluation does not depend on the runtime class. */
function runInference(model: MlpModel, features: Float32Array): Float32Array {
  for (let i = 0; i < features.length; i++) {
    features[i] = (features[i]! - model.mean[i]!) / (model.std[i]! || 1);
  }

  let input: Float32Array = features;
  for (const layer of model.layers) {
    const output = new Float32Array(layer.outputs);
    for (let o = 0; o < layer.outputs; o++) {
      let sum = layer.bias[o]!;
      const row = o * layer.inputs;
      for (let i = 0; i < layer.inputs; i++) sum += layer.weights[row + i]! * input[i]!;
      output[o] = sum;
    }
    if (layer.activation === 'relu') {
      for (let o = 0; o < layer.outputs; o++) if (output[o]! < 0) output[o] = 0;
    } else {
      softmaxInPlace(output);
    }
    input = output;
  }

  return input;
}
