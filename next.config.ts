import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

/**
 * IMPORTANT: `@serwist/next` is a *webpack* plugin.
 *
 * Running `next build --turbopack` silently skips it — the build succeeds but no
 * service worker is emitted and the app is not installable. Keep the `build`
 * script on webpack. `dev` may use Turbopack because the SW is disabled there.
 */
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  reloadOnOnline: true,
  cacheOnNavigation: true,
  // We show an in-app "Update available" prompt instead of hijacking an
  // in-progress drive with an automatic reload.
  register: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    dirs: ['app', 'components', 'hooks', 'lib', 'workers'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
};

export default withSerwist(nextConfig);
