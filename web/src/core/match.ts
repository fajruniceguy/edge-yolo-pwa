import type { Detection } from './types';

function iou(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

export interface MatchResult {
  matched: number;
  maxScoreDiff: number;
}

/** Greedy one-to-one match, walking `a` in descending-score order. */
export function greedyMatch(detsA: Detection[], detsB: Detection[], iouThresh = 0.9): MatchResult {
  const usedB = new Array(detsB.length).fill(false);
  const order = detsA.map((_, i) => i).sort((i, j) => detsA[j].score - detsA[i].score);

  let matched = 0;
  let maxScoreDiff = 0;

  for (const i of order) {
    let bestJ = -1;
    let bestIou = -1;
    for (let j = 0; j < detsB.length; j++) {
      if (usedB[j]) continue;
      const v = iou(detsA[i], detsB[j]);
      if (v > bestIou) {
        bestIou = v;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && bestIou >= iouThresh) {
      usedB[bestJ] = true;
      matched++;
      maxScoreDiff = Math.max(maxScoreDiff, Math.abs(detsA[i].score - detsB[bestJ].score));
    }
  }

  return { matched, maxScoreDiff };
}
