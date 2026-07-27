import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Road360 — How chaotic was your commute?',
    short_name: 'Road360',
    description:
      'Spotify Wrapped meets WHOOP, for your commute. Track horns, noise, hard braking and stop-and-go traffic, and get a Road360 Score for every drive.',
    id: '/',
    start_url: '/?src=pwa',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#07070a',
    theme_color: '#07070a',
    categories: ['travel', 'health', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Start drive', short_name: 'Drive', url: '/drive' },
      { name: 'History', short_name: 'History', url: '/history' },
    ],
  };
}
