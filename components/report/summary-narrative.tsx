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
    <motion.div variants={fadeUp} className="rounded-card glass p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={13} className="text-brand" />
        <span className="eyebrow">Your drive, summarised</span>
      </div>

      <p className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-ink">
        {summary.headline}
      </p>
      {summary.narrative && summary.narrative !== summary.headline ? (
        <p className="mt-2.5 text-[14px] leading-relaxed text-ink-muted">
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
