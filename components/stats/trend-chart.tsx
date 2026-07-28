'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export interface TrendPoint {
  label: string;
  value: number;
}

/**
 * A compact sparkline-style trend. Hand-drawn SVG rather than a charting
 * library: it is a single polyline plus an area fill, and pulling in a chart
 * dependency for that would cost more bundle than the whole stats screen.
 */
export function TrendChart({
  title,
  points,
  unit,
  color = '#34D9A0',
}: {
  title: string;
  points: TrendPoint[];
  unit?: string;
  color?: string;
}) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;

    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat series would divide by zero; give it a nominal band so the line
    // renders through the middle instead of collapsing to an edge.
    const span = max - min || 1;

    const W = 100;
    const H = 40;
    const coords = points.map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((p.value - min) / span) * H;
      return [x, y] as const;
    });

    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const area = `${line} L${W},${H} L0,${H} Z`;
    const [endX, endY] = coords[coords.length - 1]!;
    return { line, area, min, max, endX, endY, latest: values[values.length - 1]! };
  }, [points]);

  const id = `trend-${title.replace(/\s/g, '')}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {geometry ? (
          <span className="num text-[15px] text-ink">
            {Math.round(geometry.latest)}
            {unit ? <span className="ml-0.5 text-[11px] text-ink-faint">{unit}</span> : null}
          </span>
        ) : null}
      </CardHeader>

      {geometry ? (
        <>
          {/* A single thin line and the faintest wash beneath it. A heavy fill
              or a 2px stroke reads as a chart widget; this reads as a trace. The
              only emphasis is one soft dot on the most recent point. */}
          <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-20 w-full overflow-visible">
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.16" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geometry.area} fill={`url(#${id})`} />
            <path
              d={geometry.line}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={geometry.endX} cy={geometry.endY} r="4" fill={color} fillOpacity="0.18" />
            <circle
              cx={geometry.endX}
              cy={geometry.endY}
              r="1.8"
              fill={color}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="mt-2 flex justify-between text-[10px] text-ink-faint">
            <span>{points[0]!.label}</span>
            <span>{points[points.length - 1]!.label}</span>
          </div>
        </>
      ) : (
        <p className="py-8 text-center text-[13px] text-ink-faint">
          Not enough drives yet to show a trend.
        </p>
      )}
    </Card>
  );
}
