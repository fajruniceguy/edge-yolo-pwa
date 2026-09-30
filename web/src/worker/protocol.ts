import type { Detection, LetterboxMeta } from '../core/types';

export type EpChoice = 'auto' | 'webgpu' | 'wasm';
export type Smoothing = 'low' | 'medium' | 'high';

export interface InitRequest {
  type: 'init';
  id: number;
  modelUrl: string;
  ep: EpChoice;
  useCache: boolean;
}

export interface RunRequest {
  type: 'run';
  id: number;
  image: Blob;
  smoothing: Smoothing;
  conf: number;
  iou: number;
  maxDet: number;
  /** Also return the letterboxed 1x3x640x640 tensor (4.9 MB, transferred). For parity checks. */
  returnInput: boolean;
}

/** Run the session on a caller-supplied 1x3x640x640 tensor (skips decode + letterbox). */
export interface InferRequest {
  type: 'infer';
  id: number;
  input: Float32Array;
}

export interface ClearCacheRequest {
  type: 'clear-cache';
  id: number;
}

export type WorkerRequest = InitRequest | RunRequest | InferRequest | ClearCacheRequest;

export interface SessionInfo {
  ortVersion: string;
  crossOriginIsolated: boolean;
  ep: 'webgpu' | 'wasm';
  /** env.wasm.numThreads after backend init (what ORT actually settled on). */
  numThreads: number;
  adapter: string | null;
  /** Why WebGPU was not used, when ep === 'wasm' under 'auto'. */
  webgpuSkipReason: string | null;
  modelSource: 'network' | 'cache';
  modelBytes: number;
  fetchMs: number;
  sessionMs: number;
}

export interface StageTimings {
  decodeMs: number;
  letterboxMs: number;
  inferMs: number;
  postMs: number;
  totalMs: number;
}

export type WorkerResponse =
  | { type: 'progress'; id: number; loaded: number; total: number | null }
  | { type: 'ready'; id: number; info: SessionInfo }
  | {
      type: 'result';
      id: number;
      meta: LetterboxMeta;
      dets: Detection[];
      /** Raw output0 [1,5,8400], kept so decode+NMS can re-run without re-inference. */
      raw: Float32Array;
      input: Float32Array | null;
      timings: StageTimings;
    }
  | { type: 'raw'; id: number; raw: Float32Array; inferMs: number }
  | { type: 'cleared'; id: number }
  | { type: 'error'; id: number; message: string };
