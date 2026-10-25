// Phone time in the APK (2026-10-25): how long each app was in front today (Usage access), and a small
// floating bubble that shows the scrolling minutes on top of scroll apps ("Display over other apps").
// Native side: ScreenTimePlugin + ScrollWatchService. The web app cannot read other apps at all.
import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

export interface AppUse { pkg: string; label: string; ms: number; opens: number }
export interface Usage { apps: AppUse[]; totalMs: number }
/** `battery` = battery saving leaves One Thing alone (else the phone may close the bubble). */
export interface PhoneAccess { overlay: boolean; usage: boolean; bubble: boolean; battery: boolean }
export interface BubbleConfig { apps: string[]; limitMin: number; boundaryMin: number; one: string; hardStop: boolean }

interface ScreenTimePlugin {
  status(): Promise<PhoneAccess>;
  usage(options: { since: number }): Promise<Usage>;
  startBubble(options: BubbleConfig): Promise<void>;
  stopBubble(): Promise<void>;
  openBatterySettings(): Promise<void>;
}

const ScreenTime = registerPlugin<ScreenTimePlugin>('ScreenTime');
const OFF: PhoneAccess = { overlay: false, usage: false, bubble: false, battery: true };

export function openBatterySettings(): void {
  if (isNative()) ScreenTime.openBatterySettings().catch(() => undefined);
}

/** true when this phone can track app time (the APK). */
export function canTrackPhone(): boolean {
  return isNative();
}

export async function phoneAccess(): Promise<PhoneAccess> {
  if (!isNative()) return OFF;
  try {
    return await ScreenTime.status();
  } catch {
    return OFF;
  }
}

/** App time since `since` (ms), most used first. Null when it cannot be read (no Usage access). */
export async function phoneUsage(since: number): Promise<Usage | null> {
  if (!isNative()) return null;
  try {
    return await ScreenTime.usage({ since });
  } catch {
    return null;
  }
}

/** Starts or updates the bubble. Returns false when it could not start (a switch is off). */
export async function startBubble(config: BubbleConfig): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await ScreenTime.startBubble(config);
    return true;
  } catch {
    return false;
  }
}

export function stopBubble(): void {
  if (isNative()) ScreenTime.stopBubble().catch(() => undefined);
}

export function scrollMs(u: Usage, apps: string[]): number {
  return u.apps.filter((a) => apps.includes(a.pkg)).reduce((sum, a) => sum + a.ms, 0);
}
