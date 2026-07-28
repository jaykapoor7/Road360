'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Compass, Sparkles } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { TabBar } from '@/components/layout/tab-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { TripRow } from '@/components/history/trip-row';
import { AchievementGrid } from '@/components/history/achievement-grid';
import { useTrips } from '@/hooks/use-trips';
import { useAchievements } from '@/hooks/use-achievements';
import type { TripListItem } from '@/lib/domain/trip';
import { pluralise } from '@/lib/utils/format';
import { fadeUp } from '@/components/motion/transitions';

/** Group trips by ISO week so the list reads as a history, not a flat dump. */
function groupByWeek(trips: TripListItem[]): { key: string; label: string; trips: TripListItem[] }[] {
  const groups = new Map<string, TripListItem[]>();
  for (const trip of trips) {
    const list = groups.get(trip.weekKey) ?? [];
    list.push(trip);
    groups.set(trip.weekKey, list);
  }

  const thisWeek = trips[0]?.weekKey;
  return [...groups.entries()].map(([key, list]) => ({
    key,
    label:
      key === thisWeek
        ? 'This week'
        : new Date(list[0]!.startedAt).toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          }),
    trips: list,
  }));
}

export default function HistoryPage() {
  const { trips, loading } = useTrips();
  const { views } = useAchievements();
  const groups = useMemo(() => groupByWeek(trips), [trips]);

  return (
    <>
      <AppShell>
        <PageHeader
          title="History"
          subtitle={`${trips.length} ${pluralise(trips.length, 'drive')} recorded`}
        />

        {loading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[68px]" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <div className="rounded-card glass p-8 text-center">
              <Compass size={30} className="mx-auto mb-3 text-ink-faint" />
              <h2 className="text-[16px] font-bold text-ink">No drives yet</h2>
              <p className="mx-auto mt-2 max-w-[18rem] text-[13px] leading-relaxed text-ink-muted">
                Your drives will appear here with their scores and reports.
              </p>
              <Link
                href="/drive?demo=1"
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-pill border border-hairline bg-surface-2 px-4 text-[13px] font-semibold text-ink"
              >
                <Sparkles size={15} className="text-brand" /> Try a demo drive
              </Link>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-6">
            {views.length > 0 ? <AchievementGrid views={views} /> : null}

            {groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                <h2 className="eyebrow px-0.5">{group.label}</h2>
                {group.trips.map((trip, i) => (
                  <TripRow key={trip.id} trip={trip} index={i} />
                ))}
              </section>
            ))}
          </div>
        )}
      </AppShell>
      <TabBar />
    </>
  );
}
