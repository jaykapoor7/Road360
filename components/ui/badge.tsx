import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-white/8 text-ink-muted',
        positive: 'bg-mint/15 text-mint',
        warning: 'bg-amber/15 text-amber',
        negative: 'bg-crimson/15 text-rose',
        brand: 'bg-brand/20 text-brand-bright',
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
