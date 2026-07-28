'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreReveal } from '@/components/report/score-reveal';
import { SummaryNarrative } from '@/components/report/summary-narrative';
import { ReportStats } from '@/components/report/report-stats';
import { ScoreBreakdown } from '@/components/report/score-breakdown';
import { ComparisonCards } from '@/components/report/comparison-cards';
import { EventTimeline } from '@/components/timeline/event-timeline';
import { TripReplay } from '@/components/report/trip-replay';
import { ShareButton } from '@/components/report/share-button';
import { RouteMapLazy } from '@/components/map/route-map-lazy';
import { useTripDetail } from '@/hooks/use-trip-detail';
import { buildIntensityRuns, buildEventMarkers } from '@/lib/geo/route-segments';
import { formatDateLong, formatTimeOfDay } from '@/lib/utils/format';
import type { TripId } from '@/lib/domain/schema';
import { fadeUp, staggerParent } from '@/components/motion/transitions';

export default function TripReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { detail, status } = useTripDetail(id as TripId);

  const mapData = useMemo(() => {
    if (!detail) return null;
    return {
      runs: buildIntensityRuns(detail.samples, detail.events),
      markers: buildEventMarkers(detail.events),
      bounds: detail.trip.route.bounds,
    };
  }, [detail]);

  if (status === 'loading') {
    return (
      <AppShell>
        <div className="flex flex-col gap-6 pt-4">
          <Skeleton className="mx-auto size-60 rounded-full" />
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-48 rounded-card" />
        </div>
      </AppShell>
    );
  }

  if (status === 'not-found' || !detail || !detail.trip.stats || !detail.trip.score) {
    return (
      <AppShell>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
          <MapPin size={40} className="text-ink-faint" />
          <h1 className="text-xl font-bold text-ink">Trip not found</h1>
          <p className="text-sm text-ink-muted">This drive may have been deleted.</p>
          <Link href="/" className="text-sm font-semibold text-brand-bright">
            Back to home
          </Link>
        </div>
      </AppShell>
    );
  }

  const { trip } = detail;
  const stats = trip.stats!;
  const score = trip.score!;
  const hasRoute = mapData && (mapData.runs.length > 0 || mapData.bounds);

  return (
    <AppShell>
      <motion.div variants={staggerParent(0.08)} initial="hidden" animate="show" className="flex flex-col gap-6">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <Link
            href="/history"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-hairline bg-surface text-ink"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 text-center">
            <div className="truncate text-[13px] font-semibold text-ink">
              {formatDateLong(trip.startedAt)}
            </div>
            <div className="text-[11px] text-ink-faint">{formatTimeOfDay(trip.startedAt)}</div>
          </div>
          <ShareButton trip={trip} />
        </div>

        <motion.div variants={fadeUp}>
          <ScoreReveal score={score} />
        </motion.div>

        {trip.summary ? <SummaryNarrative summary={trip.summary} /> : null}

        {trip.summary && trip.summary.comparisons.length > 0 ? (
          <motion.div variants={fadeUp}>
            <ComparisonCards comparisons={trip.summary.comparisons} />
          </motion.div>
        ) : null}

        <motion.div variants={fadeUp}>
          <ReportStats stats={stats} />
        </motion.div>

        {hasRoute ? (
          <motion.div variants={fadeUp}>
            <TripReplay
              samples={detail.samples}
              events={detail.events}
              durationMs={stats.durationMs}
              bounds={mapData!.bounds}
            />
          </motion.div>
        ) : null}

        <motion.div variants={fadeUp}>
          <ScoreBreakdown score={score} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <EventTimeline events={detail.events} />
        </motion.div>

        {/* A quiet full route thumbnail at the foot for trips with a map. */}
        {hasRoute ? (
          <motion.div variants={fadeUp}>
            <RouteMapLazy
              className="h-52 rounded-card border border-white/8"
              runs={mapData!.runs}
              markers={mapData!.markers}
              bounds={mapData!.bounds}
              interactive
            />
          </motion.div>
        ) : null}

        <div className="pt-2 pb-4 text-center">
          <Link href="/drive" className="text-sm font-semibold text-brand-bright">
            Start another drive
          </Link>
        </div>
      </motion.div>
    </AppShell>
  );
}
