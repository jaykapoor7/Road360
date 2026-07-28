'use client';

import { useCallback, useEffect, useState } from 'react';
import { isIos, isStandalone, requestPersistentStorage } from '@/lib/platform/storage';
import { getRepository } from '@/lib/storage/local-repository';
import { SETTINGS_KEYS } from '@/lib/config/flags';

/** The Chromium-only event that lets a site trigger its own install prompt. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallKind = 'prompt' | 'ios-instructions' | null;

/**
 * Install prompting, and the storage-durability request that rides with it.
 *
 * Installing is not a growth metric here, it is the mechanism that stops iOS
 * evicting the user's drives (see lib/platform/storage.ts). That is why the
 * prompt is offered once there is something to lose — after a completed drive —
 * rather than on first paint, where it would be one more thing between a
 * stranger and the app.
 */
export function useInstallPrompt(tripCount: number) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    setStandalone(isStandalone());

    void (async () => {
      const seen = await getRepository().settings.get<boolean>(
        SETTINGS_KEYS.installPromptSeen,
        false,
      );
      setDismissed(seen);
    })();

    const onBeforeInstall = (event: Event) => {
      // Chromium shows its own mini-infobar unless this is prevented, and the
      // event is only replayable if we keep it.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      void requestPersistentStorage();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Ask for durable storage as soon as there is a drive worth keeping. Chrome
  // grants this silently on an installed or engaged site; Safari does not, which
  // is what the install hint is for.
  useEffect(() => {
    if (tripCount > 0) void requestPersistentStorage();
  }, [tripCount]);

  const dismiss = useCallback(async () => {
    setDismissed(true);
    await getRepository().settings.set(SETTINGS_KEYS.installPromptSeen, true);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    await getRepository().settings.set(SETTINGS_KEYS.installPromptSeen, true);
    setDismissed(true);
  }, [deferred]);

  const kind: InstallKind =
    standalone || dismissed || tripCount === 0
      ? null
      : deferred
        ? 'prompt'
        : isIos()
          ? 'ios-instructions'
          : null;

  return { kind, install, dismiss };
}
