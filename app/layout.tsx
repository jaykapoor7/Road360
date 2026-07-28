import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerManager } from '@/components/common/service-worker';

const DESCRIPTION =
  'Spotify Wrapped meets WHOOP, for your commute. Track horns, noise, hard braking and stop-and-go traffic, and get a Road360 Score for every drive.';

/**
 * `metadataBase` is what turns the generated `opengraph-image` into the
 * absolute URL that X, iMessage and Slack all require — without it the tag is
 * emitted as a relative path and the preview silently falls back to a bare
 * link. It reads from the deploy URL where one is set so previews on a branch
 * deployment point at that deployment rather than production.
 */
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'Road360 — How chaotic was your commute?',
  description: DESCRIPTION,
  applicationName: 'Road360',
  appleWebApp: {
    capable: true,
    title: 'Road360',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Road360 — How chaotic was your commute?',
    description: DESCRIPTION,
    siteName: 'Road360',
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Road360 — How chaotic was your commute?',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: '#07070a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // The app is a fixed shell with its own scroll regions; letting the page
  // itself zoom or bounce breaks the live drive screen.
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <ServiceWorkerManager />
      </body>
    </html>
  );
}
