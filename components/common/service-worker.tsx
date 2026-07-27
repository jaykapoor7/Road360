'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { getSessionStore } from '@/lib/session/session-store';
import { SPRING } from '@/components/motion/transitions';

/**
 * Registers the service worker and surfaces updates as a prompt.
 *
 * `skipWaiting` is deliberately off in app/sw.ts, so a new build never takes
 * over mid-drive — reloading during a recording would lose the trip. Instead
 * the new worker waits, we show a prompt, and the user activates it when they
 * choose. The prompt is also suppressed entirely while a drive is recording.
 */
export function ServiceWorkerManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let registration: ServiceWorkerRegistration | null = null;

    const onUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          setWaiting(installing);
        }
      });
    };

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', onUpdateFound);
      })
      .catch(() => {
        // Registration failing is not fatal — the app works without offline support.
      });

    // Ask for persistent storage once the app is in use. Safari evicts
    // IndexedDB for non-installed sites after a week of inactivity otherwise.
    void navigator.storage?.persist?.().catch(() => {});

    return () => {
      registration?.removeEventListener('updatefound', onUpdateFound);
    };
  }, []);

  const applyUpdate = () => {
    // Never interrupt an in-progress recording.
    const status = getSessionStore().getSnapshot('status');
    if (status === 'recording' || status === 'paused') return;

    waiting?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {waiting ? (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={SPRING.smooth}
          className="fixed inset-x-4 bottom-[calc(var(--tab-bar-h)+1rem)] z-50 mx-auto max-w-sm"
        >
          <div className="glass-strong flex items-center gap-3 rounded-2xl p-3">
            <RefreshCw size={18} className="shrink-0 text-brand-bright" />
            <span className="flex-1 text-sm text-ink">A new version is ready.</span>
            <button
              type="button"
              onClick={applyUpdate}
              className="rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white"
            >
              Update
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
