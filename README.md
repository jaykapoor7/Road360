# Road360

**Spotify Wrapped + WHOOP, for your commute.**

Tap Start Drive, grant GPS, microphone and motion, and Road360 measures how chaotic your commute
actually is — horns, noise, hard braking, rapid acceleration, stop-and-go — then hands you a
0–100 Road360 Score, a shareable report and a cinematic replay of the drive.

Everything runs on-device. There is no backend.

---

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm dev:https      # required to test real sensors on a phone (see Gotchas)
```

No sensors handy? Every screen is demoable:

```
/drive?demo=1
/drive?demo=1&scenario=highway-calm
/drive?demo=1&scenario=stop-and-go
```

Demo drives synthesise real waveforms and run them through the real FFT and the real detector, so
they exercise the whole pipeline rather than faking results. They are flagged `simulated` and
excluded from lifetime stats and achievements.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build (**webpack — see the Turbopack note**) |
| `pnpm test` | Vitest suite (140 tests) |
| `pnpm typecheck` | `tsc --noEmit`, strict |
| `pnpm lint` | ESLint, including the `lib/**` purity rule |
| `pnpm verify` | All of the above |
| `pnpm icons` | Regenerate PWA icons |

---

## Architecture

### The layering rule

```
lib/**        Pure TypeScript. No react, no next, no DOM
              (except lib/sensors/web/** and lib/platform/**).
hooks/**      Thin React adapters. Lifecycle only, no business logic.
components/** Presentation.
```

An ESLint rule fails the build if anything under `lib/` imports React or Next. That is what makes
"portable to Capacitor or React Native" a real property rather than an aspiration: a native port
rewrites `lib/sensors/web/` and `lib/platform/` and reuses everything else.

### Not re-rendering at sensor rate

Sensors produce data at up to 50 Hz. Pushing that into React state re-renders the tree at sensor
rate and cooks the phone. Instead:

- Raw data lives in plain objects owned by `TripSession`, never in state.
- `SessionStore` is a **channelled** external store. Each channel commits on its own cadence:
  metrics 1 Hz, route 0.2 Hz (or 15 m of movement), events only when something happens.
- Components subscribe via `useSessionValue(channel, selector)` and select a **primitive**, so
  React's `Object.is` bail-out means the horn tile re-renders only when the horn count changes.
- The dB meter subscribes imperatively and paints to canvas — it re-renders **zero** times per drive.

There is no `requestAnimationFrame` anywhere in the sensor path. rAF is display-locked, wasteful,
and throttled to zero when the page is hidden — wrong on all three counts for a sensor that must
survive a screen-off. It *is* used for the replay, which is a foreground animation.

### Audio: capture vs. classification

`lib/sensors/` captures. `lib/audio/` decides what the sound means. Separate modules on purpose.

Capture runs in an **AudioWorklet** that posts transferable frames from a recycled buffer pool, so
there is no per-frame allocation and no main-thread FFT. Browsers without AudioWorklet fall back to
an `AnalyserNode` on a `setInterval`, with the same message shape.

Media constraints are load-bearing: `autoGainControl`, `noiseSuppression` and `echoCancellation` are
explicitly **off**, because they exist to make speech intelligible and they destroy both the level
measurement and horn spectra. The result is verified with `track.getSettings()`; if the browser
ignored us, the UI says "relative", not dB.

### Sound detection is generic and swappable

```ts
interface SoundEventDetector {
  readonly id: string;
  readonly supportedTypes: readonly SoundEventType[];   // horn | siren | whistle | unknown
  process(frame: DetectorFrame): SoundEventDetection | null;
}
```

The shipped `heuristic-v1` gates on loudness → band energy → tonality → harmonic stack → onset →
**pitch stability**. That last one is the real discriminator: sirens sweep, speech wobbles, music
modulates, horns hold their pitch.

Swapping in a model is a registry change, not a refactor. `lib/audio/registry.ts` has TFJS and ONNX
factories that only `await import()` their runtime when `flags.detectorId` selects them, so neither
is in the bundle by default. Every event stores `detectorId` and `detectorVersion`, so history stays
interpretable after a swap.

Known false positives, documented rather than hidden: reversing beepers, motorcycle exhaust
resonance, steady siren segments, brass on a car stereo.

### Scoring

Split so the opinions are tunable separately from the algorithm:

- `weights.ts` — weights plus **anchor tables** (`[[0,100],[0.5,90],[1,78],…]`). Anchors rather than
  a closed-form curve because "2 horns a minute is a 60" is a product decision someone can argue
  with; `100 * exp(-0.31x)` is not.
- `engine.ts` — the algorithm. Pure, side-effect free.
- `labels.ts` — bands, colours, copy.

**Coverage renormalisation:** each sub-score declares a required sensor. Unavailable ones are dropped
and the remaining weights renormalised, so a mic-denied user gets an honest score rather than a
punitive one. Braking survives a motion denial via a GPS proxy at reduced weight.

**Short-trip guard:** a 45-second drive with two honks is a small sample, not chaos. Scores blend
toward neutral until 5 minutes / 1 km and are flagged `provisional`.

### Insights are a template engine, not a model

The "AI summary" is deterministic. A deliberate trade: it never hallucinates a statistic, it works
offline, and every sentence traces to a number in `TripStats`.

The honesty constraints are the interesting part:

- A segment claim ("most hard braking happened in the final third") fires **only** when one third
  holds ≥45% of a total of ≥4 events. Otherwise no claim is made, rather than inventing a pattern
  from three data points.
- History-relative rules don't fire on a first trip.
- A partial-sensor trip says so, instead of quietly scoring lower.
- Every comparison line states the measurement it's built on — a joke stops being funny the moment
  the reader checks it and it's wrong.

### Storage and the sync seam

Three object stores: `trips` (headers), `tripChunks` (samples, 120 per chunk), `tripEvents`. History
cursors headers alone and never pages in telemetry it won't render.

Every record carries sync metadata (revision, dirty, tombstone, deviceId) and **every local write
enqueues an outbox op** — from the very first trip, even though nothing drains it. Adding cloud sync
becomes draining a queue rather than backfilling a year of data.

`lib/sync/remote-repository.stub.ts` implements the same interface and throws. It exists to keep
IndexedDB specifics from leaking into the contract.

### Privacy

Community contribution is opt-in and off by default. `anonymize.ts` trims 250 m from **each end** of
a trace (so it never reveals home or work even at cell resolution), snaps to ~150 m geohash cells,
replaces timestamps with hour-of-week, drops cells with fewer than 3 samples, and carries no device
or trip identifier.

---

## Gotchas worth knowing

**Build with webpack, not Turbopack.** `@serwist/next` is a webpack plugin. `next build --turbopack`
skips it *silently* — the build succeeds, no service worker is emitted, and the app isn't
installable. `pnpm build` is webpack for this reason.

**Testing real sensors needs HTTPS.** `getUserMedia` and geolocation require a secure context.
`localhost` counts; `http://192.168.x.x` does not. Use `pnpm dev:https`.

**iOS motion permission.** `DeviceMotionEvent.requestPermission()` must be called synchronously
inside a user gesture, and *any* await before it — including awaiting `getUserMedia` — loses the
activation. The permission wizard therefore requests one sensor per tap, motion first.

**iOS audio ducking.** An active mic stream reroutes audio to the earpiece and ducks the user's
music. For a commuting app that's a product problem, not a bug — hence the planned silent mode.

**dB is approximate.** A phone microphone is not a calibrated sound level meter. Values carry a
`calibrated` flag and the UI never claims absolute SPL.

**Map tiles.** CARTO Dark Matter, free and keyless. Attribution is a licence condition and stays
visible. Leaflet overrides in `globals.css` are deliberately **unlayered** — Leaflet's own stylesheet
is unlayered too, and unlayered CSS beats `@layer` regardless of source order.

---

## Not built yet

Cloud sync (the seam is in place — implement `RemoteRepository` and flip `flags.syncEnabled`),
community heatmaps and road rankings (contributions are generated and anonymised; nothing consumes
them), and a trained sound model (the interface and registry are ready).

## Stack

Next 15.5 (App Router) · React 19 · TypeScript strict · Tailwind v4 (CSS-first, no config file) ·
Framer Motion · Leaflet + react-leaflet 5 · idb · Serwist · html-to-image · Vitest
