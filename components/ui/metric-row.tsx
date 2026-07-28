import { cn } from '@/lib/utils/cn';

/**
 * Label left, value right, hairline between. The workhorse layout for dense
 * numeric lists — lifetime totals, sub-scores, road rankings.
 *
 * The divider is drawn as a border on every row but the last rather than as a
 * separate element, so a list can be built by mapping without the caller having
 * to know where the end is.
 */
export function MetricRow({
  label,
  value,
  sub,
  icon,
  accent,
  last = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Secondary line under the label. */
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  /** Colours the value. */
  accent?: string;
  last?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-3',
        !last && 'border-b border-hairline',
        className,
      )}
    >
      {icon ? <span className="shrink-0 text-ink-faint">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-ink">{label}</div>
        {sub ? <div className="mt-0.5 truncate text-[11px] text-ink-faint">{sub}</div> : null}
      </div>
      <div
        className="num shrink-0 text-[15px] text-ink"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

/** Section heading. Sits above a card, not inside it. */
export function SectionLabel({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-2.5 flex items-baseline justify-between gap-3 px-0.5', className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}
