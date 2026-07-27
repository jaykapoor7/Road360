/**
 * Fixed-capacity ring buffer over a Float32Array.
 *
 * `devicemotion` fires 30–60 times a second for the length of a drive. The
 * handler must not allocate — a per-event object would hand the GC a steady
 * drip of garbage for an hour, which on a phone shows up as jank and battery.
 * Writes are a couple of array stores and nothing else.
 */
export class MotionRingBuffer {
  private readonly ax: Float32Array;
  private readonly ay: Float32Array;
  private readonly az: Float32Array;
  private readonly ts: Float64Array;
  private index = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.ax = new Float32Array(capacity);
    this.ay = new Float32Array(capacity);
    this.az = new Float32Array(capacity);
    this.ts = new Float64Array(capacity);
  }

  push(x: number, y: number, z: number, t: number): void {
    this.ax[this.index] = x;
    this.ay[this.index] = y;
    this.az[this.index] = z;
    this.ts[this.index] = t;
    this.index = (this.index + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  get size(): number {
    return this.count;
  }

  /**
   * Visit entries newer than `sinceT`, oldest first. Takes a callback so no
   * intermediate array is created.
   */
  forEachSince(sinceT: number, visit: (x: number, y: number, z: number, t: number) => void): void {
    const start = this.count < this.capacity ? 0 : this.index;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      const t = this.ts[idx]!;
      if (t <= sinceT) continue;
      visit(this.ax[idx]!, this.ay[idx]!, this.az[idx]!, t);
    }
  }

  clear(): void {
    this.index = 0;
    this.count = 0;
  }
}
