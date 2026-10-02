import type { Detection } from '../core/types';

const r1 = (v: number) => Math.round(v * 10) / 10;

/** All boxes as one SVG path (one rectangle per detection, original-image pixel coordinates). */
export function boxesToPath(dets: readonly Detection[]): string {
  let d = '';
  for (const b of dets) {
    const x1 = r1(b.x1);
    const y1 = r1(b.y1);
    d += `M${x1} ${y1}H${r1(b.x2)}V${r1(b.y2)}H${x1}Z`;
  }
  return d;
}
