import type { EpChoice } from '../worker/protocol';

export interface Overrides {
  ep: EpChoice;
  /** Explicit WASM thread count, or undefined for ORT's default. */
  numThreads: number | undefined;
  /** True when the URL changed anything from the defaults. */
  forced: boolean;
}

/**
 * `?ep=wasm|webgpu|auto` and `?threads=1..16` let a tester force the engine without a new build, for example
 * when WebGPU misbehaves on one phone. Anything invalid is ignored.
 */
export function parseOverrides(search: string): Overrides {
  const q = new URLSearchParams(search);
  const e = q.get('ep');
  const ep: EpChoice = e === 'wasm' || e === 'webgpu' || e === 'auto' ? e : 'auto';
  const t = Number(q.get('threads'));
  const numThreads = q.has('threads') && Number.isInteger(t) && t >= 1 && t <= 16 ? t : undefined;
  return { ep, numThreads, forced: ep !== 'auto' || numThreads !== undefined };
}
