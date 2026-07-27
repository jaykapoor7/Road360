'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { TripSummary } from '@/lib/domain/summary';
import { fadeUp } from '@/components/motion/transitions';

/**
 * The "AI summary". It is a deterministic template render, presented as prose:
 * a headline stat followed by a short narrative built from the top insights.
 */
export function SummaryNarrative({ summary }: { summary: TripSummary }) {
  return (
    <motion.div variants={fadeUp} className="rounded-card glass-strong p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-lg bg-brand/20">
          <Sparkles size={15} className="text-brand-bright" />
        </div>
        <span className="text-[11px] font-semibold tracking-[0.13em] text-ink-faint uppercase">
          Your drive, summarised
        </span>
      </div>

      <p className="text-lg leading-snug font-semibold text-ink">{summary.headline}</p>
      {summary.narrative && summary.narrative !== summary.headline ? (
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          {stripLeadingHeadline(summary.narrative, summary.headline)}
        </p>
      ) : null}
    </motion.div>
  );
}

/** The narrative opens with the headline; don't print it twice. */
function stripLeadingHeadline(narrative: string, headline: string): string {
  if (narrative.startsWith(headline)) {
    return narrative.slice(headline.length).trim() || narrative;
  }
  return narrative;
}
