import { WifiOff } from 'lucide-react';
import Link from 'next/link';

/** Navigation fallback served by the service worker when the network is gone. */
export default function OfflinePage() {
  return (
    <div className="grid min-h-dvh place-items-center px-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <WifiOff size={40} className="text-ink-faint" />
        <h1 className="text-xl font-bold text-ink">You&apos;re offline</h1>
        <p className="max-w-xs text-sm text-ink-muted">
          Road360 records drives without a connection — your data is stored on this device. Map
          tiles will fill in when you&apos;re back online.
        </p>
        <Link href="/" className="text-sm font-semibold text-brand-bright">
          Back to home
        </Link>
      </div>
    </div>
  );
}
