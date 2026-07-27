'use client';

import { motion } from 'framer-motion';
import {
  Megaphone,
  Timer,
  Volume2,
  ShieldAlert,
  Zap,
  Gauge,
  Route,
  Clock,
  HeartPulse,
} from 'lucide-react';
import { useSessionValue } from '@/hooks/use-session';
import { StatTile } from '@/components/ui/stat-tile';
import { MetricNumber } from '@/components/ui/metric-number';
import { DbMeter } from './db-meter';
import { formatDistance, formatDuration, formatDurationCompact } from '@/lib/utils/format';
import { bandDefinition } from '@/lib/score/labels';
import { staggerParent, fadeUp } from '@/components/motion/transitions';

/**
 * Every tile below subscribes to a single primitive from the metrics channel.
 * React's useSyncExternalStore bails out when the selected value is unchanged,
 * so a tile re-renders only when its own number moves — a 1 Hz metrics commit
 * does not re-render the whole grid.
 */

function HornTile() {
  const count = useSessionValue('metrics', (m) => m.hornCount);
  const gap = useSessionValue('metrics', (m) => m.avgSecondsBetweenHorns);
  return (
    <StatTile
      label="Horns"
      icon={<Megaphone size={13} />}
      accent="#fbbf24"
      footnote={gap ? `every ${gap.toFixed(1)}s on average` : 'none yet'}
    >
      <MetricNumber value={count} />
    </StatTile>
  );
}

function SilenceTile() {
  const longest = useSessionValue('metrics', (m) => m.longestSilenceMs);
  const current = useSessionValue('metrics', (m) => m.currentSilenceMs);
  return (
    <StatTile
      label="Longest calm"
      icon={<Timer size={13} />}
      accent="#34d399"
      footnote={`${formatDurationCompact(current)} and counting`}
    >
      {formatDurationCompact(longest)}
    </StatTile>
  );
}

function NoiseTile() {
  const current = useSessionValue('metrics', (m) => Math.round(m.currentDb));
  const avg = useSessionValue('metrics', (m) => Math.round(m.avgDb));
  const peak = useSessionValue('metrics', (m) => Math.round(m.peakDb));
  return (
    <div className="relative col-span-2 overflow-hidden rounded-tile glass p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Volume2 size={13} className="text-ink-faint" />
          <span className="text-[10px] font-semibold tracking-[0.13em] text-ink-faint uppercase">
            Noise
          </span>
        </div>
        <div className="flex gap-3 text-[11px] text-ink-muted tabular">
          <span>avg {avg}</span>
          <span>peak {peak}</span>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="text-[2rem] leading-none font-bold text-ink tabular">
          <MetricNumber value={current} suffix="dB" />
        </div>
        <div className="flex-1 pb-1">
          <DbMeter height={44} />
        </div>
      </div>
    </div>
  );
}

function BrakeTile() {
  const brakes = useSessionValue('metrics', (m) => m.hardBrakes);
  return (
    <StatTile label="Hard brakes" icon={<ShieldAlert size={13} />} accent="#fb7185">
      <MetricNumber value={brakes} />
    </StatTile>
  );
}

function AccelTile() {
  const accels = useSessionValue('metrics', (m) => m.rapidAccels);
  return (
    <StatTile label="Rapid accel" icon={<Zap size={13} />} accent="#fb923c">
      <MetricNumber value={accels} />
    </StatTile>
  );
}

function SpeedTile() {
  const speed = useSessionValue('metrics', (m) => Math.round(m.currentSpeed * 3.6));
  const max = useSessionValue('metrics', (m) => Math.round(m.maxSpeed * 3.6));
  return (
    <StatTile label="Speed" icon={<Gauge size={13} />} footnote={`max ${max} km/h`}>
      <MetricNumber value={speed} suffix="km/h" />
    </StatTile>
  );
}

function DistanceTile() {
  const distanceM = useSessionValue('metrics', (m) => m.distanceM);
  const d = formatDistance(distanceM);
  return (
    <StatTile label="Distance" icon={<Route size={13} />}>
      <MetricNumber value={Number(d.value)} precision={d.unit === 'km' ? 1 : 0} suffix={d.unit} />
    </StatTile>
  );
}

function StoppedTile() {
  const stoppedMs = useSessionValue('metrics', (m) => m.stoppedMs);
  return (
    <StatTile label="Time stopped" icon={<Clock size={13} />}>
      {formatDurationCompact(stoppedMs)}
    </StatTile>
  );
}

export function LiveStatGrid() {
  return (
    <motion.div
      variants={staggerParent(0.04)}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-3"
    >
      {[HornTile, SilenceTile, NoiseTile, BrakeTile, AccelTile, DistanceTile, SpeedTile, StoppedTile].map(
        (Tile, i) => (
          <motion.div key={i} variants={fadeUp} className={i === 2 ? 'col-span-2' : ''}>
            <Tile />
          </motion.div>
        ),
      )}
    </motion.div>
  );
}

/** Big duration + provisional score at the top of the drive screen. */
export function LiveHeader() {
  const tripTimeMs = useSessionValue('metrics', (m) => m.tripTimeMs);
  const score = useSessionValue('metrics', (m) => m.provisionalScore);
  const band = useSessionValue('metrics', (m) => m.provisionalBand);
  const def = bandDefinition(band);

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.13em] text-ink-faint uppercase">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-rose" />
          </span>
          Recording
        </div>
        <div className="text-5xl font-bold tracking-tight text-ink tabular">
          {formatDuration(tripTimeMs)}
        </div>
      </div>

      <div className="flex flex-col items-end">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.13em] text-ink-faint uppercase">
          <HeartPulse size={13} /> Live score
        </div>
        <div
          className="text-gradient text-5xl font-bold tabular"
          style={{ backgroundImage: `linear-gradient(135deg, ${def.from}, ${def.to})` }}
        >
          {score}
        </div>
      </div>
    </div>
  );
}
