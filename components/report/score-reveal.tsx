'use client';

import { motion } from 'framer-motion';
import { ProgressRing } from '@/components/ui/progress-ring';
import { MetricNumber } from '@/components/ui/metric-number';
import { Badge } from '@/components/ui/badge';
import type { Road360Score } from '@/lib/domain/score';
import { bandDefinition } from '@/lib/score/labels';
import { DURATION, EASE } from '@/components/motion/transitions';

/**
 * The hero of the report: a staged reveal of the Road360 Score. The ring draws,
 * the number counts up, then the band label and any caveat fade in beneath.
 *
 * The numeral is a flat band colour rather than a gradient fill. Gradient text
 * clipped to a 72px numeral loses most of its range anyway, and it renders as a
 * transparent hole in browsers that drop `background-clip: text` — a solid
 * colour is the same design with none of the failure modes.
 */
export function ScoreReveal({ score }: { score: Road360Score }) {
  const band = bandDefinition(score.band);

  return (
    <div className="flex flex-col items-center gap-5 py-1">
      <div
        className="aura relative"
        style={{ ['--aura-color' as string]: band.to, ['--aura-opacity' as string]: '0.2' }}
      >
        <ProgressRing
          value={score.value}
          from={band.from}
          to={band.to}
          gradientId="score-hero"
          size={248}
          stroke={12}
          delay={0.15}
        >
          <div className="flex flex-col items-center">
            <div className="eyebrow">Road360 Score</div>
            <div className="num mt-1 text-[76px] leading-none" style={{ color: band.to }}>
              <MetricNumber value={score.value} />
            </div>
            <div className="text-[12px] font-medium text-ink-faint">out of 100</div>
          </div>
        </ProgressRing>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: DURATION.base, ease: EASE.outExpo }}
        className="flex flex-col items-center gap-2.5 text-center"
      >
        <div className="text-[22px] leading-none font-bold tracking-[-0.02em] text-ink">
          {band.label}
        </div>
        <p className="max-w-[17rem] text-[13px] leading-relaxed text-ink-muted">{band.blurb}</p>
        {score.provisional || score.coverage < 0.85 ? (
          <div className="mt-0.5 flex flex-wrap justify-center gap-2">
            {score.provisional ? <Badge tone="warning">Short trip — provisional</Badge> : null}
            {score.coverage < 0.85 ? <Badge tone="neutral">Partial sensor data</Badge> : null}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
