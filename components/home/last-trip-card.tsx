'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronRight, Sparkles } from 'lucide-react';
import type { TripListItem } from '@/lib/domain/trip';
import { bandDefinition } from '@/lib/score/labels';
import {
  formatDistanceLong,
  formatDurationCompact,
  formatDateShort,
  formatTimeOfDay,
} from '@/lib/utils/format';
import { SPRING } from '@/components/motion/transitions';

/**
 * The most recent drive as a compact summary row.
 *
 * The four measurements sit in a fixed grid rather than a wrapping flex row.
 * Wrapped, the last item dropped onto its own line and the card grew a ragged
 * extra row whenever a distance crossed into four digits.
 */
export function LastTripCard({ trip }: { trip: TripListItem }) {
  const band = bandDefinition(trip.band);

  const cells: { label: string; value: string }[] = [
    { label: 'Distance', value: formatDistanceLong(trip.distanceM) },
    { label: 'Time', value: formatDurationCompact(trip.durationMs) },
    { label: 'Horns', value: String(trip.hornCount) },
    { label: 'Noise', value: `${Math.round(trip.avgDb)} dB` },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.smooth}>
      <Link href={`/trip/${trip.id}`} className="block active:scale-[0.99]">
        <div className="rounded-card glass p-4">
          <div className="mb-4 flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: band.to }}
              aria-hidden
            />
            <span className="text-[14px] font-semibold text-ink">{band.label}</span>
            {trip.simulated ? (
              <Sparkles size={13} className="shrink-0 text-brand" aria-label="Demo drive" />
            ) : null}
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] text-ink-faint">
              {formatDateShort(trip.startedAt)} · {formatTimeOfDay(trip.startedAt)}
              <ChevronRight size={15} />
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {cells.map((cell) => (
              <div key={cell.label}>
                <div className="eyebrow mb-1 truncate">{cell.label}</div>
                <div className="num text-[17px] text-ink">{cell.value}</div>
              </div>
            ))}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
