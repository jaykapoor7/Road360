'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { TabBar } from '@/components/layout/tab-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressRing } from '@/components/ui/progress-ring';
import { MetricRow, SectionLabel } from '@/components/ui/metric-row';
import { LastTripCard } from '@/components/home/last-trip-card';
import { useTrips, useLifetime } from '@/hooks/use-trips';
import { bandDefinition } from '@/lib/score/labels';
import { startOfWeek } from '@/lib/utils/time';
import {
  greetingFor,
  formatDistanceLong,
  formatDurationCompact,
  formatDateLong,
} from '@/lib/utils/format';
import { fadeUp, staggerParent } from '@/components/motion/transitions';

export default function HomePage() {
  const { trips, loading } = useTrips();
  const { lifetime } = useLifetime();
  const lastTrip = trips[0] ?? null;

  // Computed from the list already in memory rather than a second IndexedDB
  // read — the home screen should never wait on two round-trips to paint.
  const week = useMemo(() => {
    const since = startOfWeek(Date.now());
    const recent = trips.filter((t) => t.startedAt >= since);
    if (recent.length === 0) return null;
    return {
      count: recent.length,
      avgScore: Math.round(recent.reduce((a, t) => a + t.scoreValue, 0) / recent.length),
      distanceM: recent.reduce((a, t) => a + t.distanceM, 0),
      horns: recent.reduce((a, t) => a + t.hornCount, 0),
    };
  }, [trips]);

  const band = lastTrip ? bandDefinition(lastTrip.band) : null;

  return (
    <>
      <AppShell>
        <motion.div
          variants={staggerParent(0.06)}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-7"
        >
          <motion.header variants={fadeUp}>
            <p className="eyebrow">{greetingFor()}</p>
            <h1 className="mt-1.5 text-[22px] leading-none font-bold tracking-[-0.02em] text-ink">
              {formatDateLong(Date.now())}
            </h1>
          </motion.header>

          {/* Hero — the last drive's score, or an invitation to record one. */}
          <motion.div variants={fadeUp} className="flex flex-col items-center">
            {loading ? (
              <Skeleton className="size-[220px] rounded-full" />
            ) : lastTrip && band ? (
              <Link href={`/trip/${lastTrip.id}`} className="active:scale-[0.99]">
                <div
                  className="aura relative"
                  style={{
                    ['--aura-color' as string]: band.to,
                    ['--aura-opacity' as string]: '0.18',
                  }}
                >
                  <ProgressRing
                    value={lastTrip.scoreValue}
                    from={band.from}
                    to={band.to}
                    gradientId="home-hero"
                    size={224}
                    stroke={11}
                    delay={0.1}
                  >
                    <div className="flex flex-col items-center">
                      <span className="eyebrow">Last drive</span>
                      <span
                        className="num mt-1 text-[68px] leading-none"
                        style={{ color: band.to }}
                      >
                        {lastTrip.scoreValue}
                      </span>
                      <span className="mt-1.5 text-[13px] font-semibold text-ink-muted">
                        {band.label}
                      </span>
                    </div>
                  </ProgressRing>
                </div>
              </Link>
            ) : (
              <div className="flex flex-col items-center py-6 text-center">
                <ProgressRing
                  value={0}
                  from="#4EA8FF"
                  to="#6E8BFF"
                  gradientId="home-empty"
                  size={224}
                  stroke={11}
                >
                  <div className="flex flex-col items-center px-10">
                    <span className="eyebrow">Road360 Score</span>
                    <span className="num mt-1 text-[68px] leading-none text-ink-faint">--</span>
                    <span className="mt-1.5 text-[13px] text-ink-muted">No drives yet</span>
                  </div>
                </ProgressRing>
              </div>
            )}
          </motion.div>

          {/* Primary action */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3">
            <Link
              href="/drive"
              className="flex h-14 items-center justify-center gap-2 rounded-pill bg-ink text-[16px] font-bold text-void transition-transform active:scale-[0.97]"
            >
              Start drive
              <ArrowRight size={18} />
            </Link>
            {!lastTrip && !loading ? (
              <Link
                href="/drive?demo=1"
                className="flex h-11 items-center justify-center gap-2 rounded-pill border border-hairline bg-surface text-[14px] font-semibold text-ink-muted transition-transform active:scale-[0.97]"
              >
                <Sparkles size={15} className="text-brand" />
                Try a demo drive
              </Link>
            ) : null}
          </motion.div>

          {lastTrip ? (
            <motion.div variants={fadeUp}>
              <SectionLabel>Most recent</SectionLabel>
              <LastTripCard trip={lastTrip} />
            </motion.div>
          ) : null}

          {week ? (
            <motion.div variants={fadeUp}>
              <SectionLabel>This week</SectionLabel>
              <div className="grid grid-cols-4 gap-2 rounded-card glass p-4">
                <WeekCell label="Drives" value={String(week.count)} />
                <WeekCell label="Avg" value={String(week.avgScore)} />
                <WeekCell label="Distance" value={formatDistanceLong(week.distanceM)} />
                <WeekCell label="Horns" value={String(week.horns)} />
              </div>
            </motion.div>
          ) : null}

          {lifetime.tripCount > 0 ? (
            <motion.div variants={fadeUp}>
              <SectionLabel>Lifetime</SectionLabel>
              <div className="rounded-card glass px-4 py-1">
                <MetricRow label="Drives" value={lifetime.tripCount.toLocaleString()} />
                <MetricRow label="Distance" value={formatDistanceLong(lifetime.totalDistanceM)} />
                <MetricRow
                  label="Time driving"
                  value={formatDurationCompact(lifetime.totalDurationMs)}
                />
                <MetricRow label="Horns witnessed" value={lifetime.totalHorns.toLocaleString()} />
                <MetricRow
                  label="Average score"
                  value={Math.round(lifetime.avgScore)}
                  last
                />
              </div>
            </motion.div>
          ) : null}
        </motion.div>
      </AppShell>
      <TabBar />
    </>
  );
}

function WeekCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow mb-1 truncate">{label}</div>
      <div className="num truncate text-[17px] text-ink">{value}</div>
    </div>
  );
}
