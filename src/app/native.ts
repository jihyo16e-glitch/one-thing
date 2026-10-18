import { Capacitor } from '@capacitor/core';

/** true inside the Android APK (Capacitor, 2026-10-18); false in Chrome and the installed web app. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}
