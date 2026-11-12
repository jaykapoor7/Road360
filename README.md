# Road360

A phone web app that scores each drive out of 100 from horns, road noise, hard braking and stop-and-go traffic. It runs in the browser and keeps everything on the phone.

**Live:** https://road360.vercel.app/ (add it to your home screen to use it as an app)

## What it measures

- **Horns and noise:** the microphone measures loudness and detects horns.
- **Hard braking and rapid acceleration:** from the motion sensors.
- **Stop-and-go:** GPS tracks the route, distance and time spent stationary.

Each drive gets a report with a score breakdown, a route replay, an event timeline and a shareable image. Stats, monthly and yearly Wrapped summaries and achievements build up over time.

No car handy? Open `/drive?demo=1` for a simulated drive that goes through the same detector and scorer.

## Privacy

Drives are stored in the browser's IndexedDB on the phone. There is no account, no analytics and no backend, and drive data is never uploaded. Audio is analysed as it arrives and is never recorded. Map tiles come from CARTO, so CARTO sees which map area is on screen. Settings lets you export everything as JSON or delete it. Cloud sync and community sharing are built but have no server, so they stay on the device.

## Run locally

Needs Node 20.11+ and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm dev:https    # HTTPS with a self-signed certificate
```

Microphone, location and motion only work in a secure context. `localhost` counts, but a phone opening `http://192.168.x.x` does not, so use `pnpm dev:https` to test on a real phone. `/check` shows live readings from each sensor.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CARTO_API_KEY` | CARTO basemap key. CARTO requires one since September 2026; without it the map shows an "API key required" notice instead of streets. Free at [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey). |
| `NEXT_PUBLIC_APP_URL` | Public URL used for link previews and share links. |
| `NEXT_PUBLIC_SYNC_URL` | A sync server. None exists yet. |

## Tests and checks

```bash
pnpm test         # Vitest
pnpm typecheck
pnpm lint
pnpm build        # webpack; Turbopack would skip the service worker
pnpm verify       # all four
```

## Stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Framer Motion, Leaflet, IndexedDB via idb, Serwist for the service worker, Vitest.

## How it works

[docs/how-it-works.md](docs/how-it-works.md) covers the architecture, sound detection, scoring, storage, sync and what is not built yet.
