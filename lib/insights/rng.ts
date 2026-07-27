/**
 * Seeded RNG.
 *
 * Insight phrasing varies between trips but must be stable *for* a trip —
 * reopening a report and finding it worded differently would make the whole
 * thing feel untrustworthy. Seeding from the trip id gives both.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one option deterministically. */
export function pick<T>(rng: () => number, options: readonly T[]): T {
  if (options.length === 0) throw new Error('pick() needs at least one option');
  return options[Math.floor(rng() * options.length) % options.length]!;
}
