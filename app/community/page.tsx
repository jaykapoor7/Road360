'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Volume2, ShieldAlert, Megaphone, Flame, MapPin } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { TabBar } from '@/components/layout/tab-bar';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RouteMapLazy } from '@/components/map/route-map-lazy';
import { useCommunity } from '@/hooks/use-community';
import { heatColor, HEAT_COLORS } from '@/lib/community/aggregate';
import { bandDefinition } from '@/lib/score/labels';
import type { HeatmapMetric, RoadScore } from '@/lib/community/types';
import { boundsOf } from '@/lib/geo/bounds';
import { staggerParent, fadeUp } from '@/components/motion/transitions';

const METRICS = [
  { value: 'noise' as const, label: 'Noise' },
  { value: 'brakes' as const, label: 'Braking' },
  { value: 'horns' as const, label: 'Horns' },
  { value: 'chaos' as const, label: 'Chaos' },
];

const METRIC_ICON = {
  noise: Volume2,
  brakes: ShieldAlert,
  horns: Megaphone,
  chaos: Flame,
} as const;

export default function CommunityPage() {
  const [metric, setMetric] = useState<HeatmapMetric>('noise');
  const { snapshot, loading } = useCommunity(metric);

  const heat = useMemo(
    () =>
      snapshot?.cells.map((cell) => ({
        bounds: cell.bounds,
        color: heatColor(cell.intensity),
        intensity: cell.intensity,
      })) ?? [],
    [snapshot],
  );

  const mapBounds = useMemo(() => {
    if (!snapshot || snapshot.cells.length === 0) return null;
    return boundsOf(snapshot.cells.map((c) => ({ lat: c.lat, lon: c.lon })));
  }, [snapshot]);

  const MetricIcon = METRIC_ICON[metric];

  return (
    <>
      <AppShell>
        <PageHeader
          title="Community"
          subtitle={
            snapshot?.source === 'local'
              ? 'Built from your own drives'
              : 'Aggregated from anonymous contributions'
          }
        />

        <motion.div variants={staggerParent(0.06)} initial="hidden" animate="show" className="flex flex-col gap-5">
          <motion.div variants={fadeUp}>
            <SegmentedControl
              options={METRICS}
              value={metric}
              onChange={setMetric}
              layoutId="community-metric"
            />
          </motion.div>

          {loading ? (
            <Skeleton className="h-72 rounded-card" />
          ) : !snapshot || snapshot.cells.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Card>
                <div className="py-8 text-center">
                  <MapPin size={28} className="mx-auto mb-3 text-ink-faint" />
                  <h2 className="text-[16px] font-bold text-ink">No road data yet</h2>
                  <p className="mx-auto mt-2 max-w-[19rem] text-[13px] leading-relaxed text-ink-muted">
                    Record a drive and this map fills in. Privacy trimming drops the first and last
                    250 m of every trace, so a drive needs to be longer than about 500 m before any
                    of it can appear here.
                  </p>
                </div>
              </Card>
            </motion.div>
          ) : (
            <>
              <motion.div variants={fadeUp}>
                <div className="relative overflow-hidden rounded-card border border-hairline">
                  <RouteMapLazy className="h-72" heat={heat} bounds={mapBounds} interactive />
                  {/* Legend */}
                  <div className="glass-strong absolute right-3 bottom-3 z-[500] flex items-center gap-2 rounded-pill px-3 py-1.5">
                    <MetricIcon size={12} className="text-ink-faint" />
                    <span className="text-[10px] font-semibold text-ink-muted">calm</span>
                    <div className="flex gap-0.5">
                      {HEAT_COLORS.map((color) => (
                        <span key={color} className="size-2.5 rounded-sm" style={{ background: color }} />
                      ))}
                    </div>
                    <span className="text-[10px] font-semibold text-ink-muted">busy</span>
                  </div>
                </div>
              </motion.div>

              {snapshot.sparse ? (
                <motion.div variants={fadeUp}>
                  <div className="glass flex gap-2.5 rounded-tile p-3">
                    <Info size={16} className="mt-0.5 shrink-0 text-amber" />
                    <p className="text-xs leading-relaxed text-ink-muted">
                      Not much data yet — {snapshot.totalContributions} road cells. Rankings need a
                      few passes per stretch before they mean anything, so treat these as
                      provisional.
                    </p>
                  </div>
                </motion.div>
              ) : null}

              {snapshot.quietest.length > 0 ? (
                <motion.div variants={fadeUp}>
                  <RoadList title="Quietest stretches" roads={snapshot.quietest} />
                </motion.div>
              ) : null}

              {snapshot.noisiest.length > 0 ? (
                <motion.div variants={fadeUp}>
                  <RoadList title="Noisiest stretches" roads={snapshot.noisiest} />
                </motion.div>
              ) : null}

              {snapshot.areas.length > 1 ? (
                <motion.div variants={fadeUp}>
                  <Card>
                    <CardHeader>
                      <CardTitle>Area rankings</CardTitle>
                      <span className="text-[11px] text-ink-faint">{snapshot.areas.length} areas</span>
                    </CardHeader>
                    <div className="flex flex-col gap-2.5">
                      {snapshot.areas.slice(0, 8).map((area, i) => {
                        const band = bandDefinition(
                          area.score >= 80 ? 'excellent' : area.score >= 60 ? 'normal' : area.score >= 40 ? 'stressful' : 'chaos',
                        );
                        return (
                          <div key={area.geohash} className="flex items-center gap-3">
                            <span className="w-5 text-xs font-bold text-ink-faint tabular">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              {/* No place names: naming an area would need a
                                  geocoder, and inventing labels is worse than
                                  showing coordinates. */}
                              <div className="font-mono text-[13px] text-ink">
                                {area.lat.toFixed(3)}, {area.lon.toFixed(3)}
                              </div>
                              <div className="text-[11px] text-ink-faint">
                                {area.cellCount} cells · {Math.round(area.avgDb)} dB · {area.totalHorns} horns
                              </div>
                            </div>
                            <span className="text-sm font-bold tabular" style={{ color: band.to }}>
                              {area.score}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </motion.div>
              ) : null}

              <motion.div variants={fadeUp}>
                <div className="glass flex gap-2.5 rounded-tile p-3">
                  <Info size={16} className="mt-0.5 shrink-0 text-ink-faint" />
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Road cells are ~150 m squares with the first and last 250 m of every trip
                    removed, times reduced to an hour-of-week bucket, and no device or trip
                    identifier attached.{' '}
                    {snapshot.source === 'local'
                      ? 'Nothing here has left your device.'
                      : 'Contributions are anonymous.'}
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </motion.div>
      </AppShell>
      <TabBar />
    </>
  );
}

function RoadList({ title, roads }: { title: string; roads: RoadScore[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-2.5">
        {roads.map((road) => {
          const band = bandDefinition(
            road.score >= 80 ? 'excellent' : road.score >= 60 ? 'normal' : road.score >= 40 ? 'stressful' : 'chaos',
          );
          return (
            <div key={road.geohash} className="flex items-center gap-3">
              <div
                className="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold tabular"
                style={{ background: `${band.to}22`, color: band.to }}
              >
                {road.score}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13px] text-ink">
                  {road.lat.toFixed(4)}, {road.lon.toFixed(4)}
                </div>
                <div className="text-[11px] text-ink-faint">
                  {Math.round(road.avgDb)} dB · {road.hornCount} horns · {road.hardBrakeCount} brakes
                </div>
              </div>
              <Badge tone="neutral">{road.contributions}×</Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
