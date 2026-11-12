# How Road360 works

Technical notes for anyone working on the code. The [README](../README.md) covers what the app does and how to run it.

## Code layout

```
lib/**        Pure TypeScript. No React, no Next, no DOM
              (except lib/sensors/web/** and lib/platform/**).
hooks/**      Thin React adapters. Lifecycle only, no business logic.
components/** Presentation.
```

An ESLint rule fails the build if anything under `lib/` imports React or Next. That keeps the core portable: a native port (Capacitor or React Native) would rewrite `lib/sensors/web/` and `lib/platform/` and reuse the rest.

## Visual system

A true-black canvas, near-black cards, one hairline border, and colour used almost only for data. There is no glassmorphism: `backdrop-filter` cost a frame on every scroll, muddied the data colours and cannot be rasterised into a share card. `.glass` is now a flat fill plus a 1px border.

- A tile's number takes the score band colour. The tile itself never does.
- One type ramp: `.num` (tabular figures, -0.03em tracking) for every measurement and `.eyebrow` (10px, 0.14em, uppercase) for every label.
- The primary action is white on black, which leaves the accent colour to mean "live" and the band colours to mean "your score".

## Sensor data and React

Sensors produce data at up to 50 Hz. Pushing that into React state would re-render the tree at sensor rate and drain the battery. Instead:

- Raw data lives in plain objects owned by `TripSession`, never in React state.
- `SessionStore` is an external store with channels, each committing on its own cadence: metrics at 1 Hz, the route every 5 s (or every 15 m of movement), events only when something happens.
- Components subscribe with `useSessionValue(channel, selector)` and select a primitive, so the horn tile only re-renders when the horn count changes.
- The dB meter subscribes imperatively and paints to a canvas, so it never re-renders during a drive.

There is no `requestAnimationFrame` in the sensor path. rAF is tied to the display and throttled to zero when the page is hidden, which breaks a recording that must survive a screen-off. The replay, a foreground animation, does use it.

## Audio capture

`lib/sensors/` captures sound and `lib/audio/` decides what it means.

Capture runs in an AudioWorklet that posts transferable frames from a recycled buffer pool, so there is no per-frame allocation and no FFT on the main thread. Browsers without AudioWorklet fall back to an `AnalyserNode` polled on `setInterval`, with the same message shape.

`autoGainControl`, `noiseSuppression` and `echoCancellation` are switched off, because they are built for speech and they distort both the level reading and horn spectra. The result is checked with `track.getSettings()`. If the browser ignored the request, the UI labels levels as relative instead of dB.

## Sound detection

```ts
interface SoundEventDetector {
  readonly id: string;
  readonly supportedTypes: readonly SoundEventType[]; // horn | siren | whistle | unknown
  process(frame: DetectorFrame): SoundEventDetection | null;
}
```

The default detector, `heuristic-v1`, gates on loudness, band energy, tonality, harmonic stack, onset and pitch stability. Pitch stability does most of the work: sirens sweep, speech wobbles, music modulates, and horns hold their pitch.

`mlp-v1` is a small trained classifier: one hidden layer of 24 units over 12 spectral and 4 temporal features, about 5 KB of weights, and inference is two matrix-vector products. It is registered and selectable but not the default. On the head-to-head benchmark in `tests/detector-comparison.test.ts` it gets 8 of 9 cases right and the heuristic gets 9 of 9. The model does better on single-partial sounds like reversing beepers; the heuristic's pitch-stability gate does better on note-changing tonal sources such as brass.

Train it with `pnpm train:sound`. The held-out accuracy it prints (about 99.9%) only shows how separable the synthetic training corpus is. It is not a real-world accuracy figure.

Detectors are chosen through `lib/audio/registry.ts` and `flags.detectorId`. The registry also has TFJS and ONNX slots, which are documented stubs: their runtimes would be loaded with `await import()` only when selected, so neither is in the bundle. Every event stores `detectorId` and `detectorVersion`, so history stays interpretable after a swap.

Known false positives: reversing beepers, motorcycle exhaust resonance, steady siren segments, and brass on the car stereo.

## Scoring

- `lib/score/weights.ts`: weights plus anchor tables such as `[[0,100],[0.5,90],[1,78],...]`. Anchors make each threshold an explicit, arguable product decision ("2 horns a minute scores 60") instead of a curve constant.
- `lib/score/engine.ts`: the algorithm. Pure, no side effects.
- `lib/score/labels.ts`: bands, colours and copy.

**Missing sensors.** Each sub-score declares the sensor it needs. If that sensor is unavailable, the sub-score is dropped and the remaining weights are renormalised, so someone who denies the microphone gets a fair score instead of a penalty. Braking falls back to a GPS-based estimate at reduced weight when motion is denied.

**Short trips.** A 45-second drive with two horns is a small sample. Scores blend toward neutral until a drive reaches 5 minutes or 1 km and are marked provisional until then.

## Insights

The drive summary is built from templates. It works offline, and every sentence traces back to a number in `TripStats`.

- A segment claim ("most hard braking happened in the final third") only fires when one third holds at least 45% of at least 4 events.
- Rules that compare against history don't fire on a first drive.
- A drive recorded without some sensors says so, instead of quietly scoring lower.
- Every comparison line states the measurement it is based on.

## Demo drives

`/drive?demo=1` (optionally `&scenario=highway-calm` or `&scenario=stop-and-go`) synthesises sensor waveforms and runs them through the real FFT, detector and scorer. A demo drive is saved so its report can render, but it is excluded from history, lifetime totals, stats, Wrapped and achievements, never syncs, and is deleted the next time the app loads its drive list.

## Storage

IndexedDB holds `trips` (headers), `tripChunks` (samples, 120 per chunk) and `tripEvents`. Lists read headers only and never load telemetry they won't show.

Every record carries sync metadata (revision, dirty flag, tombstone, device ID), and every local write adds an operation to an outbox, even though nothing drains it yet. Turning sync on later means draining a queue instead of backfilling history. No IndexedDB types appear in repository signatures, so a sync transport can sit behind the same interface.

A drive whose session dies mid-recording (closed tab, killed browser, flat battery) is marked `abandoned` on the next launch, and lists only show completed drives.

## Keeping data on the device

Because everything is local, browser storage eviction is the main way to lose history. iOS clears script-writable storage for sites not opened in about a week unless they are on the home screen. Road360 therefore requests `navigator.storage.persist()` once there is a drive worth keeping, and the install prompt appears after a completed drive with the pitch "keep your drives".

Anything derived from the clock is computed on the client. The routes are statically prerendered, so `Date.now()` in a component body would run at build time: the shipped HTML once said "Late night" and showed the build date for every visitor.

## Privacy and community data

Community contribution is opt-in, off by default, and not connected to anything yet. `lib/sync/anonymize.ts` defines what would be shared: it trims 250 m from each end of a trace, snaps positions to ~150 m geohash cells, replaces timestamps with hour-of-week, drops cells with fewer than 3 samples, and includes no device or trip identifier. A drive shorter than about 500 m contributes nothing, because the two trims consume it.

## Cloud sync

The sync engine is implemented and tested; there is no server. `SyncTransport` is the whole network boundary, so connecting a backend means implementing four methods.

- Push happens before pull, so a conflict is detected while both versions are in hand.
- Acks are per key, so a partly accepted batch doesn't re-send the accepted half.
- A record edited during a push stays dirty and goes out again.
- Conflicts resolve last-write-wins on `(updatedAt, revision, deviceId)`. The device ID tiebreak means every device reaches the same answer. A delete beats a concurrent edit.

Two transports ship: `HttpTransport`, against the REST shape documented in `lib/sync/http-transport.ts`, and `MemoryTransport`, an in-memory server the tests run two simulated devices against. Without `NEXT_PUBLIC_SYNC_URL` the app uses the in-memory one, so nothing leaves the device. Pulled records are written with `putRaw` and `appendEventsRaw`, which skip the outbox so they are not queued straight back to the server.

## Community heatmaps

`lib/community/` folds anonymised cells into noise, braking, horn and overall heatmaps, per-road scores and area rankings. Cells are weighted by exposure, not visit count, so a cell built from 400 seconds of driving outweighs one built from 4.

A stretch needs at least 2 passes and 20 samples before it gets a score. Areas are shown by coordinates, because naming them would need a reverse geocoder.

Today the map runs on your own drives, passed through the same anonymisation pipeline that would upload them. With a sync server configured, `RemoteCommunitySource` takes over and the aggregation, UI and colour scales stay the same.

## Sharing and link previews

- **Share** uses `navigator.share({ files })`, the only route that hands the PNG straight to another app.
- **Post to X** opens X's intent URL, which can prefill text but not attach a file. The card is copied to the clipboard with `ClipboardItem` for pasting. Where the clipboard refuses images (Firefox), the card is downloaded instead and the note says so.
- **Save image** always works.

Link previews come from `app/opengraph-image.tsx`, rendered at build time by Satori. `metadataBase` in the root layout makes the image URL absolute; without it, previews degrade to a plain link. It reads `NEXT_PUBLIC_APP_URL`, then the Vercel production URL. Satori supports only a subset of CSS (flexbox only, explicit `display: flex` on anything with more than one child), so the file is written flat. It fetches no webfont, so the build works without network access.

## Gotchas

**Build with webpack, not Turbopack.** `@serwist/next` is a webpack plugin. `next build --turbopack` skips it silently: the build succeeds, no service worker is emitted, and the app can't be installed.

**Real sensors need HTTPS.** `getUserMedia` and geolocation require a secure context. `localhost` counts; `http://192.168.x.x` does not. Use `pnpm dev:https`. `/check` detects this and says so.

**`/check` is the sensor self-test.** It starts the real `SensorSuite`, through the same factory a drive uses, and prints live GPS fixes, dB level and acceleration. Start here when a drive recorded nothing. In headless Chromium it reports motion as failed, because there is no accelerometer.

**iOS motion permission.** `DeviceMotionEvent.requestPermission()` must be called synchronously inside a user gesture. Any `await` before it, including `getUserMedia`, loses the gesture. The permission wizard asks for one sensor per tap, motion first.

**iOS audio ducking.** An active mic stream reroutes audio to the earpiece and ducks the user's music. Silent mode in Settings records without the microphone for this reason.

**dB is approximate.** A phone microphone is not a calibrated sound level meter. Values carry a `calibrated` flag and the UI never claims absolute SPL.

**Map tiles.** CARTO Dark Matter. Since September 2026 CARTO requires a basemap key; set `NEXT_PUBLIC_CARTO_API_KEY` or the tiles show an "API key required" notice. Attribution is a licence condition and stays visible. Leaflet overrides in `globals.css` are deliberately unlayered, because Leaflet's own stylesheet is unlayered and unlayered CSS beats `@layer` regardless of source order.

## Not built yet

**A server.** Sync and community aggregation work against `MemoryTransport` and local data. A backend needs to implement `SyncTransport` (four methods, REST shape in `http-transport.ts`) and serve `/community/cells`.

**A model trained on real audio.** `mlp-v1` learns from synthesised sound and has never heard a real street. Retraining means replacing `lib/audio/training/corpus.ts`. `FEATURE_VERSION` makes a mismatched model refuse to load.

**Place names for areas.** Rankings show coordinates because there is no geocoder.
