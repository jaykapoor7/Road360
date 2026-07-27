/**
 * Screen wake lock.
 *
 * A drive can last an hour, and a phone left untouched dims and locks within a
 * minute — which on iOS suspends the page and stops tracking. Holding a wake
 * lock keeps the screen on for the duration.
 *
 * The lock is released automatically whenever the page is hidden, so it must be
 * re-acquired on `visibilitychange` — hence the re-request in `attach`.
 *
 * This lives in lib/platform so a native port can swap it for the platform's
 * own keep-awake without touching any caller.
 */
export interface WakeLock {
  acquire(): Promise<void>;
  release(): Promise<void>;
  attachVisibilityHandler(): () => void;
  readonly held: boolean;
}

export class ScreenWakeLock implements WakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  get held(): boolean {
    return this.sentinel !== null;
  }

  async acquire(): Promise<void> {
    this.wanted = true;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (this.sentinel) return;

    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
    } catch {
      // Denied or unsupported — not fatal, the drive still records.
      this.sentinel = null;
    }
  }

  async release(): Promise<void> {
    this.wanted = false;
    if (!this.sentinel) return;
    try {
      await this.sentinel.release();
    } catch {
      // ignore
    }
    this.sentinel = null;
  }

  /** Re-acquire on return to foreground. Returns a detach function. */
  attachVisibilityHandler(): () => void {
    if (typeof document === 'undefined') return () => {};

    const handler = () => {
      if (document.visibilityState === 'visible' && this.wanted && !this.sentinel) {
        void this.acquire();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }
}
