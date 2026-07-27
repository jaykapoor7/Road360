import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerManager } from '@/components/common/service-worker';

export const metadata: Metadata = {
  title: 'Road360 — How chaotic was your commute?',
  description:
    'Spotify Wrapped meets WHOOP, for your commute. Track horns, noise, hard braking and stop-and-go traffic, and get a Road360 Score for every drive.',
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
    title: 'Road360',
    description: 'How chaotic was your commute?',
    type: 'website',
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
