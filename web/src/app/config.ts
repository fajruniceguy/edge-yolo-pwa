// App-level inference settings. Parity tests use max_det 300; the app uses 1000 because dense shelves exceed 300.
export const DEFAULT_CONF = 0.25;
export const IOU = 0.7;
export const MAX_DET = 1000;

// Decode + NMS re-runs on the cached raw output, so any threshold is free (measured <= ~12 ms in Node at 0.02).
export const CONF_MIN = 0.05;
export const CONF_MAX = 0.95;
export const CONF_STEP = 0.01;

/**
 * Where the browser fetches best.onnx. Override with VITE_MODEL_URL (Phase 6 decides the production host).
 * In dev the Vite server mounts ../model at /dev-assets/model/.
 */
export const MODEL_URL: string =
  import.meta.env.VITE_MODEL_URL || (import.meta.env.DEV ? '/dev-assets/model/best.onnx' : '/model/best.onnx');
