/**
 * Greedy class-agnostic NMS mirroring ultralytics non_max_suppression.
 * boxes is a flat N*4 xyxy array. Returns kept indices into the original arrays,
 * in descending-score order, capped at maxDet.
 */
export function nms(
  boxes: Float32Array,
  scores: Float32Array,
  iouThresh = 0.7,
  maxDet = 300,
  maxCandidates = 30000,
): number[] {
  const total = scores.length;
  let order = Array.from({ length: total }, (_, i) => i);
  order.sort((a, b) => scores[b] - scores[a]);
  if (order.length > maxCandidates) order = order.slice(0, maxCandidates);

  const m = order.length;
  const x1 = new Float32Array(m);
  const y1 = new Float32Array(m);
  const x2 = new Float32Array(m);
  const y2 = new Float32Array(m);
  const areas = new Float32Array(m);

  for (let k = 0; k < m; k++) {
    const idx = order[k];
    x1[k] = boxes[idx * 4 + 0];
    y1[k] = boxes[idx * 4 + 1];
    x2[k] = boxes[idx * 4 + 2];
    y2[k] = boxes[idx * 4 + 3];
    areas[k] = Math.max(0, x2[k] - x1[k]) * Math.max(0, y2[k] - y1[k]);
  }

  const active = new Uint8Array(m).fill(1);
  const keep: number[] = [];

  for (let i = 0; i < m; i++) {
    if (!active[i]) continue;
    keep.push(order[i]);
    if (keep.length >= maxDet) break;

    for (let j = i + 1; j < m; j++) {
      if (!active[j]) continue;
      const xx1 = Math.max(x1[i], x1[j]);
      const yy1 = Math.max(y1[i], y1[j]);
      const xx2 = Math.min(x2[i], x2[j]);
      const yy2 = Math.min(y2[i], y2[j]);
      const inter = Math.max(0, xx2 - xx1) * Math.max(0, yy2 - yy1);
      const union = areas[i] + areas[j] - inter;
      const iou = union > 0 ? inter / union : 0;
      if (iou > iouThresh) active[j] = 0;
    }
  }

  return keep;
}
