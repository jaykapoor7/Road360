'use client';

import { MapPin, Mic, Activity } from 'lucide-react';
import { useSessionChannel } from '@/hooks/use-session';
import { cn } from '@/lib/utils/cn';
import type { SensorKind, SensorStatus } from '@/lib/domain/sensors';

const ICONS = { gps: MapPin, audio: Mic, motion: Activity } as const;
const LABELS = { gps: 'GPS', audio: 'Mic', motion: 'Motion' } as const;

function statusColor(status: SensorStatus): string {
  switch (status) {
    case 'live':
      return 'text-mint';
    case 'degraded':
      return 'text-amber';
    case 'denied':
    case 'unsupported':
    case 'error':
      return 'text-ink-faint';
    default:
      return 'text-ink-faint';
  }
}

/** Per-sensor health chips. Subscribes to the sensors channel, which commits only on status change. */
export function SensorStatusRow() {
  const sensors = useSessionChannel('sensors');

  return (
    <div className="flex items-center justify-center gap-2">
      {(Object.keys(ICONS) as SensorKind[]).map((kind) => {
        const Icon = ICONS[kind];
        const status = sensors.statuses[kind];
        const active = status === 'live' || status === 'degraded';
        return (
          <div
            key={kind}
            className={cn(
              'glass flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold',
              statusColor(status),
            )}
          >
            <Icon size={12} />
            {LABELS[kind]}
            <span
              className={cn(
                'size-1.5 rounded-full',
                active ? 'bg-current' : 'bg-current opacity-30',
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
