'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils/cn';
import type { RouteMapProps } from './route-map';

/**
 * The SSR boundary.
 *
 * react-leaflet touches `window` at module scope, and in Next 15
 * `dynamic(..., { ssr: false })` is not allowed inside a Server Component. So
 * the dynamic import lives here, inside a Client Component, and every page
 * imports this wrapper rather than the map itself.
 */
const RouteMap = dynamic(() => import('./route-map'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function MapSkeleton() {
  return (
    <div className="grid h-full w-full place-items-center bg-abyss">
      <div className="size-6 animate-spin rounded-full border-2 border-white/10 border-t-brand-bright" />
    </div>
  );
}

export function RouteMapLazy({ className, ...props }: RouteMapProps) {
  return (
    <div className={cn('overflow-hidden bg-abyss', className)}>
      <RouteMap {...props} className="h-full w-full" />
    </div>
  );
}
