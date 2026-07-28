'use client';

import { useEffect, useState } from 'react';
import { useSessionChannel } from '@/hooks/use-session';
import { RouteMapLazy } from '@/components/map/route-map-lazy';

/**
 * The live route map. Subscribes to the route channel, which commits at 0.2 Hz
 * (or on 15 m of movement) rather than at sensor rate, so the map redraws a few
 * times a minute instead of continuously.
 *
 * A one-shot geolocation gives the map somewhere real to sit before the first
 * route point arrives — without it the map opened on a hard-coded London centre
 * and looked broken for the first few seconds of every drive.
 */
export function LiveMap({ className }: { className?: string }) {
  const route = useSessionChannel('route');
  const last = route.points[route.points.length - 1];
  const [deviceCenter, setDeviceCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setDeviceCenter([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  }, []);

  return (
    <RouteMapLazy
      className={className}
      interactive={false}
      follow
      zoom={16}
      polyline={route.points}
      center={deviceCenter}
      cursor={last ? { lat: last[0], lon: last[1] } : null}
    />
  );
}
