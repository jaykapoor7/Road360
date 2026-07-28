'use client';

import { motion } from 'framer-motion';
import type { Comparison } from '@/lib/domain/summary';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils/cn';
import { staggerParent, fadeUp } from '@/components/motion/transitions';

const TONE_STYLES = {
  positive: 'text-mint',
  neutral: 'text-ink-muted',
  negative: 'text-rose',
} as const;

/**
 * The comparison deck — each card anchored to a real measurement from the drive.
 *
 * Stacked rather than a horizontal snap-scroll. The carousel put a 76%-wide
 * track inside a page that was already the width of the phone, and the
 * overflowing cards dragged the whole document sideways: every screen picked up
 * a horizontal scrollbar and the app could be panned off its own layout. A
 * vertical stack costs one gesture and cannot do that.
 */
export function ComparisonCards({ comparisons }: { comparisons: Comparison[] }) {
  return (
    <motion.div
      variants={staggerParent(0.06)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-2"
    >
      {comparisons.map((comparison) => (
        <motion.div key={comparison.id} variants={fadeUp}>
          <div className="flex items-start gap-3.5 rounded-card glass p-4">
            <div
              className={cn(
                'mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2',
                TONE_STYLES[comparison.tone],
              )}
            >
              <Icon name={comparison.icon} size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] leading-snug font-semibold text-ink">
                {comparison.headline}
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                {comparison.detail}
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
