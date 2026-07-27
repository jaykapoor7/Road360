/**
 * The replay playhead.
 *
 * Pure TypeScript with a `useSyncExternalStore` interface, so the same clock
 * could drive a React, native, or headless renderer. It advances real time by
 * the current speed multiplier and notifies subscribers; the React layer reads
 * the playhead and paints, but owns none of the timing logic.
 *
 * requestAnimationFrame IS correct here — this is a foreground animation, unlike
 * the sensor loop where rAF would be throttled with the screen off.
 */
export type ReplaySpeed = 1 | 2 | 4 | 8;

export interface ReplayState {
  playing: boolean;
  /** Current playhead position, ms into the trip. */
  positionMs: number;
  durationMs: number;
  speed: ReplaySpeed;
}

export class ReplayClock {
  private state: ReplayState;
  private listeners = new Set<() => void>();
  private raf = 0;
  private lastFrameAt = 0;

  constructor(durationMs: number) {
    this.state = { playing: false, positionMs: 0, durationMs, speed: 1 };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ReplayState => this.state;

  private emit(next: Partial<ReplayState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  play(): void {
    if (this.state.playing) return;
    // Restart from the beginning if the playhead is parked at the end.
    const from = this.state.positionMs >= this.state.durationMs ? 0 : this.state.positionMs;
    this.emit({ playing: true, positionMs: from });
    this.lastFrameAt = performance.now();
    this.loop();
  }

  pause(): void {
    if (!this.state.playing) return;
    cancelAnimationFrame(this.raf);
    this.emit({ playing: false });
  }

  toggle(): void {
    if (this.state.playing) this.pause();
    else this.play();
  }

  seek(positionMs: number): void {
    const clamped = Math.max(0, Math.min(positionMs, this.state.durationMs));
    this.emit({ positionMs: clamped });
    this.lastFrameAt = performance.now();
  }

  setSpeed(speed: ReplaySpeed): void {
    this.emit({ speed });
  }

  private loop = (): void => {
    if (!this.state.playing) return;

    const now = performance.now();
    const elapsed = (now - this.lastFrameAt) * this.state.speed;
    this.lastFrameAt = now;

    const next = this.state.positionMs + elapsed;
    if (next >= this.state.durationMs) {
      this.emit({ positionMs: this.state.durationMs, playing: false });
      return;
    }

    this.emit({ positionMs: next });
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
  }
}
