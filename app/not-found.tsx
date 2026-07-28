import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-hairline bg-surface">
        <Compass size={26} className="text-ink-faint" />
      </div>
      <div>
        <h1 className="text-[22px] leading-none font-bold tracking-[-0.02em] text-ink">
          Nothing here
        </h1>
        <p className="mx-auto mt-3 max-w-[18rem] text-[13px] leading-relaxed text-ink-muted">
          That page does not exist. If you followed a link to a drive, it may have been deleted from
          this device.
        </p>
      </div>
      <Link
        href="/"
        className="flex h-11 items-center justify-center rounded-pill bg-ink px-6 text-[14px] font-bold text-void"
      >
        Back to home
      </Link>
    </div>
  );
}
