import { cn } from '@/lib/utils/cn';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * `flat` renders the same silhouette without backdrop-filter, for share cards —
 * html-to-image cannot composite backdrop-filter inside an SVG foreignObject.
 */
export function Card({
  className,
  flat = false,
  ...props
}: DivProps & { flat?: boolean }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card p-5',
        flat ? 'glass-flat' : 'glass',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn('mb-3 flex items-center justify-between gap-3', className)} {...props} />;
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase',
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardBody({ className, ...props }: DivProps) {
  return <div className={cn('', className)} {...props} />;
}
