import { SAMPLE_INTERVAL_MS } from '@/lib/config/constants';

/**
 * The master clock.
 *
 * One timer drives the whole session. `setInterval` drifts — a 1000 ms interval
 * fires late under load and the error accumulates, so a 30-minute drive can end
 * up tens of seconds short. This reschedules each tick against a target
 * derived from the start time, so drift is corrected rather than compounded.
 *
 * Deliberately not requestAnimationFrame: rAF is locked to the display, wastes
 * power, and is throttled to zero when the page is hidden — all three are wrong
 * for a sensor loop that must survive a screen-off.
 */
export class SessionClock {
  private timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Null when not running. Deliberately not 0 as a sentinel: `performance.now()`
   * legitimately returns 0 at the very start of a document's lifetime, so a
   * zero check would treat a genuinely-started clock as stopped.
   */
  private startedAt: number | null = null;
  private tickCount = 0;
  private pausedAt: number | null = null;
  private pausedTotal = 0;

  constructor(
    private readonly onTick: (tripTimeMs: number) => void,
    private readonly intervalMs: number = SAMPLE_INTERVAL_MS,
  ) {}

  /** Retained after `stop()` so the final trip duration stays readable. */
  private finalElapsed = 0;

  start(): void {
    if (this.timer !== null) return;
    this.startedAt = performance.now();
    this.tickCount = 0;
    this.pausedTotal = 0;
    this.pausedAt = null;
    this.finalElapsed = 0;
    this.schedule();
  }

  private schedule(): void {
    if (this.startedAt === null) return;
    const target = this.startedAt + this.pausedTotal + (this.tickCount + 1) * this.intervalMs;
    const delay = Math.max(0, target - performance.now());

    this.timer = setTimeout(() => {
      this.tickCount += 1;
      if (this.pausedAt === null) {
        this.onTick(this.elapsed());
      }
      this.schedule();
    }, delay);
  }

  /** Trip time in milliseconds, excluding paused spans. */
  elapsed(): number {
    if (this.startedAt === null) return this.finalElapsed;
    const raw = performance.now() - this.startedAt - this.pausedTotal;
    const paused = this.pausedAt !== null ? performance.now() - this.pausedAt : 0;
    return Math.max(0, raw - paused);
  }

  pause(): void {
    if (this.pausedAt === null) this.pausedAt = performance.now();
  }

  resume(): void {
    if (this.pausedAt === null) return;
    this.pausedTotal += performance.now() - this.pausedAt;
    this.pausedAt = null;
  }

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  stop(): void {
    // Capture the duration before tearing down — the trip record and the
    // end-of-trip analytics both read it after the clock has stopped.
    this.finalElapsed = this.elapsed();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.startedAt = null;
    this.tickCount = 0;
    this.pausedAt = null;
    this.pausedTotal = 0;
  }
}
