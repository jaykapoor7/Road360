'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Activity, ArrowRight, Lock, MapPin, Sparkles, Volume2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { TabBar } from '@/components/layout/tab-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressRing } from '@/components/ui/progress-ring';
import { MetricRow, SectionLabel } from '@/components/ui/metric-row';
import { LastTripCard } from '@/components/home/last-trip-card';
import { InstallPrompt } from '@/components/common/install-prompt';
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

  // Null until mounted — see the header comment below.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

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
          {/*
            The greeting and date are rendered only after mount, and the header
            keeps its height in the meantime.

            This route is statically prerendered, so anything derived from the
            clock is frozen at build time and computed in the build machine's
            timezone — the shipped HTML literally said "Late night" and carried
            the date the bundle was compiled. Deferring to the client is the
            only way the first paint is not simply wrong.
          */}
          <motion.header variants={fadeUp} className="min-h-[3.25rem]">
            {now !== null ? (
              <>
                <p className="eyebrow">{greetingFor(now)}</p>
                <h1 className="mt-1.5 text-[22px] leading-none font-bold tracking-[-0.02em] text-ink">
                  {formatDateLong(now)}
                </h1>
              </>
            ) : null}
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
              <div className="flex flex-col items-center text-center">
                <ProgressRing
                  value={0}
                  from="#8590A4"
                  to="#6F7C92"
                  gradientId="home-empty"
                  size={224}
                  stroke={11}
                >
                  <div className="flex flex-col items-center px-10">
                    <span className="eyebrow">Road360 Score</span>
                    <span className="num mt-1 text-[68px] leading-none text-ink-faint">—</span>
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
                Try a demo drive — no car needed
              </Link>
            ) : null}
          </motion.div>

          {/*
            First run only. Someone arriving from a link is about to be asked
            for a microphone and their location by a site they have never heard
            of; saying what each one is for, and that nothing leaves the phone,
            belongs before that prompt rather than buried in Settings.
          */}
          {!lastTrip && !loading ? (
            <motion.div variants={fadeUp}>
              <SectionLabel>What this does</SectionLabel>
              <div className="rounded-card glass px-4 py-1">
                <ExplainerRow
                  icon={<Volume2 size={15} />}
                  title="Listens for horns and noise"
                  detail="The microphone measures loudness and picks out horns. Audio is analysed on the fly and never recorded or stored."
                />
                <ExplainerRow
                  icon={<Activity size={15} />}
                  title="Feels hard braking"
                  detail="Motion sensors catch hard stops and sharp acceleration."
                />
                <ExplainerRow
                  icon={<MapPin size={15} />}
                  title="Maps the route"
                  detail="Location draws your route and works out distance and stop-and-go."
                />
                <ExplainerRow
                  icon={<Lock size={15} />}
                  title="Stays on your phone"
                  detail="No account, no upload, no tracking. Everything is stored in this browser and you can delete it all in Settings."
                  last
                />
              </div>
            </motion.div>
          ) : null}

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
      <InstallPrompt tripCount={trips.length} />
      <TabBar />
    </>
  );
}

function ExplainerRow({
  icon,
  title,
  detail,
  last = false,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <div className={`flex gap-3 py-3.5 ${last ? '' : 'border-b border-hairline'}`}>
      <span className="mt-0.5 shrink-0 text-ink-faint">{icon}</span>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ink">{title}</div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{detail}</p>
      </div>
    </div>
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
