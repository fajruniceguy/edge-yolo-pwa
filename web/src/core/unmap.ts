import type { LetterboxMeta } from './types';

/** Maps kept 640-space boxes back to original image pixel space, clipped to bounds. */
export function unmap(boxes: Float32Array, keepIdx: number[], meta: LetterboxMeta): Float32Array {
  const { r, left, top, w0, h0 } = meta;
  const out = new Float32Array(keepIdx.length * 4);

  keepIdx.forEach((idx, k) => {
    const x1 = clamp((boxes[idx * 4 + 0] - left) / r, 0, w0);
    const y1 = clamp((boxes[idx * 4 + 1] - top) / r, 0, h0);
    const x2 = clamp((boxes[idx * 4 + 2] - left) / r, 0, w0);
    const y2 = clamp((boxes[idx * 4 + 3] - top) / r, 0, h0);

    out[k * 4 + 0] = x1;
    out[k * 4 + 1] = y1;
    out[k * 4 + 2] = x2;
    out[k * 4 + 3] = y2;
  });

  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
