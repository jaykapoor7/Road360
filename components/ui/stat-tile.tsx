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
  /** Tints the value only. Tiles never take a coloured background. */
  accent?: string;
  className?: string;
  flat?: boolean;
}

/**
 * A single measurement: micro-label above, large numeral below.
 *
 * The accent colours the numeral rather than washing the tile, which is the
 * whole difference between a dashboard and a set of coloured boxes — six tinted
 * panels compete with each other, six tinted numbers read as one instrument.
 */
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
        'relative flex flex-col overflow-hidden rounded-tile p-4',
        flat ? 'glass-flat' : 'glass',
        unavailable && 'opacity-50',
        className,
      )}
    >
      <div className="mb-2.5 flex items-center gap-1.5">
        {icon ? <span className="shrink-0 text-ink-faint">{icon}</span> : null}
        <span className="eyebrow truncate">{label}</span>
      </div>

      {unavailable ? (
        <>
          <div className="num text-2xl text-ink-faint">—</div>
          <div className="mt-1.5 text-[11px] leading-tight text-ink-faint">
            {unavailableHint ?? 'Sensor unavailable'}
          </div>
        </>
      ) : (
        <>
          <div
            className="num text-[2.125rem] leading-none text-ink"
            style={accent ? { color: accent } : undefined}
          >
            {children}
          </div>
          {footnote ? (
            <div className="mt-2 text-[11px] leading-tight text-ink-muted">{footnote}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
