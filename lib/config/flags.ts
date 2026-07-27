/**
 * Feature flags.
 *
 * `detectorId` is the seam that makes the sound detector swappable: pointing it
 * at a registered TFJS or ONNX factory changes the model with no call-site
 * edits anywhere in the app.
 */
export interface Flags {
  detectorId: string;
  /** Cloud sync. The engine exists and no-ops while this is false. */
  syncEnabled: boolean;
  /** Anonymous community contribution. Opt-in, and off by default. */
  contributeAnonymousData: boolean;
  /** Feed simulated sensors instead of real ones. */
  demoMode: boolean;
}

export const DEFAULT_FLAGS: Flags = {
  detectorId: 'heuristic-v1',
  syncEnabled: false,
  contributeAnonymousData: false,
  demoMode: false,
};

export const SETTINGS_KEYS = {
  flags: 'flags',
  calibrationOffset: 'audio.calibrationOffset',
  calibrated: 'audio.calibrated',
  /** Disables the microphone entirely — see the iOS audio-ducking note in the README. */
  silentMode: 'audio.silentMode',
  installPromptSeen: 'pwa.installPromptSeen',
  completedTripCount: 'stats.completedTripCount',
} as const;
