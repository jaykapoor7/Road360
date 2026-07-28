import { cn } from '@/lib/utils/cn';

/**
 * The mobile frame. Content is capped at a phone width and centred so the app
 * stays legible on a desktop browser without pretending to be a desktop app.
 */
export function AppShell({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md">
      <div className={cn(padded && 'px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-tabs', className)}>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[30px] leading-none font-bold tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle ? <p className="mt-2 text-[13px] text-ink-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
