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
they exercise the whole pipeline rather than faking results.

They **count** — toward lifetime totals, streaks, achievements and Wrapped — and carry a `simulated`
flag that the UI shows as a ✦ wherever a drive is listed. Excluding them was the tidier answer on
paper and the wrong one in practice: someone who tried the demo landed on a Stats screen reading
"0 drives" above a non-zero lifetime distance, which reads as a broken app rather than a scrupulous
one. Anyone who wants clean numbers can delete them; nobody can be misled by a drive that is
labelled on every screen it appears on.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build (**webpack — see the Turbopack note**) |
| `pnpm test` | Vitest suite (194 tests) |
| `pnpm typecheck` | `tsc --noEmit`, strict |
| `pnpm lint` | ESLint, including the `lib/**` purity rule |
| `pnpm verify` | All of the above |
| `pnpm icons` | Regenerate PWA icons |

---

## Architecture

### The visual system

True-black canvas, near-black cards, one hairline, and colour reserved almost entirely for data.
There is no glassmorphism: `backdrop-filter` cost a frame on every scroll, muddied the data colours
behind it, and cannot be rasterised into a share card. `.glass` survives as the single card class
but is now a flat fill plus a 1px border.

Two rules do most of the work:

- **Accent the number, not the panel.** A tile's value takes the band colour; the tile itself never
  does. Six tinted panels compete with each other, six tinted numbers read as one instrument.
- **One type ramp.** A `.num` class (tabular figures, −0.03em tracking) for every measurement and an
  `.eyebrow` class (10px, 0.14em, uppercase) for every label, so a new screen cannot invent its own
  scale.

The primary action is white on black rather than a brand gradient — on a true-black canvas nothing
outranks pure white, which leaves the accent free to mean "live" and the band colours free to mean
"this is your score".

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

No `IDBKeyRange`, cursor or other IndexedDB shape appears in any repository signature, which is what
lets `SyncTransport` sit behind the same contract without the storage layer leaking into it.

A drive whose session dies mid-recording — closed tab, killed browser, flat battery — is swept to
`abandoned` on next launch rather than left in `recording` forever, and the lists query completed
trips only. Otherwise it surfaces as a permanent zero-score row leading to an empty report.

### Keeping the data alive

Everything is local, which makes eviction the main way a user loses their history. iOS clears
script-writable storage for sites that have not been opened in about a week unless they are on the
home screen, so `navigator.storage.persist()` is requested as soon as there is a drive worth
keeping, and the install prompt is pitched as "keep your drives" rather than "install our app" —
because that is literally what it does. It appears after a completed drive, not on first paint,
where it would be one more thing between a stranger and the app.

Anything derived from the clock is deferred to the client. These routes are statically prerendered,
so `Date.now()` in a component body is evaluated at *build* time in the build machine's timezone:
the shipped HTML said "Late night" and carried the date the bundle was compiled, for every visitor.

### Privacy

Community contribution is opt-in and off by default. `anonymize.ts` trims 250 m from **each end** of
a trace (so it never reveals home or work even at cell resolution), snaps to ~150 m geohash cells,
replaces timestamps with hour-of-week, drops cells with fewer than 3 samples, and carries no device
or trip identifier.

One visible consequence, worth knowing rather than treating as a bug: a drive shorter than ~500 m
contributes **nothing**, because both end-trims consume it. Short trips are invisible to the
community map by construction.

### Cloud sync

The engine is real and fully tested; only the server is missing. `SyncTransport` is the entire
network boundary, so pointing at a backend is an implementation of four methods.

Push happens before pull, so a conflict is detected while both versions are still in hand. Acks are
per-key, so a partially accepted batch doesn't re-send its accepted half. A record edited *during* a
push stays dirty and goes out again rather than being marked synced on a stale revision. Conflicts
resolve last-write-wins on `(updatedAt, revision, deviceId)` — the device tiebreak means every
device independently reaches the same answer — and a delete beats a concurrent edit, because
resurrecting a trip the user deleted is worse than losing an edit to it.

Two transports ship: `HttpTransport` against the REST shape documented in that file, and
`MemoryTransport`, an in-memory server that the tests drive two simulated devices against. With no
`NEXT_PUBLIC_SYNC_URL` set the app uses the in-memory one, so push, pull and conflict resolution are
demonstrable today without pretending a backend exists.

Pulled records are written through `putRaw`/`appendEventsRaw`, which deliberately skip the outbox —
routing them through the normal write path would queue them straight back to the server forever.

### Community heatmaps

`lib/community/` folds anonymised cells into noise, braking, horn and chaos heatmaps, per-road
scores and area rankings. Folding is weighted by exposure, not by visit count: a cell built from 400
seconds of driving shouldn't be outvoted by one built from 4.

Rankings are deliberately conservative — a stretch needs at least 2 passes and 20 samples before it
gets a score at all, because a "noisiest road" derived from one brief pass is worse than showing
nothing. Areas are identified by coordinates, not names; labelling them would need a reverse
geocoder and inventing names would be worse than showing none.

Today it runs on your own drives through the identical privacy pipeline that would upload them, so
the transform is exercised on every render. When sync is on, `RemoteCommunitySource` swaps in and
the aggregation, UI and colour scales are unchanged.

### Sound detection: heuristic vs trained model

Both ship. `heuristic-v1` is the **default**, and that is a measurement rather than a preference: on
the head-to-head benchmark (`tests/detector-comparison.test.ts`) the trained model scores 8/9 and
the heuristic 9/9. The model is better on single-partial confusers like reversing beepers; the
heuristic's hard pitch-stability gate still beats it on note-changing tonal sources such as brass.

`mlp-v1` is a 24-unit MLP over 12 spectral + 4 temporal features, 5 KB of weights, inference as two
matrix-vector products. No TensorFlow.js — a multi-megabyte WASM runtime on the critical path of
every drive would cost far more than it saves. `SoundEventDetector` still accepts a TFJS or ONNX
implementation when a genuinely large model warrants one.

Train with `pnpm train:sound`. The held-out figure it prints (~99.9%) describes how separable the
*synthetic* corpus is — it is **not** a real-world accuracy claim, and shouldn't be quoted as one.
The meaningful number is the 8/9 vs 9/9 comparison, where both detectors see identical inputs.

---

### Sharing

Three routes out, because they fail in different places:

- **Share** — `navigator.share({ files })`, the only one that hands the PNG straight to another app.
- **Post to X** — X's intent URL can prefill the composer but cannot be given a file, so the card
  goes to the clipboard via `ClipboardItem` and the user pastes it. Where the clipboard refuses
  images (Firefox has no image `ClipboardItem`) it downloads instead and the note says so, rather
  than opening an empty composer and leaving them to post a bare link.
- **Save image** — the fallback that always works.

Link previews come from `app/opengraph-image.tsx`, generated at build time by Satori. `metadataBase`
in the root layout is what makes the emitted tag absolute; without it the URL is relative and every
unfurl silently degrades to a plain link. It reads `NEXT_PUBLIC_APP_URL`, falling back to the Vercel
production URL, so a branch deployment previews as itself.

Satori supports a subset of CSS — flexbox only, explicit `display: flex` on anything with more than
one child — which is why that file is written flat instead of reusing the app's components. It
fetches no webfont on purpose: a build that reaches for a font CDN fails on a machine without
network access.

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

**A server.** Sync and community aggregation are both implemented and tested, but against
`MemoryTransport` and local data respectively. Standing up a backend means implementing
`SyncTransport` (four methods, REST shape documented in `http-transport.ts`) and serving
`/community/cells`.

**A model trained on real audio.** `mlp-v1` learns from synthesised sound, which bounds what it can
know — it has never heard an actual street. Retraining is a matter of replacing
`lib/audio/training/corpus.ts`; the feature extractor, inference path and registry are unchanged,
and `FEATURE_VERSION` makes a mismatched model refuse to load rather than silently misclassify.

**Place names for areas.** Rankings show coordinates because there is no geocoder.

## Stack

Next 15.5 (App Router) · React 19 · TypeScript strict · Tailwind v4 (CSS-first, no config file) ·
Framer Motion · Leaflet + react-leaflet 5 · idb · Serwist · html-to-image · Vitest
