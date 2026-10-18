// First-run data and the default settings (§7.5).
// Used when nothing is saved yet, and by storage.ts to fill missing parts of saved data.
import type { AppData, FocusSettings, Settings } from '../domain/types';

export function defaultFocus(): FocusSettings {
  return { minutes: 50, keepAwake: true, fullScreen: true, pictureId: null };
}

/** welcomeDone defaults to true: saved data from before the welcome existed must not see it again. */
export function defaultSettings(): Settings {
  return { planTime: '20:30', dayBoundary: '05:30', lastExportAt: null, focus: defaultFocus(), welcomeDone: true };
}

/**
 * The first run: everything empty, and the welcome asks for the user's own goals.
 * (Until 2026-10-18 this held the owner's own goals; the first-use test as a new user showed every new
 * user would get them.)
 */
export function buildSeed(): AppData {
  return {
    version: 1,
    settings: { ...defaultSettings(), welcomeDone: false },
    days: {},
    goals: [],
    ideas: [],
    decisions: [],
  };
}
