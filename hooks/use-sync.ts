'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SyncEngine, type SyncStatus } from '@/lib/sync/sync-engine';
import { MemoryTransport } from '@/lib/sync/memory-transport';
import { HttpTransport } from '@/lib/sync/http-transport';
import type { SyncTransport } from '@/lib/sync/transport';
import { getRepository, getDeviceId } from '@/lib/storage/local-repository';

/**
 * Sync lifecycle.
 *
 * The transport is chosen once and kept in a ref: rebuilding it per render
 * would drop the in-flight run and the cursor. With no `NEXT_PUBLIC_SYNC_URL`
 * configured it falls back to the in-memory server, which makes the whole
 * feature demonstrable — you can push, pull and resolve conflicts locally —
 * without pretending a backend exists.
 */
const IDLE_STATUS: SyncStatus = {
  enabled: false,
  phase: 'idle',
  pending: 0,
  lastSyncAt: null,
  lastError: null,
  pushed: 0,
  pulled: 0,
  conflicts: 0,
};

function createTransport(): { transport: SyncTransport; isDemo: boolean } {
  const url = process.env.NEXT_PUBLIC_SYNC_URL;
  if (url) return { transport: new HttpTransport({ baseUrl: url }), isDemo: false };
  return { transport: new MemoryTransport(), isDemo: true };
}

export function useSync(enabled: boolean) {
  const [status, setStatus] = useState<SyncStatus>(IDLE_STATUS);
  const [syncing, setSyncing] = useState(false);
  const engineRef = useRef<SyncEngine | null>(null);
  const isDemoRef = useRef(true);

  const ensureEngine = useCallback(async () => {
    if (engineRef.current) return engineRef.current;
    const { transport, isDemo } = createTransport();
    isDemoRef.current = isDemo;
    engineRef.current = new SyncEngine({
      repository: getRepository(),
      transport,
      deviceId: await getDeviceId(),
    });
    return engineRef.current;
  }, []);

  // Show the pending count even before the first sync, so the user can see
  // there is work queued.
  useEffect(() => {
    let active = true;
    void (async () => {
      const pending = await getRepository().outbox.size();
      if (active) setStatus((prev) => ({ ...prev, pending, enabled }));
    })();
    return () => {
      active = false;
    };
  }, [enabled, syncing]);

  const sync = useCallback(async () => {
    if (!enabled) return;
    setSyncing(true);
    try {
      const engine = await ensureEngine();
      setStatus({ ...(await engine.sync()), enabled: true });
    } finally {
      setSyncing(false);
    }
  }, [enabled, ensureEngine]);

  return { status, syncing, sync, isDemo: isDemoRef.current };
}
