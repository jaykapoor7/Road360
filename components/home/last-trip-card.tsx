'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronRight, Megaphone, Volume2, Route } from 'lucide-react';
import type { TripListItem } from '@/lib/domain/trip';
import { bandDefinition } from '@/lib/score/labels';
import { formatDistanceLong, formatDurationCompact, formatDateShort, formatTimeOfDay } from '@/lib/utils/format';
import { SPRING } from '@/components/motion/transitions';

/** The most recent drive, shown as a hero card on the home screen. */
export function LastTripCard({ trip }: { trip: TripListItem }) {
  const band = bandDefinition(trip.band);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.smooth}>
      <Link href={`/trip/${trip.id}`} className="block">
        <div
          className="aura relative overflow-hidden rounded-card glass-strong p-5"
          style={{ ['--aura-color' as string]: band.to, ['--aura-opacity' as string]: '0.22' }}
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.13em] text-ink-faint uppercase">
                Last drive
              </div>
              <div className="mt-0.5 text-sm text-ink-muted">
                {formatDateShort(trip.startedAt)} · {formatTimeOfDay(trip.startedAt)}
              </div>
            </div>
            <ChevronRight size={20} className="text-ink-faint" />
          </div>

          <div className="flex items-center gap-4">
            <div
              className="grid size-20 shrink-0 place-items-center rounded-2xl"
              style={{ background: `linear-gradient(135deg, ${band.from}22, ${band.to}22)` }}
            >
              <div className="text-center">
                <div
                  className="text-gradient text-3xl font-bold tabular"
                  style={{ backgroundImage: `linear-gradient(135deg, ${band.from}, ${band.to})` }}
                >
                  {trip.scoreValue}
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2 text-lg font-bold text-ink">
                {band.emoji} {band.label}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
                <span className="flex items-center gap-1">
                  <Route size={13} /> {formatDistanceLong(trip.distanceM)}
                </span>
                <span className="flex items-center gap-1">
                  <Megaphone size={13} /> {trip.hornCount} horns
                </span>
                <span className="flex items-center gap-1">
                  <Volume2 size={13} /> {Math.round(trip.avgDb)} dB
                </span>
                <span>{formatDurationCompact(trip.durationMs)}</span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
