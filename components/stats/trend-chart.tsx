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
  color = '#818cf8',
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
    return { line, area, min, max, latest: values[values.length - 1]! };
  }, [points]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {geometry ? (
          <span className="text-sm font-bold text-ink tabular">
            {Math.round(geometry.latest)}
            {unit ? <span className="ml-0.5 text-[11px] text-ink-faint">{unit}</span> : null}
          </span>
        ) : null}
      </CardHeader>

      {geometry ? (
        <>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-20 w-full">
            <defs>
              <linearGradient id={`trend-${title.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geometry.area} fill={`url(#trend-${title.replace(/\s/g, '')})`} />
            <path
              d={geometry.line}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
            <span>{points[0]!.label}</span>
            <span>{points[points.length - 1]!.label}</span>
          </div>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-ink-faint">
          Not enough drives yet to show a trend.
        </p>
      )}
    </Card>
  );
}
