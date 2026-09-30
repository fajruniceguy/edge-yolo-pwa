import type { EpChoice, SessionInfo } from './protocol';

/**
 * onnxruntime-web 1.30.0 loading (verified against the installed package's `exports` and lib/ source):
 *  - `onnxruntime-web/webgpu` = WebGPU EP build, Emscripten glue `ort-wasm-simd-threaded.asyncify.{mjs,wasm}`.
 *  - `onnxruntime-web/wasm`   = CPU-only build, glue `ort-wasm-simd-threaded.{mjs,wasm}` (smaller binary).
 * vite.config.ts aliases both specifiers to the `*.min.mjs` extern-wasm entries, so the glue + wasm are
 * NOT bundled; they are served untouched from `${BASE_URL}ort/` (devtools/vite-plugins.ts) and located
 * through `env.wasm.wasmPaths`. Glue and JS entry must come from the same ORT build.
 */
type OrtModule = typeof import('onnxruntime-web/wasm');

export interface Backend {
  info: Pick<
    SessionInfo,
    'ortVersion' | 'crossOriginIsolated' | 'ep' | 'numThreads' | 'adapter' | 'webgpuSkipReason' | 'sessionMs'
  >;
  /** input: 1x3x640x640 float32 -> output0 [1,5,8400] as a fresh array. */
  run(input: Float32Array): Promise<Float32Array>;
}

interface GpuAdapterLike {
  info?: { vendor?: string; architecture?: string; device?: string; description?: string };
}
interface NavigatorGpu {
  gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> };
}

async function probeWebGpu(): Promise<{ ok: true; adapter: string } | { ok: false; reason: string }> {
  const gpu = (navigator as unknown as NavigatorGpu).gpu;
  if (!gpu) return { ok: false, reason: 'navigator.gpu is undefined' };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: 'requestAdapter() returned null' };
    const i = adapter.info;
    const label = i ? [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' / ') : '';
    return { ok: true, adapter: label || 'unknown adapter' };
  } catch (e) {
    return { ok: false, reason: `requestAdapter() threw: ${errMsg(e)}` };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function ortPrefix(): string {
  return new URL(`${import.meta.env.BASE_URL}ort/`, self.location.href).href;
}

async function build(
  ort: OrtModule,
  bytes: Uint8Array,
  ep: 'webgpu' | 'wasm',
  adapter: string | null,
  skip: string | null,
): Promise<Backend> {
  ort.env.wasm.wasmPaths = ortPrefix();
  const t0 = performance.now();
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: [ep],
    graphOptimizationLevel: 'all',
  });
  const sessionMs = performance.now() - t0;
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  return {
    info: {
      ortVersion: ort.env.versions.web ?? 'unknown',
      crossOriginIsolated: self.crossOriginIsolated,
      ep,
      // read AFTER create(): the wasm backend resolves/clamps the thread count during init
      numThreads: ort.env.wasm.numThreads ?? 0,
      adapter,
      webgpuSkipReason: skip,
      sessionMs,
    },
    async run(input) {
      if (input.length !== 3 * 640 * 640) {
        throw new Error(`input tensor has ${input.length} elements (byteLength ${input.byteLength}), expected ${3 * 640 * 640}`);
      }
      const feeds = { [inputName]: new ort.Tensor('float32', input, [1, 3, 640, 640]) };
      const out = await session.run(feeds);
      const t = out[outputName];
      const data = (await t.getData()) as Float32Array;
      const copy = data.slice();
      t.dispose();
      return copy;
    },
  };
}

/**
 * EP selection: 'auto' tries WebGPU first, then wasm. The two are separate ORT builds, so the EP that
 * loaded is known exactly (no silent in-session fallback).
 */
export async function createBackend(bytes: Uint8Array, choice: EpChoice): Promise<Backend> {
  let skip: string | null = null;

  if (choice !== 'wasm') {
    const probe = await probeWebGpu();
    if (probe.ok) {
      try {
        const ort = (await import('onnxruntime-web/webgpu')) as unknown as OrtModule;
        return await build(ort, bytes, 'webgpu', probe.adapter, null);
      } catch (e) {
        skip = `WebGPU session failed: ${errMsg(e)}`;
      }
    } else {
      skip = probe.reason;
    }
    if (choice === 'webgpu') throw new Error(`EP 'webgpu' requested but unavailable: ${skip}`);
  }

  const ort = await import('onnxruntime-web/wasm');
  return build(ort, bytes, 'wasm', null, skip);
}
