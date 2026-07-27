import {
  Megaphone,
  Siren,
  ShieldAlert,
  Zap,
  Clock,
  Volume2,
  PauseCircle,
  Sparkles,
  HeartCrack,
  Footprints,
  Hourglass,
  Feather,
  Waves,
  Gauge,
  Route,
  Flame,
  Flag,
  Trophy,
  Shield,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

/**
 * Resolve an icon name (returned as a plain string by framework-agnostic modules
 * like insights and timeline presentation) to a component. Keeping the mapping
 * here lets `lib/` describe an icon without importing React.
 */
const ICONS: Record<string, LucideIcon> = {
  Megaphone,
  Siren,
  ShieldAlert,
  Zap,
  Clock,
  Volume2,
  PauseCircle,
  Sparkles,
  HeartCrack,
  Footprints,
  Hourglass,
  Feather,
  Waves,
  Gauge,
  Route,
  Flame,
  Flag,
  Trophy,
  Shield,
  CalendarDays,
  TrendingUp,
  TrendingDown,
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const Component = ICONS[name] ?? HelpCircle;
  return <Component size={size} className={className} />;
}
