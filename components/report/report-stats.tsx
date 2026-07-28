'use client';

import { motion } from 'framer-motion';
import {
  Megaphone,
  Timer,
  Volume2,
  ShieldAlert,
  Zap,
  Route,
  Clock,
  Gauge,
  HeartCrack,
} from 'lucide-react';
import type { TripStats } from '@/lib/domain/stats';
import { StatTile } from '@/components/ui/stat-tile';
import {
  formatDistance,
  formatDurationCompact,
  formatSecondsPrecise,
} from '@/lib/utils/format';
import { staggerParent, fadeUp } from '@/components/motion/transitions';

/** The full stat grid on the report. Every metric the brief asks for. */
export function ReportStats({ stats }: { stats: TripStats }) {
  const distance = formatDistance(stats.distanceM);

  const tiles = [
    {
      label: 'Distance',
      icon: <Route size={13} />,
      value: `${distance.value} ${distance.unit}`,
    },
    { label: 'Duration', icon: <Clock size={13} />, value: formatDurationCompact(stats.durationMs) },
    {
      label: 'Horns',
      icon: <Megaphone size={13} />,
      value: String(stats.soundCounts.horn),
      accent: '#FFC043',
      footnote: stats.avgSecondsBetweenHorns
        ? `one every ${formatSecondsPrecise(stats.avgSecondsBetweenHorns)}`
        : 'none',
    },
    {
      label: 'Longest calm',
      icon: <Timer size={13} />,
      value: formatDurationCompact(stats.longestSilenceMs),
      accent: '#00E08C',
    },
    {
      label: 'Avg noise',
      icon: <Volume2 size={13} />,
      value: `${Math.round(stats.noise.avgDb)} dB`,
      footnote: `peak ${Math.round(stats.noise.peakDb)} dB`,
    },
    {
      label: 'Hard brakes',
      icon: <ShieldAlert size={13} />,
      value: String(stats.hardBrakes),
      accent: '#FF5470',
    },
    {
      label: 'Rapid accel',
      icon: <Zap size={13} />,
      value: String(stats.rapidAccels),
      accent: '#FF8A3D',
    },
    {
      label: 'Time stopped',
      icon: <HeartCrack size={13} />,
      value: formatDurationCompact(stats.stoppedMs),
      footnote: `${Math.round(stats.stoppedRatio * 100)}% of the trip`,
    },
    {
      label: 'Top speed',
      icon: <Gauge size={13} />,
      value: `${Math.round(stats.maxSpeed * 3.6)} km/h`,
    },
  ];

  return (
    <motion.div
      variants={staggerParent(0.03)}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-2"
    >
      {tiles.map((tile) => (
        <motion.div key={tile.label} variants={fadeUp}>
          <StatTile label={tile.label} icon={tile.icon} accent={tile.accent} footnote={tile.footnote}>
            {tile.value}
          </StatTile>
        </motion.div>
      ))}
    </motion.div>
  );
}
