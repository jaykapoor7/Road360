/**
 * Rolling ambient noise floor estimator.
 *
 * The floor is the smaller of a short-window median and a slow EWMA. That
 * combination is deliberate: a sustained horn would drag a pure EWMA upward and
 * eventually mask itself, and a pure short median reacts too sharply to a
 * change in road surface. Taking the minimum keeps the floor honest during long
 * loud events while still tracking genuine changes in ambience.
 */
export class NoiseFloorEstimator {
  private readonly ring: Float32Array;
  private readonly scratch: number[] = [];
  private index = 0;
  private filled = 0;
  private ewma: number | null = null;
  private readonly ewmaAlpha: number;

  constructor(windowFrames: number, ewmaFrames: number) {
    this.ring = new Float32Array(Math.max(1, windowFrames));
    this.ewmaAlpha = 2 / (Math.max(1, ewmaFrames) + 1);
  }

  push(db: number): number {
    this.ring[this.index] = db;
    this.index = (this.index + 1) % this.ring.length;
    if (this.filled < this.ring.length) this.filled += 1;

    this.ewma = this.ewma === null ? db : this.ewma + this.ewmaAlpha * (db - this.ewma);
    return this.value();
  }

  value(): number {
    if (this.filled === 0) return this.ewma ?? -90;

    // 10th percentile of the short window, not the median: within a two-second
    // window a horn can occupy more than half the frames, which would drag a
    // median up with it.
    this.scratch.length = 0;
    for (let i = 0; i < this.filled; i++) this.scratch.push(this.ring[i]!);
    this.scratch.sort((a, b) => a - b);

    const idx = Math.min(this.scratch.length - 1, Math.floor(this.scratch.length * 0.1));
    const windowFloor = this.scratch[idx]!;

    return this.ewma === null ? windowFloor : Math.min(windowFloor, this.ewma);
  }

  reset(): void {
    this.ring.fill(0);
    this.index = 0;
    this.filled = 0;
    this.ewma = null;
  }
}
