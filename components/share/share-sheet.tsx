'use client';

import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { TripRecord } from '@/lib/domain/trip';
import { SPRING } from '@/components/motion/transitions';

/**
 * Share sheet. Fleshed out in the share-cards phase with an off-screen rendered
 * PNG card and the Web Share fallback chain; this is the shell it mounts into.
 */
export function ShareSheet({ trip: _trip, onClose }: { trip: TripRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={SPRING.smooth}
        className="glass-strong relative z-10 w-full max-w-md rounded-t-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Share this drive</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-ink-muted">Share cards are coming together — check back shortly.</p>
      </motion.div>
    </div>
  );
}
