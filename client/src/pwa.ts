/**
 * Registers the FitTrack service worker.
 *
 * Registration is skipped in development so the dev server always serves
 * fresh assets, and is limited to secure origins (HTTPS or localhost).
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.DEV) return;

  const isSecure =
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (!isSecure) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      // A failed registration must never break the app.
      console.warn('Service worker registration failed:', error);
    });
  });
}
