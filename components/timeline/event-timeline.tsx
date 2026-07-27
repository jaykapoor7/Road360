'use client';

import { motion } from 'framer-motion';
import type { TripEvent } from '@/lib/domain/events';
import { buildTimeline } from '@/lib/timeline/presentation';
import { Icon } from '@/components/ui/icon';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDuration } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * The chronological event timeline.
 *
 * Rendered directly from the persisted event log — the same data that drives the
 * replay — so the two can never disagree. `activeIndex` highlights the event the
 * replay playhead is currently at; without a replay it is simply omitted.
 */
export function EventTimeline({
  events,
  activeIndex,
  onSeek,
  compact = false,
}: {
  events: readonly TripEvent[];
  activeIndex?: number;
  onSeek?: (tMs: number) => void;
  compact?: boolean;
}) {
  const entries = buildTimeline(events);

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <p className="py-6 text-center text-sm text-ink-faint">
          A genuinely uneventful drive. Nothing worth flagging.
        </p>
      </Card>
    );
  }

  return (
    <Card className={compact ? 'p-4' : undefined}>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <span className="text-[11px] text-ink-faint">{entries.length} events</span>
      </CardHeader>

      <div className="relative">
        {/* The spine connecting the events. */}
        <div className="absolute top-1 bottom-1 left-[15px] w-px bg-white/10" />

        <div
          className={cn(
            'flex flex-col gap-3',
            compact && 'max-h-72 overflow-y-auto no-scrollbar pr-1',
          )}
        >
          {entries.map((entry, i) => {
            const active = i === activeIndex;
            return (
              <motion.button
                key={`${entry.event.tripId}-${entry.event.seq}`}
                type="button"
                onClick={onSeek ? () => onSeek(entry.t) : undefined}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.02, 0.4) }}
                className={cn(
                  'relative flex items-center gap-3 rounded-xl py-1 pr-2 text-left transition-colors',
                  onSeek && 'hover:bg-white/5',
                  active && 'bg-white/8',
                )}
              >
                <div
                  className={cn(
                    'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 border-void transition-transform',
                    active && 'scale-110',
                  )}
                  style={{ background: `${entry.view.color}22`, color: entry.view.color }}
                >
                  <Icon name={entry.view.icon} size={15} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">
                      {entry.view.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-faint tabular">
                      {formatDuration(entry.t)}
                    </span>
                  </div>
                  <div className="text-[12px] text-ink-muted">{entry.view.detail}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
