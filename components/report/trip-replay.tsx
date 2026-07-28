'use client';

import { useMemo } from 'react';
import { Play, Pause, Megaphone, ShieldAlert, Route, Volume2 } from 'lucide-react';
import type { TripSample } from '@/lib/domain/samples';
import type { TripEvent } from '@/lib/domain/events';
import { useReplay } from '@/hooks/use-replay';
import { replayFrameAt } from '@/lib/replay/interpolate';
import { buildIntensityRuns } from '@/lib/geo/route-segments';
import { buildTimeline } from '@/lib/timeline/presentation';
import { RouteMapLazy } from '@/components/map/route-map-lazy';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistance, formatDuration } from '@/lib/utils/format';
import type { ReplaySpeed } from '@/lib/replay/replay-clock';
import { cn } from '@/lib/utils/cn';

/**
 * The cinematic replay.
 *
 * A single clock drives four synchronised things: the marker gliding along the
 * route, the progressively-drawn polyline, the stat readout as-of the playhead,
 * and the scrubber whose track shows where events cluster. Because every one of
 * them is derived from the same `replayFrameAt`, they cannot drift out of sync.
 */
export function TripReplay({
  samples,
  events,
  durationMs,
  bounds,
}: {
  samples: TripSample[];
  events: TripEvent[];
  durationMs: number;
  bounds: [[number, number], [number, number]] | null;
}) {
  const { state, controls } = useReplay(durationMs);

  const timeline = useMemo(() => buildTimeline(events), [events]);
  const fullRuns = useMemo(() => buildIntensityRuns(samples, events), [samples, events]);

  const frame = useMemo(
    () => replayFrameAt(samples, events, events, state.positionMs),
    [samples, events, state.positionMs],
  );

  const distance = formatDistance(frame.stats.distanceM);

  // Density marks behind the scrubber: one tick per event, positioned by time.
  const densityMarks = useMemo(
    () => timeline.map((entry) => ({ pct: durationMs > 0 ? (entry.t / durationMs) * 100 : 0, color: entry.view.color })),
    [timeline, durationMs],
  );

  const progressPct = durationMs > 0 ? (state.positionMs / durationMs) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Replay</CardTitle>
        <span className="text-[11px] text-ink-faint tabular">
          {formatDuration(state.positionMs)} / {formatDuration(durationMs)}
        </span>
      </CardHeader>

      {/* Map with the moving marker and the route drawn so far. */}
      <div className="relative mb-3 overflow-hidden rounded-tile border border-white/8">
        <RouteMapLazy
          className="h-56"
          interactive={false}
          runs={fullRuns.map((r) => ({ ...r, level: r.level }))}
          polyline={frame.traveled}
          cursor={frame.position}
          bounds={bounds}
        />
      </div>

      {/* As-of stats. */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <ReplayStat icon={<Route size={13} />} value={`${distance.value}${distance.unit}`} label="dist" />
        <ReplayStat icon={<Megaphone size={13} />} value={String(frame.stats.hornCount)} label="horns" />
        <ReplayStat icon={<ShieldAlert size={13} />} value={String(frame.stats.hardBrakes)} label="brakes" />
        <ReplayStat icon={<Volume2 size={13} />} value={String(Math.round(frame.stats.currentDb))} label="dB" />
      </div>

      {/* Scrubber with an event-density track. */}
      <div className="mb-3">
        <div className="relative h-8">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-linear-to-r from-brand to-brand-bright"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {densityMarks.map((mark, i) => (
            <span
              key={i}
              className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${mark.pct}%`, background: mark.color, marginTop: -8 }}
            />
          ))}
          <input
            type="range"
            min={0}
            max={durationMs}
            value={state.positionMs}
            onChange={(e) => controls.seek(Number(e.target.value))}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
            aria-label="Scrub replay"
          />
        </div>
      </div>

      {/* Transport controls. */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={controls.toggle}
          className="grid size-12 place-items-center rounded-full bg-linear-to-b from-brand-bright to-brand text-white active:scale-95"
          aria-label={state.playing ? 'Pause replay' : 'Play replay'}
        >
          {state.playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>

        <div className="flex gap-1.5">
          {([1, 2, 4, 8] as ReplaySpeed[]).map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => controls.setSpeed(speed)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                state.speed === speed ? 'bg-white/12 text-ink' : 'text-ink-faint hover:text-ink-muted',
              )}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ReplayStat({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg bg-white/4 p-2 text-center">
      <div className="mx-auto mb-0.5 flex justify-center" style={accent ? { color: accent } : undefined}>
        {icon}
      </div>
      <div className="text-base font-bold text-ink tabular">{value}</div>
      <div className="text-[9px] font-semibold tracking-wide text-ink-faint uppercase">{label}</div>
    </div>
  );
}
