import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDataset } from '@/lib/audio/training/corpus';
import { trainModel, evaluate, DEFAULT_TRAIN_OPTIONS } from '@/lib/audio/training/train';

/**
 * Trains the sound classifier and asserts its held-out accuracy.
 *
 * Training lives in the test suite on purpose: the accuracy claim is then a
 * permanent regression check rather than a number someone quoted once. Set
 * ROAD360_EXPORT_MODEL=1 to also write the weights (see `pnpm train:sound`).
 */
describe('sound classifier training', () => {
  it('trains to usable held-out accuracy and exports weights', () => {
    const train = buildDataset(900, 1234);
    // A different seed means the test split has genuinely unseen parameters,
    // not just unseen draws from the same sequence.
    const test = buildDataset(300, 98765);

    const result = trainModel(train, test, DEFAULT_TRAIN_OPTIONS);
    const detail = evaluate(result.model, test);

    console.log(`\n  train accuracy: ${(result.trainAccuracy * 100).toFixed(1)}%`);
    console.log(`  test accuracy:  ${(result.testAccuracy * 100).toFixed(1)}%`);
    for (const [name, m] of Object.entries(detail.perClass)) {
      console.log(
        `    ${name.padEnd(8)} precision ${(m.precision * 100).toFixed(1)}%  recall ${(m.recall * 100).toFixed(1)}%`,
      );
    }
    console.log('  confusion (rows actual, cols predicted):');
    console.log('             ' + result.model.classes.map((c) => c.padStart(8)).join(''));
    result.confusion.forEach((row, i) => {
      console.log(
        `    ${result.model.classes[i]!.padEnd(9)}` + row.map((v) => String(v).padStart(8)).join(''),
      );
    });

    expect(result.testAccuracy).toBeGreaterThan(0.85);

    // False positives are the failure mode that destroys trust in a horn count,
    // so the negative class is held to a higher bar than the rest.
    expect(detail.perClass.noise!.recall).toBeGreaterThan(0.9);
    expect(detail.perClass.horn!.precision).toBeGreaterThan(0.8);

    if (process.env.ROAD360_EXPORT_MODEL === '1') {
      const out = path.join(process.cwd(), 'lib', 'audio', 'ml', 'sound-model.json');
      writeFileSync(out, JSON.stringify(result.model));
      console.log(`\n  wrote ${out} (${(JSON.stringify(result.model).length / 1024).toFixed(1)} KB)`);
    }
  }, 300_000);
});
