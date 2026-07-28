'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Share, Plus, Download } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { SPRING } from '@/components/motion/transitions';

/**
 * The install nudge.
 *
 * Framed around what installing actually protects rather than around
 * installing: on iOS, storage for a site that has not been added to the home
 * screen is evicted after about a week of not visiting, and everything Road360
 * records is local. "Keep your drives" is the honest pitch; "install our app"
 * is not.
 */
export function InstallPrompt({ tripCount }: { tripCount: number }) {
  const { kind, install, dismiss } = useInstallPrompt(tripCount);

  return (
    <AnimatePresence>
      {kind ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={SPRING.smooth}
          className="fixed inset-x-3 z-50 rounded-card border border-hairline bg-surface-2 p-4 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)]"
          style={{ bottom: 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom) + 0.75rem)' }}
          role="dialog"
          aria-label="Add Road360 to your home screen"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand">
              <Download size={17} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-ink">Keep your drives</div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                {kind === 'ios-instructions' ? (
                  <>
                    Safari clears data for sites you have not opened in a while. Add Road360 to your
                    home screen to keep your history: tap{' '}
                    <Share size={12} className="inline align-[-1px]" /> then{' '}
                    <Plus size={12} className="inline align-[-1px]" /> Add to Home Screen.
                  </>
                ) : (
                  'Install Road360 so your history is kept, and so it opens full screen.'
                )}
              </p>

              {kind === 'prompt' ? (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="mt-3 h-9 rounded-pill bg-ink px-4 text-[13px] font-bold text-void"
                >
                  Install
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void dismiss()}
              aria-label="Dismiss"
              className="-mt-1 -mr-1 shrink-0 p-1 text-ink-faint"
            >
              <X size={17} />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
