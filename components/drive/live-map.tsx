'use client';

import { useSessionChannel } from '@/hooks/use-session';
import { RouteMapLazy } from '@/components/map/route-map-lazy';

/**
 * The live route map. Subscribes to the route channel, which commits at 0.2 Hz
 * (or on 15 m of movement) rather than at sensor rate, so the map redraws a few
 * times a minute instead of continuously.
 */
export function LiveMap({ className }: { className?: string }) {
  const route = useSessionChannel('route');
  const last = route.points[route.points.length - 1];

  return (
    <RouteMapLazy
      className={className}
      interactive={false}
      polyline={route.points}
      cursor={last ? { lat: last[0], lon: last[1] } : null}
    />
  );
}
