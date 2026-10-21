import { collectEnvironment } from './bench/env';
import type { StageTimings } from './inference-client';
import type { ModelState } from './model';
import type { Overrides } from './overrides';

export interface DiagnosticsInput {
  model: ModelState;
  overrides: Overrides;
  error: { text: string; detail: string } | null;
  lastTimings: StageTimings | null;
  swActive: boolean;
}

/**
 * One blob a tester can paste into a chat when something fails on their phone: browser, device model, engine,
 * thread count, isolation, model and cache state, storage, the last error. No photos and no file names.
 */
export async function buildDiagnostics(i: DiagnosticsInput): Promise<string> {
  const environment = await collectEnvironment();

  let storage: { usageMB: number | null; quotaMB: number | null; persisted: boolean | null } | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    storage = {
      usageMB: est?.usage != null ? Math.round(est.usage / 1048576) : null,
      quotaMB: est?.quota != null ? Math.round(est.quota / 1048576) : null,
      persisted: (await navigator.storage?.persisted?.()) ?? null,
    };
  } catch {
    // storage API unavailable
  }

  let cacheNames: string[] | null = null;
  try {
    cacheNames = await caches.keys();
  } catch {
    // Cache Storage unavailable (some private modes)
  }

  const model =
    i.model.status === 'ready'
      ? { status: 'ready', ...i.model.info }
      : i.model.status === 'loading'
        ? { status: 'loading', loadedMB: Math.round(i.model.loaded / 1048576), totalMB: i.model.total ? Math.round(i.model.total / 1048576) : null }
        : { status: 'error', message: i.model.message };

  return JSON.stringify(
    {
      schema: 'compvis-diagnostics/1',
      at: new Date().toISOString(),
      app: { url: location.origin + location.pathname + location.search, mode: import.meta.env.MODE, lang: document.documentElement.lang },
      environment,
      overrides: i.overrides,
      model,
      serviceWorker: { supported: 'serviceWorker' in navigator, controlled: !!navigator.serviceWorker?.controller, active: i.swActive },
      storage,
      cacheNames,
      error: i.error,
      lastTimings: i.lastTimings,
      visibility: document.visibilityState,
    },
    null,
    1,
  );
}
