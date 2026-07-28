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
  /**
   * Disable the microphone entirely. On iOS an active mic reroutes audio to the
   * earpiece and ducks the user's music; with this on the drive records without
   * it and the score renormalises over the remaining sensors.
   */
  silentMode: boolean;
}

export const DEFAULT_FLAGS: Flags = {
  /**
   * The heuristic remains the default, on measurement rather than preference.
   *
   * On the head-to-head benchmark (tests/detector-comparison.test.ts) the
   * trained model scores 8/9 and the heuristic 9/9: the model is better on
   * single-partial confusers like reversing beepers, but the heuristic's hard
   * pitch-stability rule still beats it on note-changing tonal sources such as
   * brass. Promoting the model to default would not be supported by the data.
   *
   * 'mlp-v1' is registered and selectable, and becomes the better default once
   * it is retrained on real labelled audio.
   */
  detectorId: 'heuristic-v1',
  syncEnabled: false,
  contributeAnonymousData: false,
  demoMode: false,
  silentMode: false,
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
