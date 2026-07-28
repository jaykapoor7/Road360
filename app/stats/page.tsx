'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
import { cn } from '@/lib/utils/cn';
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
  // Real drives only, matching the lifetime aggregate below.
  const { trips } = useTrips();
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

  // Deferred to the client for the same reason as the home header: this route
  // is prerendered, so a build-time month label ships frozen to every visitor.
  const [currentMonth, setCurrentMonth] = useState('');
  useEffect(() => setCurrentMonth(monthKeyLabel(new Date())), []);

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
            <Link href="/wrapped/month" className="block active:scale-[0.99]">
              <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-card border border-hairline bg-surface p-4">
                {/* One thin accent edge instead of a full-bleed gradient — the
                    card is a link, not a headline. */}
                <span
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ background: 'linear-gradient(180deg,#34D9A0,#6F7C92)' }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="eyebrow">Road360 Wrapped</div>
                  <div className="mt-1 min-h-[1.375rem] text-[17px] font-bold tracking-[-0.01em] text-ink">
                    {currentMonth}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-muted">Your month on the road</div>
                </div>
                <ChevronRight size={20} className="shrink-0 text-ink-faint" />
              </div>
            </Link>
          </motion.div>

          {/* Period totals */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-2">
            <StatTile label="Avg score" icon={<Trophy size={13} />}>
              {Math.round(periodTotals.avgScore) || '—'}
            </StatTile>
            <StatTile label="Drives" icon={<Route size={13} />}>
              {inPeriod.length}
            </StatTile>
            <StatTile label="Distance" icon={<Route size={13} />}>
              {formatDistanceLong(periodTotals.distance)}
            </StatTile>
            <StatTile label="Horns" icon={<Megaphone size={13} />}>
              {periodTotals.horns}
            </StatTile>
          </motion.div>

          <motion.div variants={fadeUp}>
            <TrendChart title="Score trend" points={scoreTrend} color="#34D9A0" />
          </motion.div>

          <motion.div variants={fadeUp}>
            <TrendChart title="Noise trend" points={noiseTrend} unit=" dB" color="#D0A35C" />
          </motion.div>

          {/* Lifetime */}
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader>
                <CardTitle>Lifetime</CardTitle>
              </CardHeader>
              <div className="flex flex-col">
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
                <div className="flex flex-col">
                  {/* Only the calmest drive — the one you'd actually want to
                      beat — carries the accent. The rest are plain, so the eye
                      is drawn to the record that matters rather than to four
                      competing colours. */}
                  <RecordRow
                    label="Calmest drive"
                    value={String(records.bestScore.value)}
                    href={`/trip/${records.bestScore.tripId}`}
                    accent
                  />
                  {records.quietestTrip ? (
                    <RecordRow
                      label="Quietest drive"
                      value={`${Math.round(records.quietestTrip.avgDb)} dB`}
                      href={`/trip/${records.quietestTrip.tripId}`}
                    />
                  ) : null}
                  {records.mostHorns ? (
                    <RecordRow
                      label="Most horns"
                      value={String(records.mostHorns.count)}
                      href={`/trip/${records.mostHorns.tripId}`}
                    />
                  ) : null}
                  {records.longestDistance ? (
                    <RecordRow
                      label="Longest drive"
                      value={formatDistanceLong(records.longestDistance.m)}
                      href={`/trip/${records.longestDistance.tripId}`}
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
    <div className="flex items-center justify-between gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <span className="flex items-center gap-2.5 text-[14px] text-ink-muted">
        <span className="text-ink-faint">{icon}</span>
        {label}
      </span>
      <span className="num text-[15px] text-ink">{value}</span>
    </div>
  );
}

function RecordRow({
  label,
  value,
  href,
  accent = false,
}: {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 border-b border-hairline py-3 last:border-b-0"
    >
      <span className="text-[14px] text-ink-muted">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={cn('num text-[15px]', accent ? 'text-brand' : 'text-ink')}>{value}</span>
        <ChevronRight size={14} className="text-ink-faint" />
      </span>
    </Link>
  );
}
