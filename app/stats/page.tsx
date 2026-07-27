'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Volume2, Megaphone, Route, Clock, Flame, ChevronRight } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { TabBar } from '@/components/layout/tab-bar';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TrendChart, type TrendPoint } from '@/components/stats/trend-chart';
import { useTrips, useLifetime } from '@/hooks/use-trips';
import {
  formatDistanceLong,
  formatDurationCompact,
  formatDurationWords,
  formatDateShort,
  monthKeyLabel,
} from '@/lib/utils/format';
import { bandDefinition } from '@/lib/score/labels';
import { staggerParent, fadeUp } from '@/components/motion/transitions';

type Period = 'week' | 'month' | 'all';

const PERIOD_OPTIONS = [
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
  { value: 'all' as const, label: 'All' },
];

const PERIOD_MS: Record<Period, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  all: Number.MAX_SAFE_INTEGER,
};

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('week');
  // Demo drives are excluded so the dashboard reflects real driving.
  const { trips } = useTrips(false);
  const { lifetime, records } = useLifetime();

  const inPeriod = useMemo(() => {
    const cutoff = Date.now() - PERIOD_MS[period];
    return trips.filter((t) => t.startedAt >= cutoff);
  }, [trips, period]);

  const scoreTrend: TrendPoint[] = useMemo(
    () =>
      [...inPeriod]
        .sort((a, b) => a.startedAt - b.startedAt)
        .map((t) => ({ label: formatDateShort(t.startedAt), value: t.scoreValue })),
    [inPeriod],
  );

  const noiseTrend: TrendPoint[] = useMemo(
    () =>
      [...inPeriod]
        .sort((a, b) => a.startedAt - b.startedAt)
        .map((t) => ({ label: formatDateShort(t.startedAt), value: t.avgDb })),
    [inPeriod],
  );

  const periodTotals = useMemo(() => {
    const distance = inPeriod.reduce((acc, t) => acc + t.distanceM, 0);
    const horns = inPeriod.reduce((acc, t) => acc + t.hornCount, 0);
    const duration = inPeriod.reduce((acc, t) => acc + t.durationMs, 0);
    const avgScore =
      inPeriod.length > 0
        ? inPeriod.reduce((acc, t) => acc + t.scoreValue, 0) / inPeriod.length
        : 0;
    return { distance, horns, duration, avgScore };
  }, [inPeriod]);

  const currentMonth = monthKeyLabel(new Date());

  return (
    <>
      <AppShell>
        <PageHeader title="Stats" subtitle="Your driving over time" />

        <motion.div variants={staggerParent(0.06)} initial="hidden" animate="show" className="flex flex-col gap-5">
          <motion.div variants={fadeUp}>
            <SegmentedControl
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              layoutId="stats-period"
            />
          </motion.div>

          {/* Wrapped entry point */}
          <motion.div variants={fadeUp}>
            <Link href="/wrapped/month" className="block">
              <div
                className="aura relative overflow-hidden rounded-card bg-linear-to-br from-brand to-crimson p-5 text-white active:scale-[0.99]"
                style={{ ['--aura-color' as string]: '#f43f5e', ['--aura-opacity' as string]: '0.4' }}
              >
                <div className="grain absolute inset-0" />
                <div className="relative flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.13em] text-white/70 uppercase">
                      Road360 Wrapped
                    </div>
                    <div className="mt-0.5 text-xl font-bold">{currentMonth}</div>
                    <div className="mt-0.5 text-sm text-white/80">Your month on the road</div>
                  </div>
                  <ChevronRight size={22} />
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Period totals */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
            <StatTile label="Avg score" icon={<Trophy size={13} />} accent="#818cf8">
              {Math.round(periodTotals.avgScore) || '—'}
            </StatTile>
            <StatTile label="Drives" icon={<Route size={13} />}>
              {inPeriod.length}
            </StatTile>
            <StatTile label="Distance" icon={<Route size={13} />} accent="#34d399">
              {formatDistanceLong(periodTotals.distance)}
            </StatTile>
            <StatTile label="Horns" icon={<Megaphone size={13} />} accent="#fbbf24">
              {periodTotals.horns}
            </StatTile>
          </motion.div>

          <motion.div variants={fadeUp}>
            <TrendChart title="Score trend" points={scoreTrend} color="#818cf8" />
          </motion.div>

          <motion.div variants={fadeUp}>
            <TrendChart title="Noise trend" points={noiseTrend} unit=" dB" color="#fbbf24" />
          </motion.div>

          {/* Lifetime */}
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader>
                <CardTitle>Lifetime</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-2.5">
                <LifetimeRow
                  icon={<Route size={14} />}
                  label="Total distance"
                  value={formatDistanceLong(lifetime.totalDistanceM)}
                />
                <LifetimeRow
                  icon={<Clock size={14} />}
                  label="Time driving"
                  value={formatDurationWords(lifetime.totalDurationMs)}
                />
                <LifetimeRow
                  icon={<Megaphone size={14} />}
                  label="Horns witnessed"
                  value={lifetime.totalHorns.toLocaleString()}
                />
                <LifetimeRow
                  icon={<Volume2 size={14} />}
                  label="Average noise"
                  value={lifetime.avgDb > 0 ? `${Math.round(lifetime.avgDb)} dB` : '—'}
                />
                <LifetimeRow
                  icon={<Flame size={14} />}
                  label="Excellent streak"
                  value={`${lifetime.currentExcellentStreak} in a row`}
                />
                {lifetime.longestPeacefulSilenceMs > 0 ? (
                  <LifetimeRow
                    icon={<Trophy size={14} />}
                    label="Longest peaceful drive"
                    value={formatDurationCompact(lifetime.longestPeacefulSilenceMs)}
                  />
                ) : null}
              </div>
            </Card>
          </motion.div>

          {/* Personal records */}
          {records.bestScore ? (
            <motion.div variants={fadeUp}>
              <Card>
                <CardHeader>
                  <CardTitle>Personal records</CardTitle>
                </CardHeader>
                <div className="flex flex-col gap-2.5">
                  <RecordRow
                    label="Calmest drive"
                    value={String(records.bestScore.value)}
                    href={`/trip/${records.bestScore.tripId}`}
                    band={bandDefinition('excellent').to}
                  />
                  {records.quietestTrip ? (
                    <RecordRow
                      label="Quietest drive"
                      value={`${Math.round(records.quietestTrip.avgDb)} dB`}
                      href={`/trip/${records.quietestTrip.tripId}`}
                      band="#34d399"
                    />
                  ) : null}
                  {records.mostHorns ? (
                    <RecordRow
                      label="Most horns"
                      value={String(records.mostHorns.count)}
                      href={`/trip/${records.mostHorns.tripId}`}
                      band="#fbbf24"
                    />
                  ) : null}
                  {records.longestDistance ? (
                    <RecordRow
                      label="Longest drive"
                      value={formatDistanceLong(records.longestDistance.m)}
                      href={`/trip/${records.longestDistance.tripId}`}
                      band="#22d3ee"
                    />
                  ) : null}
                </div>
              </Card>
            </motion.div>
          ) : null}
        </motion.div>
      </AppShell>
      <TabBar />
    </>
  );
}

function LifetimeRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        <span className="text-ink-faint">{icon}</span>
        {label}
      </span>
      <span className="text-sm font-bold text-ink tabular">{value}</span>
    </div>
  );
}

function RecordRow({
  label,
  value,
  href,
  band,
}: {
  label: string;
  value: string;
  href: string;
  band: string;
}) {
  return (
    <Link href={href} className="flex items-center justify-between">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-sm font-bold tabular" style={{ color: band }}>
          {value}
        </span>
        <ChevronRight size={14} className="text-ink-faint" />
      </span>
    </Link>
  );
}
