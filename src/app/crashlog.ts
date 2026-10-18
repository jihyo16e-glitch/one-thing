// The APK's crash recorder (MainActivity + CrashLogPlugin, 2026-10-18): when the app closes by mistake,
// the error is saved on the phone, and the next start shows it so the user can send a screenshot.
import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

interface CrashLogPlugin {
  read(): Promise<{ text: string }>;
  clear(): Promise<void>;
}

const CrashLog = registerPlugin<CrashLogPlugin>('CrashLog');

/** The saved crash report, or '' (also on the web, where there is no recorder). */
export async function lastCrash(): Promise<string> {
  if (!isNative()) return '';
  try {
    return (await CrashLog.read()).text || '';
  } catch {
    return '';
  }
}

export function clearCrash(): void {
  if (isNative()) CrashLog.clear().catch(() => undefined);
}

/** The lines that name the cause: the first error line and every "Caused by". */
export function crashSummary(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim());
  const start = lines.findIndex((l) => l === '');
  const first = lines.slice(start + 1).find((l) => l.length > 0) ?? '';
  return [first, ...lines.filter((l) => l.startsWith('Caused by'))].filter(Boolean).slice(0, 4);
}
