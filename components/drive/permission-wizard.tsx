'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Mic, Activity, Check, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { SPRING } from '@/components/motion/transitions';
import type { PermissionState, SensorKind } from '@/lib/domain/sensors';
import { SENSOR_PURPOSE } from '@/lib/domain/sensors';
import type { usePermissions } from '@/hooks/use-permissions';

interface Step {
  kind: SensorKind;
  title: string;
  icon: typeof MapPin;
  request: () => Promise<PermissionState>;
}

/**
 * Requests the three permissions, one per tap.
 *
 * Motion is deliberately first because its request is the most fragile:
 * `DeviceMotionEvent.requestPermission()` must run synchronously inside the tap
 * with nothing awaited before it. Each step is its own button so the request
 * always sits directly under a user gesture.
 *
 * Any sensor can be skipped — the drive still records with whatever was granted,
 * and the report says which signals were missing.
 */
export function PermissionWizard({
  permissions,
  onComplete,
  onCancel,
}: {
  permissions: ReturnType<typeof usePermissions>;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const { states, requestMotion, requestMicrophone, requestLocation } = permissions;
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const steps: Step[] = [
    { kind: 'motion', title: 'Motion', icon: Activity, request: requestMotion },
    { kind: 'audio', title: 'Microphone', icon: Mic, request: requestMicrophone },
    { kind: 'gps', title: 'Location', icon: MapPin, request: requestLocation },
  ];

  const step = steps[index]!;
  const isLast = index === steps.length - 1;

  const advance = () => {
    if (isLast) onComplete();
    else setIndex((i) => i + 1);
  };

  const handleRequest = async () => {
    setBusy(true);
    // The request must be the first awaited call in this handler for iOS motion.
    await step.request();
    setBusy(false);
    advance();
  };

  const StepIcon = step.icon;
  const state = states[step.kind];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <div
              key={s.kind}
              className={cn(
                'h-1 w-8 rounded-full transition-colors',
                i < index ? 'bg-mint' : i === index ? 'bg-brand' : 'bg-white/12',
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-ink-faint transition-colors hover:text-ink"
          aria-label="Cancel"
        >
          <X size={20} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step.kind}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={SPRING.smooth}
          className="flex flex-col items-center gap-4 py-4 text-center"
        >
          <div
            className="aura relative grid size-16 place-items-center rounded-2xl border border-hairline bg-surface-2"
            style={{ ['--aura-color' as string]: '#00e08c', ['--aura-opacity' as string]: '0.22' }}
          >
            <StepIcon size={28} className="text-brand" />
          </div>

          <div>
            <h2 className="text-[19px] font-bold tracking-[-0.01em] text-ink">
              Allow {step.title.toLowerCase()}
            </h2>
            <p className="mx-auto mt-2 max-w-[18rem] text-[13px] leading-relaxed text-ink-muted">
              {SENSOR_PURPOSE[step.kind]}
            </p>
          </div>

          {state === 'granted' ? (
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-mint">
              <Check size={15} /> Granted
            </div>
          ) : state === 'denied' ? (
            /*
              A denial cannot be re-prompted from the page — once the browser has
              recorded it, calling the API again returns immediately. Saying
              "allow it in Settings" without saying *whose* settings sends people
              to the app's own Settings screen, which cannot grant it either.
            */
            <div className="max-w-[18rem] text-[12px] leading-relaxed text-amber">
              Blocked. The drive will still record without it — the report says which signals were
              missing. To turn it back on, use your browser&rsquo;s site permissions for this page.
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="flex flex-col gap-2">
        <Button size="lg" full onClick={handleRequest} disabled={busy}>
          {state === 'granted' || state === 'denied' ? 'Continue' : `Allow ${step.title.toLowerCase()}`}
          <ChevronRight size={18} />
        </Button>
        <Button size="sm" variant="ghost" full onClick={advance} disabled={busy}>
          {isLast ? 'Done' : 'Skip this one'}
        </Button>
      </div>
    </div>
  );
}
