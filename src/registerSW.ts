// Registers the service worker that vite.config.ts emits as sw.js, so the installed app
// opens offline. Production builds only: the dev server never gets a worker.
// Never throws: if service workers are missing or blocked, the app still works online.
import { isNative } from './app/native';

export function registerSW(): void {
  // In the APK the files are already on the phone; a worker could keep serving an old version.
  if (!import.meta.env.PROD || isNative()) return;
  try {
    if (!('serviceWorker' in navigator)) return;
    const register = (): void => {
      try {
        // updateViaCache 'none': always check sw.js on the network, so a new build is found.
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => undefined);
      } catch {
        // Blocked (for example by privacy settings). Nothing to do.
      }
    };
    // Wait for the page to finish loading, so caching does not slow the first screen.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  } catch {
    // navigator.serviceWorker can throw when storage is blocked. Nothing to do.
  }
}
