import type { LetterboxMeta } from './types';

export const INPUT_SIZE = 640;
export const PAD_VALUE = 114;

/** Python's round(): half to even. Mirrors ultralytics/cv2 pipeline exactly, including exact .5 ties. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

export interface LetterboxGeometry extends LetterboxMeta {
  newW: number;
  newH: number;
}

/** Geometry of ultralytics LetterBox (fixed 640, auto=False). Pure math, no pixels. */
export function computeLetterbox(w0: number, h0: number): LetterboxGeometry {
  const r = Math.min(INPUT_SIZE / h0, INPUT_SIZE / w0);
  const newW = pyRound(w0 * r);
  const newH = pyRound(h0 * r);
  const dw = (INPUT_SIZE - newW) / 2;
  const dh = (INPUT_SIZE - newH) / 2;
  return {
    w0,
    h0,
    r,
    newW,
    newH,
    left: pyRound(dw - 0.1),
    right: pyRound(dw + 0.1),
    top: pyRound(dh - 0.1),
    bottom: pyRound(dh + 0.1),
  };
}

/** RGBA (HWC, 0-255) -> RGB planar CHW float32, /255. */
export function rgbaToChw(rgba: Uint8ClampedArray, size = INPUT_SIZE): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    out[i] = rgba[p] / 255;
    out[plane + i] = rgba[p + 1] / 255;
    out[2 * plane + i] = rgba[p + 2] / 255;
  }
  return out;
}
