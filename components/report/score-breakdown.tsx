'use client';

import { motion } from 'framer-motion';
import type { Road360Score, SubScoreKey } from '@/lib/domain/score';
import { SUB_SCORE_KEYS } from '@/lib/domain/score';
import { SUB_SCORE_LABELS } from '@/lib/score/labels';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { staggerParent } from '@/components/motion/transitions';

/** Colour a sub-score by how calm it is: green high, rose low. */
function barColor(value: number): string {
  if (value >= 75) return '#34d399';
  if (value >= 50) return '#fbbf24';
  if (value >= 30) return '#fb923c';
  return '#fb7185';
}

/**
 * The six sub-scores, each as a bar with its raw measurement.
 *
 * Showing the raw value (e.g. "3.2 horns/min") beside each bar is what makes the
 * overall score explicable rather than a black box — the reader can see exactly
 * which signal cost them points. Unavailable sub-scores are shown greyed with
 * why, not hidden.
 */
export function ScoreBreakdown({ score }: { score: Road360Score }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Score breakdown</CardTitle>
      </CardHeader>

      <motion.div
        variants={staggerParent(0.05)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
        className="flex flex-col gap-3.5"
      >
        {SUB_SCORE_KEYS.map((key) => (
          <SubScoreRow key={key} scoreKey={key} score={score} />
        ))}
      </motion.div>
    </Card>
  );
}

function SubScoreRow({ scoreKey, score }: { scoreKey: SubScoreKey; score: Road360Score }) {
  const sub = score.breakdown[scoreKey];
  const label = SUB_SCORE_LABELS[scoreKey];

  if (!sub.available) {
    return (
      <div className="flex items-center justify-between opacity-45">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
        <span className="text-xs text-ink-faint">not measured</span>
      </div>
    );
  }

  const rawLabel = formatRaw(sub.raw, sub.unit);

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs text-ink-muted tabular">{rawLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="h-full rounded-full"
          style={{ background: barColor(sub.value) }}
          initial={{ width: 0 }}
          whileInView={{ width: `${sub.value}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </motion.div>
  );
}

function formatRaw(raw: number, unit: string): string {
  if (unit === 'dB') return `${Math.round(raw)} dB`;
  if (unit === 'ratio') return `${Math.round(raw * 100)}% stopped`;
  if (unit === 'm/s³') return `${raw.toFixed(1)} jerk`;
  return `${raw.toFixed(raw < 10 ? 1 : 0)} ${unit}`;
}
