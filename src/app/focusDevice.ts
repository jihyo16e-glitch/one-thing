// Phone features for Focus mode. Every call is optional: phones and some views refuse them, and that is fine.
// The real lock (Home and other apps blocked) is Android App pinning — an OS feature the app only explains.

interface WakeLockLike { release(): Promise<void> }
interface WakeLockApi { request(type: 'screen'): Promise<WakeLockLike> }

let wakeLock: WakeLockLike | null = null;

export function requestWake(): void {
  const api = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
  if (!api) return;
  api.request('screen').then((lock) => { wakeLock = lock; }).catch(() => { wakeLock = null; });
}

export function releaseWake(): void {
  if (wakeLock) {
    wakeLock.release().catch(() => undefined);
    wakeLock = null;
  }
}

/** Must be called from a tap (a user gesture), or the browser refuses. */
export function enterFullscreen(): void {
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  try {
    el.requestFullscreen().catch(() => undefined);
  } catch {
    /* refused: fine */
  }
}

export function exitFullscreen(): void {
  if (!document.fullscreenElement || !document.exitFullscreen) return;
  try {
    document.exitFullscreen().catch(() => undefined);
  } catch {
    /* ignore */
  }
}
