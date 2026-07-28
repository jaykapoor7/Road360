import { cn } from '@/lib/utils/cn';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * `flat` renders the same silhouette without depending on a CSS custom
 * property, for share cards — those are rasterised detached from the app, so
 * anything resolved from `:root` would come out unstyled.
 */
export function Card({
  className,
  flat = false,
  ...props
}: DivProps & { flat?: boolean }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card p-4',
        flat ? 'glass-flat' : 'glass',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)} {...props} />
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('eyebrow', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardBody({ className, ...props }: DivProps) {
  return <div className={cn('', className)} {...props} />;
}
