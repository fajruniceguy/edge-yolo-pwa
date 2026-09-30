import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { computeLetterbox, greedyMatch, postprocess } from '../src/core';
import type { Detection, LetterboxMeta } from '../src/core';

const GOLDEN_DIR = path.resolve(__dirname, '..', '..', 'tools', 'fixtures', 'golden');
const STEMS = ['test_208', 'test_505', 'test_805', 'test_1577', 'test_2418'];
const ready = existsSync(path.join(GOLDEN_DIR, 'meta.json'));

const meta: Record<string, LetterboxMeta> = ready
  ? JSON.parse(readFileSync(path.join(GOLDEN_DIR, 'meta.json'), 'utf-8'))
  : {};

describe.skipIf(!ready)('core vs golden (no ORT)', () => {
  it('computeLetterbox reproduces golden meta for all 5 images', () => {
    for (const stem of STEMS) {
      const g = meta[stem];
      const c = computeLetterbox(g.w0, g.h0);
      expect({ stem, left: c.left, right: c.right, top: c.top, bottom: c.bottom }).toEqual({
        stem,
        left: g.left,
        right: g.right,
        top: g.top,
        bottom: g.bottom,
      });
      expect(Math.abs(c.r - g.r)).toBeLessThan(1e-12);
      expect(c.newW + c.left + c.right).toBe(640);
      expect(c.newH + c.top + c.bottom).toBe(640);
    }
  });

  it('postprocess(golden raw.bin) matches golden dets >= 99% on all 5 images', () => {
    for (const stem of STEMS) {
      const buf = readFileSync(path.join(GOLDEN_DIR, `${stem}.raw.bin`));
      const raw = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
      const dets = postprocess(raw, meta[stem], { conf: 0.25, iou: 0.7, maxDet: 300 });
      const py: Detection[] = JSON.parse(readFileSync(path.join(GOLDEN_DIR, `${stem}.dets.json`), 'utf-8'));
      const { matched } = greedyMatch(dets, py, 0.9);
      const pct = (100 * matched) / Math.max(1, Math.min(dets.length, py.length));
      expect(pct, `${stem}: ${matched}/${Math.min(dets.length, py.length)}`).toBeGreaterThanOrEqual(99);
    }
  });
});
