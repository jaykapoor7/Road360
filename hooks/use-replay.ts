'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ReplayClock, type ReplaySpeed } from '@/lib/replay/replay-clock';

/**
 * React binding for the replay clock. The clock owns all timing; this hook just
 * subscribes React to it and exposes the controls.
 */
export function useReplay(durationMs: number) {
  const clockRef = useRef<ReplayClock | null>(null);
  if (!clockRef.current) clockRef.current = new ReplayClock(durationMs);
  const clock = clockRef.current;

  useEffect(() => {
    return () => clock.dispose();
  }, [clock]);

  const state = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);

  const controls = useMemo(
    () => ({
      play: () => clock.play(),
      pause: () => clock.pause(),
      toggle: () => clock.toggle(),
      seek: (ms: number) => clock.seek(ms),
      setSpeed: (speed: ReplaySpeed) => clock.setSpeed(speed),
    }),
    [clock],
  );

  return { state, controls };
}
