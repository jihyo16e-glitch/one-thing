// First-run data and the default settings (§7.5).
// Used when nothing is saved yet, and by storage.ts to fill missing parts of saved data.
import type { AppData, FocusSettings, PhoneSettings, Settings } from '../domain/types';

export function defaultFocus(): FocusSettings {
  return { minutes: 50, keepAwake: true, fullScreen: true, pictureId: null };
}

/** The list before 2026-10-25 evening: saved settings still equal to it get the new list (the user never changed it). */
export const OLD_DEFAULT_SCROLL_APPS = [
  'com.facebook.katana',
  'com.facebook.lite',
  'com.instagram.android',
  'com.zhiliaoapp.musically',
  'com.ss.android.ugc.trill',
  'com.google.android.youtube',
  'com.twitter.android',
  'com.reddit.frontpage',
];

/** The usual scroll apps: Facebook (+ Lite), Instagram (+ Lite), TikTok (2 regions + Lite), YouTube, X, Reddit. The user can change the list. */
export const DEFAULT_SCROLL_APPS = [
  ...OLD_DEFAULT_SCROLL_APPS,
  'com.zhiliaoapp.musically.go',
  'com.instagram.lite',
];

export function defaultPhone(): PhoneSettings {
  return { scrollApps: [...DEFAULT_SCROLL_APPS], limitMin: 30, bubble: false, hardStop: true, bubbleAsked: false };
}

/** welcomeDone defaults to true: saved data from before the welcome existed must not see it again. */
export function defaultSettings(): Settings {
  return { planTime: '20:30', dayBoundary: '05:30', lastExportAt: null, focus: defaultFocus(), welcomeDone: true, phone: defaultPhone() };
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
    checks: [],
    pauses: [],
  };
}
