import { clamp } from '@/lib/utils/math';

/** An anchor table: ascending pairs of [input, output]. */
export type AnchorTable = readonly (readonly [number, number])[];

/**
 * Piecewise-linear interpolation across an anchor table, clamped at both ends.
 *
 * Sub-scores use anchor tables rather than closed-form curves because anchors
 * are legible and tunable — "2 horns a minute is a 60" is a product decision
 * someone can argue with, whereas `100 * exp(-0.31 * x)` is not.
 */
export function piecewiseInterpolate(table: AnchorTable, x: number): number {
  if (table.length === 0) return 0;

  const first = table[0]!;
  const last = table[table.length - 1]!;

  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];

  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i]!;
    const b = table[i + 1]!;
    if (x >= a[0] && x <= b[0]) {
      const span = b[0] - a[0];
      if (span === 0) return b[1];
      const t = (x - a[0]) / span;
      return a[1] + (b[1] - a[1]) * t;
    }
  }

  return last[1];
}

export const clampScore = (v: number): number => clamp(v, 0, 100);
