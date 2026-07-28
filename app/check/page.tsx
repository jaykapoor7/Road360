'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Mic, Activity, Check, X, CircleDashed } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SectionLabel } from '@/components/ui/metric-row';
import { createSensorSuite } from '@/lib/sensors/factory';
import type { WebAudioCaptureSource } from '@/lib/sensors/web/audio-capture';
import { WebMotionSource } from '@/lib/sensors/web/motion-source';
import type { SensorSuite } from '@/lib/sensors/types';
import { cn } from '@/lib/utils/cn';

type Verdict = 'idle' | 'waiting' | 'ok' | 'failed';

interface Readout {
  verdict: Verdict;
  lines: string[];
  note?: string;
}

const EMPTY: Readout = { verdict: 'idle', lines: [] };

/**
 * Sensor self-test.
 *
 * The whole app is verifiable headless except this: simulated sources prove the
 * pipeline, but they cannot prove that a real phone hands us usable GPS, audio
 * and motion. This page runs the *real* `SensorSuite` — the same objects a
 * drive uses, through the same factory — and prints what each one actually
 * produces, so a minute in a parked car answers the question a browser on a
 * desktop never can.
 *
 * It is deliberately not linked from the tab bar. It is a diagnostic, reached
 * at /check, and it is the first thing to look at when someone reports that a
 * drive recorded nothing.
 */
export default function SensorCheckPage() {
  const [running, setRunning] = useState(false);
  const [secure, setSecure] = useState<boolean | null>(null);
  const [gps, setGps] = useState<Readout>(EMPTY);
  const [audio, setAudio] = useState<Readout>(EMPTY);
  const [motion, setMotion] = useState<Readout>(EMPTY);

  const suiteRef = useRef<SensorSuite | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // getUserMedia and geolocation both require a secure context. `localhost`
    // counts; a bare LAN IP does not, and the failure is otherwise a silent
    // permission rejection that looks like the user declining.
    setSecure(typeof window !== 'undefined' ? window.isSecureContext : null);
  }, []);

  const stop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    const suite = suiteRef.current;
    suiteRef.current = null;
    void suite?.gps.stop();
    void suite?.audio.stop();
    void suite?.motion.stop();
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setGps({ verdict: 'waiting', lines: [] });
    setAudio({ verdict: 'waiting', lines: [] });
    setMotion({ verdict: 'waiting', lines: [] });
    setRunning(true);

    // Motion first, and before any await — iOS drops the user activation that
    // DeviceMotionEvent.requestPermission() needs if anything is awaited first.
    if (WebMotionSource.needsExplicitPermission()) {
      const granted = await WebMotionSource.requestIosPermission();
      if (granted !== 'granted') {
        setMotion({
          verdict: 'failed',
          lines: [],
          note: 'Motion access was declined. iOS only asks once per page load — reload and tap Run again.',
        });
      }
    }

    const suite = createSensorSuite({ mode: 'live' });
    suiteRef.current = suite;

    const started = await Promise.all([
      suite.motion.start(),
      suite.audio.start(),
      suite.gps.start(),
    ]);
    const [motionStart, audioStart, gpsStart] = started;

    if (!motionStart.ok) {
      setMotion({ verdict: 'failed', lines: [], note: motionStart.error.message });
    }
    if (!audioStart.ok) {
      setAudio({ verdict: 'failed', lines: [], note: audioStart.error.message });
    }
    if (!gpsStart.ok) {
      setGps({ verdict: 'failed', lines: [], note: gpsStart.error.message });
    }

    pollRef.current = setInterval(() => {
      const current = suiteRef.current;
      if (!current) return;

      const fix = current.gps.peek();
      setGps((prev) =>
        prev.verdict === 'failed'
          ? prev
          : fix
            ? {
                verdict: 'ok',
                lines: [
                  `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`,
                  `accuracy ±${Math.round(fix.accuracy)} m`,
                  fix.speed !== null ? `speed ${(fix.speed * 3.6).toFixed(1)} km/h` : 'speed —',
                ],
                ...(fix.accuracy > 50
                  ? { note: 'Accuracy worse than 50 m — these fixes are rejected while driving.' }
                  : {}),
              }
            : { verdict: 'waiting', lines: [], note: 'Waiting for a fix…' },
      );

      const reading = current.audio.peek();
      const capture = current.audio as WebAudioCaptureSource;
      setAudio((prev) =>
        prev.verdict === 'failed'
          ? prev
          : reading
            ? {
                verdict: 'ok',
                lines: [
                  `level ${Math.round(reading.rmsDb)} dB`,
                  `peak ${Math.round(reading.peakDb)} dB`,
                  `floor ${Math.round(reading.floorDb)} dB`,
                ],
                ...(capture.calibrated === false
                  ? {
                      note: 'The browser kept its own processing on, so levels are relative, not dB.',
                    }
                  : {}),
              }
            : { verdict: 'waiting', lines: [], note: 'No frames yet…' },
      );

      const move = current.motion.peek();
      setMotion((prev) =>
        prev.verdict === 'failed'
          ? prev
          : move
            ? {
                verdict: 'ok',
                lines: [
                  `accel ${move.aMag.toFixed(2)} m/s²`,
                  `longitudinal ${move.longitudinal.toFixed(2)} m/s²`,
                  `jerk ${move.jerk.toFixed(2)} m/s³`,
                ],
              }
            : { verdict: 'waiting', lines: [], note: 'No motion events yet…' },
      );
    }, 500);
  }, []);

  return (
    <AppShell>
      <div className="mb-5 flex items-center gap-3 pt-1">
        <Link
          href="/settings"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-hairline bg-surface text-ink"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </Link>
      </div>

      <PageHeader title="Sensor check" subtitle="Confirm this phone can record a real drive" />

      {secure === false ? (
        <div className="mb-5 rounded-card border border-amber/25 bg-amber/10 p-4">
          <div className="text-[14px] font-semibold text-amber">Not a secure context</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
            The microphone and location are unavailable over plain http on a LAN address. Open this
            page over https, or on localhost, or the checks below will fail no matter what you
            allow.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        <div>
          <SectionLabel>Live readings</SectionLabel>
          <div className="flex flex-col gap-2">
            <CheckCard
              icon={<MapPin size={17} />}
              title="Location"
              hint="Walk or drive a few metres — accuracy should settle under 20 m outdoors."
              readout={gps}
            />
            <CheckCard
              icon={<Mic size={17} />}
              title="Microphone"
              hint="Speak, or tap the phone. The level should move."
              readout={audio}
            />
            <CheckCard
              icon={<Activity size={17} />}
              title="Motion"
              hint="Shake the phone. Acceleration should jump above 2 m/s²."
              readout={motion}
            />
          </div>
        </div>

        {running ? (
          <Button size="lg" variant="subtle" full onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button size="lg" full onClick={() => void start()}>
            Run the check
          </Button>
        )}

        <p className="text-center text-[12px] leading-relaxed text-ink-faint">
          Nothing here is recorded or saved. This page starts the same sensors a drive uses and
          shows what they return.
        </p>
      </div>
    </AppShell>
  );
}

function CheckCard({
  icon,
  title,
  hint,
  readout,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  readout: Readout;
}) {
  const { verdict, lines, note } = readout;

  return (
    <div className="rounded-card glass p-4">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'shrink-0',
            verdict === 'ok' ? 'text-brand' : verdict === 'failed' ? 'text-rose' : 'text-ink-faint',
          )}
        >
          {icon}
        </span>
        <span className="flex-1 text-[15px] font-semibold text-ink">{title}</span>
        {verdict === 'ok' ? (
          <Badge tone="positive">
            <Check size={12} /> Working
          </Badge>
        ) : verdict === 'failed' ? (
          <Badge tone="negative">
            <X size={12} /> Failed
          </Badge>
        ) : verdict === 'waiting' ? (
          <Badge tone="neutral">
            <CircleDashed size={12} className="animate-spin" /> Waiting
          </Badge>
        ) : (
          <Badge tone="neutral">Not started</Badge>
        )}
      </div>

      {lines.length > 0 ? (
        <div className="num mt-3 flex flex-col gap-1 text-[13px] text-ink">
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}

      {note ? (
        <p
          className={cn(
            'mt-2.5 text-[12px] leading-relaxed',
            verdict === 'failed' ? 'text-rose' : 'text-amber',
          )}
        >
          {note}
        </p>
      ) : null}

      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">{hint}</p>
    </div>
  );
}
