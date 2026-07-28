'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Compass, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { PermissionWizard } from '@/components/drive/permission-wizard';
import { LiveHeader, LiveStatGrid } from '@/components/drive/live-metrics';
import { LiveMap } from '@/components/drive/live-map';
import { DriveControls } from '@/components/drive/drive-controls';
import { SensorStatusRow } from '@/components/drive/sensor-status-row';
import { usePermissions } from '@/hooks/use-permissions';
import { useDriveSession } from '@/hooks/use-drive-session';
import { isScenarioId, type ScenarioId } from '@/lib/sensors/mock/scenarios';
import { fadeUp, staggerParent } from '@/components/motion/transitions';

type Phase = 'setup' | 'live';

function DriveScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const permissions = usePermissions();
  const drive = useDriveSession();

  const [phase, setPhase] = useState<Phase>('setup');
  const [showWizard, setShowWizard] = useState(false);
  const startedRef = useRef(false);

  const demo = params.get('demo') === '1';
  const scenario: ScenarioId = isScenarioId(params.get('scenario'))
    ? (params.get('scenario') as ScenarioId)
    : 'city-chaos';

  const beginDrive = useCallback(
    async (simulated: boolean) => {
      if (startedRef.current) return;
      startedRef.current = true;
      setPhase('live');
      await drive.start({ simulated, scenario });
    },
    [drive, scenario],
  );

  // A demo drive needs no permissions, so it starts straight away.
  useEffect(() => {
    if (demo && phase === 'setup' && !startedRef.current) {
      void beginDrive(true);
    }
  }, [demo, phase, beginDrive]);

  const handleEnd = useCallback(async () => {
    const result = await drive.finish();
    if (result) router.push(`/trip/${result.tripId}`);
  }, [drive, router]);

  /* --------------------------------- live -------------------------------- */
  if (phase === 'live') {
    return (
      <AppShell padded={false}>
        <div className="flex min-h-dvh flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mb-4">
            <LiveHeader />
          </div>

          <div className="mb-3.5">
            <SensorStatusRow />
          </div>

          <LiveMap className="mb-3 h-44 overflow-hidden rounded-card border border-hairline" />

          <div className="flex-1">
            <LiveStatGrid />
          </div>

          <div className="mt-6">
            <DriveControls
              paused={drive.state === 'paused'}
              onPause={drive.pause}
              onResume={drive.resume}
              onEnd={handleEnd}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  /* --------------------------------- setup ------------------------------- */
  return (
    <AppShell>
      <motion.div
        variants={staggerParent()}
        initial="hidden"
        animate="show"
        className="flex min-h-[80dvh] flex-col justify-center gap-8"
      >
        {showWizard ? (
          <div className="rounded-card glass p-5">
            <PermissionWizard
              permissions={permissions}
              onComplete={() => void beginDrive(false)}
              onCancel={() => setShowWizard(false)}
            />
          </div>
        ) : (
          <>
            <motion.div variants={fadeUp} className="text-center">
              <div
                className="aura relative mx-auto mb-7 grid size-20 place-items-center rounded-[1.75rem] border border-hairline bg-surface"
                style={{ ['--aura-color' as string]: '#00e08c', ['--aura-opacity' as string]: '0.3' }}
              >
                <Compass size={36} className="text-brand" />
              </div>
              <h1 className="text-[28px] leading-none font-bold tracking-[-0.02em] text-ink">
                Ready to drive
              </h1>
              <p className="mx-auto mt-3 max-w-[19rem] text-[14px] leading-relaxed text-ink-muted">
                Road360 listens for horns, feels every brake, and scores how chaotic your commute
                really is.
              </p>
            </motion.div>

            <motion.div variants={fadeUp} className="flex flex-col gap-2.5">
              <Button size="lg" full onClick={() => setShowWizard(true)}>
                Start drive
              </Button>
              <Button size="md" variant="subtle" full onClick={() => void beginDrive(true)}>
                <Sparkles size={16} className="text-brand" /> Try a demo drive
              </Button>
              <p className="mt-1 text-center text-[12px] leading-relaxed text-ink-faint">
                No sensors handy? The demo synthesises a real commute and runs it through the same
                detector and scorer.
              </p>
            </motion.div>
          </>
        )}
      </motion.div>
    </AppShell>
  );
}

export default function DrivePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-void" />}>
      <DriveScreen />
    </Suspense>
  );
}
