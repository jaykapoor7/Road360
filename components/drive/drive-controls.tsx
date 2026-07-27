'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Pause, Play, Square } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { haptic } from '@/lib/platform/haptics';

/**
 * Pause / resume, and a hold-to-end button.
 *
 * Ending a drive is destructive of the recording-in-progress, so it is
 * hold-to-confirm rather than a tap — an accidental brush against the screen
 * mid-drive should not end the trip.
 */
export function DriveControls({
  paused,
  onPause,
  onResume,
  onEnd,
}: {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}) {
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const HOLD_MS = 900;

  const startHold = () => {
    haptic('tap');
    const start = Date.now();
    holdTimer.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / HOLD_MS);
      setHoldProgress(progress);
      if (progress >= 1) {
        clearHold();
        haptic('success');
        onEnd();
      }
    }, 16);
  };

  const clearHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
    setHoldProgress(0);
  };

  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={paused ? onResume : onPause}
        className="glass grid size-16 place-items-center rounded-full text-ink active:scale-95"
        aria-label={paused ? 'Resume' : 'Pause'}
      >
        {paused ? <Play size={24} className="ml-0.5" /> : <Pause size={24} />}
      </button>

      <button
        type="button"
        onPointerDown={startHold}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        className={cn(
          'relative grid size-20 place-items-center overflow-hidden rounded-full',
          'bg-linear-to-b from-rose to-crimson text-white active:scale-95',
        )}
        aria-label="Hold to end drive"
      >
        <motion.span
          className="absolute inset-0 bg-white/30"
          style={{ scaleY: holdProgress, originY: 1 }}
        />
        <Square size={26} className="relative z-10" fill="currentColor" />
      </button>

      <div className="grid size-16 place-items-center">
        <span className="text-center text-[10px] leading-tight font-semibold text-ink-faint">
          hold to
          <br />
          end
        </span>
      </div>
    </div>
  );
}
