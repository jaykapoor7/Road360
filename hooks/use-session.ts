'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { getSessionStore, type Channel, type SessionSnapshots } from '@/lib/session/session-store';

/**
 * Subscribe to one channel of the session store and select a primitive from it.
 *
 * The selector MUST return a primitive. React's useSyncExternalStore bails out
 * per-component when the selected value is Object.is-equal to the last, so a
 * component that selects `metrics.hornCount` re-renders only when the horn
 * count actually changes — not on every 1 Hz metrics commit. Returning an
 * object here would defeat the entire anti-re-render design.
 */
export function useSessionValue<C extends Channel, T extends string | number | boolean | null>(
  channel: C,
  select: (snapshot: SessionSnapshots[C]) => T,
): T {
  const store = getSessionStore();

  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(channel, onChange),
    [store, channel],
  );
  const getSnapshot = useCallback(() => select(store.getSnapshot(channel)), [store, channel, select]);
  const getServerSnapshot = useCallback(
    () => select(store.getServerSnapshot(channel)),
    [store, channel, select],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Subscribe to a whole channel snapshot. For the few components that genuinely
 * need the object (the map layer, the event ticker). Snapshots are replaced by
 * reference on commit, so this is still cheap.
 */
export function useSessionChannel<C extends Channel>(channel: C): SessionSnapshots[C] {
  const store = getSessionStore();

  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(channel, onChange),
    [store, channel],
  );
  const getSnapshot = useCallback(() => store.getSnapshot(channel), [store, channel]);
  const getServerSnapshot = useCallback(() => store.getServerSnapshot(channel), [store, channel]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
