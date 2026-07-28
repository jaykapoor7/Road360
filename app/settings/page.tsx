'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Download, Trash2, MicOff, Cloud, Users, Info, RefreshCw, Stethoscope } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { TabBar } from '@/components/layout/tab-bar';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/use-settings';
import { useSync } from '@/hooks/use-sync';
import { getRepository } from '@/lib/storage/local-repository';
import { buildTripExport } from '@/lib/storage/export';
import { APP_VERSION } from '@/lib/config/constants';
import { cn } from '@/lib/utils/cn';
import { staggerParent, fadeUp } from '@/components/motion/transitions';

export default function SettingsPage() {
  const { flags, update } = useSettings();
  const sync = useSync(flags.syncEnabled);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const exportData = async () => {
    setBusy('export');
    try {
      const repo = getRepository();
      const trips = await repo.trips.listRecords({ limit: 100_000 });
      const payload = await Promise.all(
        trips.map(async (trip) =>
          buildTripExport(
            trip,
            await repo.trips.readSamples(trip.id),
            await repo.trips.readEvents(trip.id),
          ),
        ),
      );

      const blob = new Blob([JSON.stringify({ format: 'road360-archive', trips: payload }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `road360-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${trips.length} drives.`);
    } finally {
      setBusy(null);
    }
  };

  const resetAll = async () => {
    if (!confirm('Delete every recorded drive? This cannot be undone.')) return;
    setBusy('reset');
    try {
      await getRepository().clearAll();
      setMessage('All local data deleted.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <AppShell>
        <PageHeader title="Settings" />

        <motion.div variants={staggerParent(0.06)} initial="hidden" animate="show" className="flex flex-col gap-5">
          {/* Recording */}
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader>
                <CardTitle>Recording</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-4">
                <Toggle
                  icon={<MicOff size={16} />}
                  label="Silent mode"
                  description="Record without the microphone. On iOS an active mic reroutes audio to the earpiece and ducks your music; the score renormalises over the remaining sensors."
                  checked={flags.silentMode}
                  onChange={(v) => update({ silentMode: v })}
                />
              </div>
            </Card>
          </motion.div>

          {/* Privacy */}
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader>
                <CardTitle>Privacy</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-4">
                <Toggle
                  icon={<Users size={16} />}
                  label="Contribute anonymous data"
                  description="Share ~150 m road cells with no identifiers, endpoints trimmed by 250 m and times bucketed to hour-of-week. Powers future noise and braking heatmaps."
                  checked={flags.contributeAnonymousData}
                  onChange={(v) => update({ contributeAnonymousData: v })}
                />
                <Toggle
                  icon={<Cloud size={16} />}
                  label="Cloud sync"
                  description={
                    sync.isDemo
                      ? 'No server is configured, so this syncs against an in-memory one — enough to see push, pull and conflict resolution work. Set NEXT_PUBLIC_SYNC_URL to point at a real backend.'
                      : 'Keep your drives in step across devices.'
                  }
                  checked={flags.syncEnabled}
                  onChange={(v) => update({ syncEnabled: v })}
                />

                {flags.syncEnabled ? (
                  <div className="rounded-tile bg-white/4 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-ink-muted">
                        {sync.status.pending > 0
                          ? `${sync.status.pending} change${sync.status.pending === 1 ? '' : 's'} queued`
                          : 'Everything synced'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void sync.sync()}
                        disabled={sync.syncing}
                        className="flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={sync.syncing ? 'animate-spin' : undefined} />
                        {sync.syncing ? 'Syncing' : 'Sync now'}
                      </button>
                    </div>
                    {sync.status.lastSyncAt ? (
                      <div className="text-[11px] text-ink-faint">
                        Last synced {new Date(sync.status.lastSyncAt).toLocaleTimeString()} ·{' '}
                        {sync.status.pushed} pushed, {sync.status.pulled} pulled
                        {sync.status.conflicts > 0 ? `, ${sync.status.conflicts} merged` : ''}
                      </div>
                    ) : null}
                    {sync.status.lastError ? (
                      <div className="mt-1 text-[11px] text-rose">{sync.status.lastError}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          </motion.div>

          {/* Data */}
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader>
                <CardTitle>Your data</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-muted">
                  Everything is stored locally in this browser. Export a full-fidelity copy at any
                  time.
                </p>
                <Button variant="subtle" full onClick={exportData} disabled={busy !== null}>
                  <Download size={16} /> Export all drives (JSON)
                </Button>
                <Button variant="danger" full onClick={resetAll} disabled={busy !== null}>
                  <Trash2 size={16} /> Delete all data
                </Button>
                {message ? <p className="text-center text-xs text-mint">{message}</p> : null}
              </div>
            </Card>
          </motion.div>

          {/* Diagnostics */}
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader>
                <CardTitle>Diagnostics</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-muted">
                  Not sure a drive is recording properly? Run the sensor check to see live GPS,
                  microphone and motion readings from this device.
                </p>
                <Link
                  href="/check"
                  className="flex h-11 items-center justify-center gap-2 rounded-pill border border-hairline bg-surface-2 text-[14px] font-semibold text-ink"
                >
                  <Stethoscope size={16} /> Run sensor check
                </Link>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-2 text-sm text-ink-muted">
                <div className="flex justify-between">
                  <span>Version</span>
                  <span className="text-ink tabular">{APP_VERSION}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sound detector</span>
                  <span className="text-ink">{flags.detectorId}</span>
                </div>
                <p className="mt-2 flex gap-2 text-xs text-ink-faint">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  Noise levels are approximate. A phone microphone is not a calibrated sound level
                  meter, so dB values are best read as relative.
                </p>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </AppShell>
      <TabBar />
    </>
  );
}

function Toggle({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex items-start gap-3', disabled && 'opacity-50')}>
      <span className="mt-0.5 text-ink-faint">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{label}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand' : 'bg-white/12',
        )}
      >
        {/*
          `left-0.5` is load-bearing. Without an explicit inset the knob is an
          absolutely positioned element with `left: auto`, so it falls back to
          its static position — which inside a <button> is not the left edge,
          and resolved to 22px: exactly the "on" offset. Every switch rendered
          as enabled no matter what it was bound to.
        */}
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}
