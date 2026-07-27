'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { DURATION, EASE } from '@/components/motion/transitions';

interface ProgressRingProps {
  /** 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  from: string;
  to: string;
  className?: string;
  children?: React.ReactNode;
  /** Unique per instance — SVG gradient ids are document-global. */
  gradientId: string;
  /** Fraction of the circle used, 1 = full ring, 0.75 = open-bottom arc. */
  sweep?: number;
  delay?: number;
}

/**
 * The score ring. Drawn with SVG rather than conic-gradient because a
 * conic-gradient cannot be animated smoothly and does not rasterise reliably
 * inside share cards.
 */
export function ProgressRing({
  value,
  size = 220,
  stroke = 14,
  from,
  to,
  className,
  children,
  gradientId,
  sweep = 0.75,
  delay = 0,
}: ProgressRingProps) {
  const reduceMotion = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * sweep;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  // Rotate so the arc gap sits at the bottom, centred.
  const rotation = 90 + ((1 - sweep) * 360) / 2;

  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ transform: `rotate(${rotation}deg)` }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(255 255 255 / 0.07)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
        />

        {/* Value */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          initial={reduceMotion ? false : { strokeDashoffset: arc }}
          animate={{ strokeDashoffset: arc * (1 - pct) }}
          transition={{ duration: reduceMotion ? 0 : DURATION.reveal, ease: EASE.outExpo, delay }}
          style={{ filter: `drop-shadow(0 0 12px ${to}55)` }}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
