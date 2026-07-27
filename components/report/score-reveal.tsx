'use client';

import { motion } from 'framer-motion';
import { ProgressRing } from '@/components/ui/progress-ring';
import { MetricNumber } from '@/components/ui/metric-number';
import { Badge } from '@/components/ui/badge';
import type { Road360Score } from '@/lib/domain/score';
import { bandDefinition } from '@/lib/score/labels';
import { DURATION, EASE } from '@/components/motion/transitions';

/**
 * The hero of the report: a staged reveal of the Road360 Score, Wrapped-style.
 * The ring draws, the number counts up, then the band label and any partial-data
 * note fade in beneath.
 */
export function ScoreReveal({ score }: { score: Road360Score }) {
  const band = bandDefinition(score.band);

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div
        className="aura relative"
        style={{ ['--aura-color' as string]: band.to, ['--aura-opacity' as string]: '0.35' }}
      >
        <ProgressRing
          value={score.value}
          from={band.from}
          to={band.to}
          gradientId="score-hero"
          size={240}
          stroke={16}
          delay={0.15}
        >
          <div className="flex flex-col items-center">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
              Road360 Score
            </div>
            <div
              className="text-gradient text-7xl font-bold tabular"
              style={{ backgroundImage: `linear-gradient(135deg, ${band.from}, ${band.to})` }}
            >
              <MetricNumber value={score.value} />
            </div>
            <div className="text-sm font-semibold text-ink-muted">out of 100</div>
          </div>
        </ProgressRing>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: DURATION.base, ease: EASE.outExpo }}
        className="flex flex-col items-center gap-2 text-center"
      >
        <div className="text-2xl font-bold text-ink">
          {band.emoji} {band.label}
        </div>
        <p className="max-w-xs text-sm text-ink-muted">{band.blurb}</p>
        <div className="flex gap-2">
          {score.provisional ? <Badge tone="warning">Short trip — provisional</Badge> : null}
          {score.coverage < 0.85 ? <Badge tone="neutral">Partial sensor data</Badge> : null}
        </div>
      </motion.div>
    </div>
  );
}
