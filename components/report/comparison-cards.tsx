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
 * The humorous comparison deck. A horizontal snap-scroll of cards, each anchored
 * to a real measurement from the drive.
 */
export function ComparisonCards({ comparisons }: { comparisons: Comparison[] }) {
  return (
    <motion.div
      variants={staggerParent(0.06)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
      className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1"
    >
      {comparisons.map((comparison) => (
        <motion.div
          key={comparison.id}
          variants={fadeUp}
          className="w-[76%] shrink-0 snap-start"
        >
          <div className="glass flex h-full flex-col gap-3 rounded-card p-5">
            <div
              className={cn(
                'grid size-10 place-items-center rounded-xl bg-white/6',
                TONE_STYLES[comparison.tone],
              )}
            >
              <Icon name={comparison.icon} size={20} />
            </div>
            <div className="text-lg leading-tight font-bold text-ink">{comparison.headline}</div>
            <div className="text-[13px] leading-relaxed text-ink-muted">{comparison.detail}</div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
