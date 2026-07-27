/**
 * Haptic feedback.
 *
 * A thin, best-effort wrapper over the Vibration API. Isolated here so a native
 * port can replace it with real Taptic Engine calls, and so callers never have
 * to feature-detect.
 */
export type HapticPattern = 'tap' | 'success' | 'warning' | 'impact';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 12,
  success: [10, 40, 10],
  warning: [20, 60, 20],
  impact: 30,
};

export function haptic(pattern: HapticPattern): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw if called outside a user gesture; ignore.
  }
}
