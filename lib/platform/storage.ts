/**
 * Storage durability.
 *
 * Everything Road360 records lives in IndexedDB, and on iOS that is not
 * permanent by default: Safari's storage policy evicts script-writable storage
 * for sites the user has not added to their home screen after roughly seven
 * days without a visit. A commuter who records a fortnight of drives and then
 * takes a week off would come back to an empty app.
 *
 * `navigator.storage.persist()` is the documented way to ask for an exemption.
 * Browsers decide on their own signals — installation, engagement, bookmarks —
 * so the result is a request, not a guarantee, and the caller is expected to
 * treat `false` as "keep nudging the user to install", not as an error.
 */

export type PersistenceState = 'persisted' | 'transient' | 'unsupported';

export async function requestPersistentStorage(): Promise<PersistenceState> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';

  try {
    // Asking again when already granted is wasted work and, in some browsers,
    // re-triggers a prompt.
    if (await navigator.storage.persisted?.()) return 'persisted';
    return (await navigator.storage.persist()) ? 'persisted' : 'transient';
  } catch {
    return 'unsupported';
  }
}

export async function storageEstimate(): Promise<{ usedBytes: number; quotaBytes: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usedBytes: usage ?? 0, quotaBytes: quota ?? 0 };
  } catch {
    return null;
  }
}

/** True when the app is running from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari predates the display-mode media query and uses this instead.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS cannot be prompted programmatically — it needs the Share-sheet instructions. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch-point check separates it.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
