import type { Detection, LetterboxMeta } from '../core/types';
import type {
  EpChoice,
  SessionInfo,
  Smoothing,
  StageTimings,
  WorkerRequest,
  WorkerResponse,
} from '../worker/protocol';

export type { EpChoice, SessionInfo, Smoothing, StageTimings };

export interface ClientSessionInfo extends SessionInfo {
  /** navigator.storage.persist() result (Window-only API, so it is called here, not in the worker). */
  persisted: boolean | null;
}

export interface RunOptions {
  smoothing?: Smoothing;
  conf?: number;
  iou?: number;
  maxDet?: number;
  returnInput?: boolean;
}

export interface RunResult {
  meta: LetterboxMeta;
  dets: Detection[];
  raw: Float32Array;
  input: Float32Array | null;
  timings: StageTimings;
}

type Pending = {
  resolve: (r: WorkerResponse) => void;
  reject: (e: Error) => void;
  onProgress?: (loaded: number, total: number | null) => void;
};

// Distributive Omit so each request variant keeps its own fields.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

export class InferenceClient {
  private worker = new Worker(new URL('../worker/inference.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') {
        p.onProgress?.(msg.loaded, msg.total);
        return;
      }
      this.pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.message));
      else p.resolve(msg);
    };
    const fail = (why: string) => {
      for (const p of this.pending.values()) p.reject(new Error(why));
      this.pending.clear();
    };
    this.worker.onerror = (e) => fail(`worker error: ${e.message || 'failed to load/run worker script'}`);
    this.worker.onmessageerror = () => fail('worker message could not be deserialized');
  }

  private call(
    req: DistributiveOmit<WorkerRequest, 'id'>,
    transfer: Transferable[] = [],
    onProgress?: Pending['onProgress'],
  ): Promise<WorkerResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ ...req, id } as WorkerRequest, transfer);
    });
  }

  async init(
    opts: { modelUrl: string; ep?: EpChoice; useCache?: boolean },
    onProgress?: (loaded: number, total: number | null) => void,
  ): Promise<ClientSessionInfo> {
    const res = await this.call(
      { type: 'init', modelUrl: opts.modelUrl, ep: opts.ep ?? 'auto', useCache: opts.useCache ?? true },
      [],
      onProgress,
    );
    if (res.type !== 'ready') throw new Error(`unexpected reply: ${res.type}`);
    return { ...res.info, persisted: await requestPersistence() };
  }

  async run(image: Blob, opts: RunOptions = {}): Promise<RunResult> {
    const res = await this.call({
      type: 'run',
      image,
      smoothing: opts.smoothing ?? 'low',
      conf: opts.conf ?? 0.25,
      iou: opts.iou ?? 0.7,
      maxDet: opts.maxDet ?? 300,
      returnInput: opts.returnInput ?? false,
    });
    if (res.type !== 'result') throw new Error(`unexpected reply: ${res.type}`);
    return { meta: res.meta, dets: res.dets, raw: res.raw, input: res.input, timings: res.timings };
  }

  /** Run the session on a ready-made 1x3x640x640 tensor (transferred: caller's array is detached). */
  async infer(input: Float32Array): Promise<{ raw: Float32Array; inferMs: number }> {
    const res = await this.call({ type: 'infer', input }, [input.buffer]);
    if (res.type !== 'raw') throw new Error(`unexpected reply: ${res.type}`);
    return { raw: res.raw, inferMs: res.inferMs };
  }

  async clearModelCache(): Promise<void> {
    await this.call({ type: 'clear-cache' });
  }

  dispose() {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('client disposed'));
    this.pending.clear();
  }
}

async function requestPersistence(): Promise<boolean | null> {
  const storage = navigator.storage;
  if (!storage?.persist) return null;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return null;
  }
}
