import { decode } from './decode';
import { nms } from './nms';
import type { Detection, LetterboxMeta } from './types';
import { unmap } from './unmap';

export interface PostprocessOptions {
  conf: number;
  iou: number;
  maxDet: number;
}

/** raw output0 [1,5,8400] -> detections in original-image pixels. */
export function postprocess(raw: Float32Array, meta: LetterboxMeta, opts: PostprocessOptions): Detection[] {
  const { boxes, scores } = decode(raw, opts.conf);
  const keep = nms(boxes, scores, opts.iou, opts.maxDet);
  const un = unmap(boxes, keep, meta);
  return keep.map((idx, k) => ({
    x1: un[k * 4],
    y1: un[k * 4 + 1],
    x2: un[k * 4 + 2],
    y2: un[k * 4 + 3],
    score: scores[idx],
  }));
}
