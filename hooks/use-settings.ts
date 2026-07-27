'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRepository } from '@/lib/storage/local-repository';
import { DEFAULT_FLAGS, SETTINGS_KEYS, type Flags } from '@/lib/config/flags';

/**
 * App settings, backed by the IndexedDB settings store.
 *
 * Reads once on mount; writes go straight through to storage and update local
 * state optimistically.
 */
export function useSettings() {
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRepository()
      .settings.get<Flags>(SETTINGS_KEYS.flags, DEFAULT_FLAGS)
      .then((stored) => {
        if (!cancelled) {
          setFlags({ ...DEFAULT_FLAGS, ...stored });
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: Partial<Flags>) => {
    setFlags((prev) => {
      const next = { ...prev, ...patch };
      void getRepository().settings.set(SETTINGS_KEYS.flags, next);
      return next;
    });
  }, []);

  return { flags, loaded, update };
}
