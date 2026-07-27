import { cn } from '@/lib/utils/cn';

interface StatTileProps {
  label: string;
  icon?: React.ReactNode;
  /** Rendered large. Pass a MetricNumber for animated values. */
  children: React.ReactNode;
  footnote?: string;
  /** Renders a dimmed "sensor unavailable" treatment instead of a value. */
  unavailable?: boolean;
  unavailableHint?: string;
  accent?: string;
  className?: string;
  flat?: boolean;
}

export function StatTile({
  label,
  icon,
  children,
  footnote,
  unavailable = false,
  unavailableHint,
  accent,
  className,
  flat = false,
}: StatTileProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-tile p-4',
        flat ? 'glass-flat' : 'glass',
        unavailable && 'opacity-55',
        className,
      )}
    >
      {accent ? (
        <div
          className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full opacity-25 blur-2xl"
          style={{ background: accent }}
        />
      ) : null}

      <div className="mb-2 flex items-center gap-1.5">
        {icon ? <span className="text-ink-faint">{icon}</span> : null}
        <span className="text-[10px] font-semibold tracking-[0.13em] text-ink-faint uppercase">
          {label}
        </span>
      </div>

      {unavailable ? (
        <>
          <div className="text-2xl font-bold text-ink-faint">—</div>
          <div className="mt-1 text-[11px] leading-tight text-ink-faint">
            {unavailableHint ?? 'Sensor unavailable'}
          </div>
        </>
      ) : (
        <>
          <div className="text-[2rem] leading-none font-bold text-ink">{children}</div>
          {footnote ? <div className="mt-1.5 text-[11px] text-ink-muted">{footnote}</div> : null}
        </>
      )}
    </div>
  );
}
