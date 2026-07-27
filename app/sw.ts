/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, CacheFirst, ExpirationPlugin, CacheableResponsePlugin } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // We never call skipWaiting automatically: an update landing mid-drive would
  // reload the page and lose the recording. The app surfaces an "Update
  // available" prompt instead and activates on the user's terms.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Map tiles are the one thing worth caching aggressively — they are
      // immutable per coordinate and make a revisited route render offline.
      // Capped hard: caching a whole city would blow the storage quota.
      matcher: ({ url }) => url.hostname.endsWith('basemaps.cartocdn.com'),
      handler: new CacheFirst({
        cacheName: 'carto-tiles',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 600,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          }),
          // Tiles are opaque cross-origin responses, so status 0 must be cacheable.
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

// Activate on demand, when the app's update prompt says so.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

serwist.addEventListeners();
