// Focus lock in the APK (2026-10-18, "bounce-back"): during a focus session, leaving the app (Home, recent
// apps, Settings from the pull-down menu) brings One Thing back within about a second. Native side:
// FocusLockPlugin + FocusLockService. The web app cannot do this; there it is App pinning (Focus start).
import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

export interface LockStatus { overlay: boolean; usage: boolean; running: boolean }

interface FocusLockPlugin {
  status(): Promise<LockStatus>;
  openOverlaySettings(): Promise<void>;
  openUsageSettings(): Promise<void>;
  start(options: { endsAt: number }): Promise<void>;
  stop(): Promise<void>;
}

const FocusLock = registerPlugin<FocusLockPlugin>('FocusLock');
const OFF: LockStatus = { overlay: false, usage: false, running: false };

/** true when this phone can lock focus (the APK). */
export function canLockFocus(): boolean {
  return isNative();
}

export async function lockStatus(): Promise<LockStatus> {
  if (!isNative()) return OFF;
  try {
    return await FocusLock.status();
  } catch {
    return OFF;
  }
}

export function lockReady(s: LockStatus): boolean {
  return s.overlay && s.usage;
}

export function openOverlaySettings(): void {
  FocusLock.openOverlaySettings().catch(() => undefined);
}

export function openUsageSettings(): void {
  FocusLock.openUsageSettings().catch(() => undefined);
}

/** Starts the lock until `endsAt` (ms). Returns false when it could not start (a switch is off). */
export async function startLock(endsAt: number): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await FocusLock.start({ endsAt });
    return true;
  } catch {
    return false;
  }
}

export function stopLock(): void {
  if (isNative()) FocusLock.stop().catch(() => undefined);
}
