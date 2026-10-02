import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface PwaState {
  /** A service worker is active, which means its precache (app shell + ORT wasm) finished installing. */
  swActive: boolean;
  /** A new version was installed and is waiting for the user to reload into it. */
  needRefresh: boolean;
  /** Show the iOS "Add to Home Screen" hint (iOS, not already installed, not dismissed). */
  iosHint: boolean;
}

const HINT_KEY = 'compvis-ios-hint-dismissed';

let state: PwaState = { swActive: false, needRefresh: false, iosHint: false };
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
let started = false;
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

// iOS has no install prompt; Safari/Chrome on iOS install through the Share sheet, so we show a hint.
function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a Mac; the touch-points check tells them apart
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function hintDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false; // storage blocked: just show the hint
  }
}

export const swSupported = 'serviceWorker' in navigator;

/** Registers the service worker (production builds only; the dev server has none) and computes the iOS hint. */
export function initPwa() {
  if (started) return;
  started = true;
  set({ iosHint: isIos() && !isStandalone() && !hintDismissed() });
  if (!swSupported) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => set({ needRefresh: true }),
    onRegisterError: (e) => console.warn('[compvis] service worker registration failed:', e),
  });
  navigator.serviceWorker.ready.then(
    () => set({ swActive: true }),
    () => {},
  );
}

export function applyUpdate() {
  void updateSW?.(true); // skip waiting + reload into the new version
}

export function dismissUpdate() {
  set({ needRefresh: false });
}

export function dismissIosHint() {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    // ignore: the hint will simply show again next time
  }
  set({ iosHint: false });
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
