const NUM_ANCHORS = 8400;

export interface DecodedBoxes {
  boxes: Float32Array;
  scores: Float32Array;
}

/**
 * output0 is channel-major [5, 8400]: cx/cy/w/h/score per anchor.
 * With one class there is no objectness channel; channel 4 is the final score.
 */
export function decode(raw: Float32Array, conf = 0.25): DecodedBoxes {
  const n = NUM_ANCHORS;
  const boxesOut: number[] = [];
  const scoresOut: number[] = [];

  for (let i = 0; i < n; i++) {
    const score = raw[4 * n + i];
    if (score > conf) {
      const cx = raw[0 * n + i];
      const cy = raw[1 * n + i];
      const w = raw[2 * n + i];
      const h = raw[3 * n + i];
      boxesOut.push(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
      scoresOut.push(score);
    }
  }

  return {
    boxes: Float32Array.from(boxesOut),
    scores: Float32Array.from(scoresOut),
  };
}
