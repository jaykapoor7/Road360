import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-hairline bg-surface-2 text-ink-muted',
        positive: 'border-mint/25 bg-mint/10 text-mint',
        warning: 'border-amber/25 bg-amber/10 text-amber',
        negative: 'border-crimson/25 bg-crimson/10 text-rose',
        brand: 'border-brand/30 bg-brand/10 text-brand',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
