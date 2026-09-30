import { computeLetterbox, INPUT_SIZE, PAD_VALUE, rgbaToChw } from '../core';
import type { LetterboxMeta } from '../core';
import type { Smoothing } from './protocol';

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

function getCtx(): OffscreenCanvasRenderingContext2D {
  if (!canvas || !ctx) {
    canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
    const c = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!c) throw new Error('OffscreenCanvas 2d context unavailable');
    ctx = c;
  }
  return ctx;
}

export interface Preprocessed {
  input: Float32Array;
  meta: LetterboxMeta;
  decodeMs: number;
  letterboxMs: number;
}

/**
 * Mirrors ultralytics LetterBox(640, auto=False): resize to (newW,newH), pad 114, RGB, /255, CHW.
 * Canvas resampling is not cv2.INTER_LINEAR; `smoothing` selects the canvas filter and the
 * resulting tensor difference is measured by /dev/parity, not assumed.
 */
export async function preprocess(image: Blob, smoothing: Smoothing): Promise<Preprocessed> {
  const t0 = performance.now();
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  const t1 = performance.now();

  const geo = computeLetterbox(bitmap.width, bitmap.height);
  const c = getCtx();
  c.fillStyle = `rgb(${PAD_VALUE},${PAD_VALUE},${PAD_VALUE})`;
  c.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = smoothing;
  c.drawImage(bitmap, 0, 0, geo.w0, geo.h0, geo.left, geo.top, geo.newW, geo.newH);
  bitmap.close();

  const input = rgbaToChw(c.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data);
  const t2 = performance.now();

  const meta: LetterboxMeta = {
    w0: geo.w0,
    h0: geo.h0,
    r: geo.r,
    left: geo.left,
    top: geo.top,
    right: geo.right,
    bottom: geo.bottom,
  };
  return { input, meta, decodeMs: t1 - t0, letterboxMs: t2 - t1 };
}
