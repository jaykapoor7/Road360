'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronRight, Megaphone, Sparkles } from 'lucide-react';
import type { TripListItem } from '@/lib/domain/trip';
import { bandDefinition } from '@/lib/score/labels';
import {
  formatDistanceLong,
  formatDurationCompact,
  formatTimeOfDay,
  formatDateShort,
} from '@/lib/utils/format';

export function TripRow({ trip, index = 0 }: { trip: TripListItem; index?: number }) {
  const band = bandDefinition(trip.band);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
    >
      <Link href={`/trip/${trip.id}`} className="block">
        <div className="glass flex items-center gap-3 rounded-tile p-3 active:scale-[0.99]">
          <div
            className="grid size-12 shrink-0 place-items-center rounded-xl text-lg font-bold tabular"
            style={{
              background: `linear-gradient(135deg, ${band.from}22, ${band.to}22)`,
              color: band.to,
            }}
          >
            {trip.scoreValue}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-ink">
                {trip.title ?? `${formatDateShort(trip.startedAt)} · ${formatTimeOfDay(trip.startedAt)}`}
              </span>
              {trip.simulated ? (
                <Sparkles size={12} className="shrink-0 text-brand-bright" aria-label="Demo drive" />
              ) : null}
            </div>
            <div className="mt-0.5 flex gap-3 text-[12px] text-ink-muted">
              <span>{formatDistanceLong(trip.distanceM)}</span>
              <span>{formatDurationCompact(trip.durationMs)}</span>
              <span className="flex items-center gap-0.5">
                <Megaphone size={11} /> {trip.hornCount}
              </span>
            </div>
          </div>

          <ChevronRight size={18} className="shrink-0 text-ink-faint" />
        </div>
      </Link>
    </motion.div>
  );
}
