import { useSyncExternalStore } from 'react';
import { MODEL_URL } from './config';
import { InferenceClient } from './inference-client';
import type { ClientSessionInfo } from './inference-client';

export type ModelState =
  | { status: 'loading'; loaded: number; total: number | null }
  | { status: 'ready'; info: ClientSessionInfo }
  | { status: 'error'; message: string };

// One worker + one session for the whole page, started once. A module singleton (not a component effect)
// so React StrictMode's double mount cannot terminate the worker mid-download or fetch the model twice.
let state: ModelState = { status: 'loading', loaded: 0, total: null };
let ready: Promise<InferenceClient> | null = null;
const listeners = new Set<() => void>();

function setState(next: ModelState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Starts loading on first call; later calls return the same promise. After a failure the next call retries. */
export function ensureModel(): Promise<InferenceClient> {
  if (ready) return ready;
  setState({ status: 'loading', loaded: 0, total: null });
  const client = new InferenceClient();
  ready = client
    .init({ modelUrl: MODEL_URL, ep: 'auto', useCache: true }, (loaded, total) =>
      setState({ status: 'loading', loaded, total }),
    )
    .then((info) => {
      setState({ status: 'ready', info });
      return client;
    })
    .catch((err: unknown) => {
      client.dispose();
      ready = null;
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      throw err;
    });
  return ready;
}

export function useModelState(): ModelState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
