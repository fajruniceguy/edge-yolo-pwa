import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import { describe, expect, it } from 'vitest';

import { decode } from '../src/core/decode';
import { nms } from '../src/core/nms';
import type { Detection, LetterboxMeta } from '../src/core/types';
import { unmap } from '../src/core/unmap';
import { greedyMatch } from './match';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GOLDEN_DIR = path.join(REPO_ROOT, 'tools', 'fixtures', 'golden');
const MODEL_PATH = path.join(REPO_ROOT, 'model', 'best.onnx');

const CONF = 0.25;
const IOU = 0.7;
const MAX_DET = 300;
const MATCH_IOU = 0.9;
const MATCH_GATE_PCT = 99;

const STEMS = ['test_208', 'test_505', 'test_805', 'test_1577', 'test_2418'];

const goldenReady = existsSync(path.join(GOLDEN_DIR, 'meta.json'));

function readFloat32(filePath: string): Float32Array {
  const buf = readFileSync(filePath);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

describe('Layer 3 parity (decode/NMS)', () => {
  it.skipIf(!goldenReady)(
    goldenReady
      ? 'TS dets match Python dets >= 99% on every image; report densest-image NMS time'
      : 'SKIPPED: golden fixtures missing — run tools/reference.py first',
    async () => {
      const meta: Record<string, LetterboxMeta> = JSON.parse(
        readFileSync(path.join(GOLDEN_DIR, 'meta.json'), 'utf-8'),
      );

      const session = await ort.InferenceSession.create(MODEL_PATH);
      const inputName = session.inputNames[0];
      const outputName = session.outputNames[0];

      let densestStem = '';
      let densestCandidates = -1;
      let densestBoxes: Float32Array = new Float32Array();
      let densestScores: Float32Array = new Float32Array();

      console.log(`${'image'.padEnd(14)}${'rawDiff'.padStart(10)}${'ts'.padStart(6)}${'py'.padStart(6)}${'match%'.padStart(8)}${'scoreDiff'.padStart(11)}`);

      for (const stem of STEMS) {
        const inputTensorData = readFloat32(path.join(GOLDEN_DIR, `${stem}.input.bin`));
        const goldenRaw = readFloat32(path.join(GOLDEN_DIR, `${stem}.raw.bin`));

        const results = await session.run({
          [inputName]: new ort.Tensor('float32', inputTensorData, [1, 3, 640, 640]),
        });
        const nodeRaw = results[outputName].data as Float32Array;

        let rawDiff = 0;
        for (let i = 0; i < nodeRaw.length; i++) {
          rawDiff = Math.max(rawDiff, Math.abs(nodeRaw[i] - goldenRaw[i]));
        }

        const { boxes, scores } = decode(nodeRaw, CONF);
        if (scores.length > densestCandidates) {
          densestCandidates = scores.length;
          densestStem = stem;
          densestBoxes = boxes;
          densestScores = scores;
        }

        const keepIdx = nms(boxes, scores, IOU, MAX_DET);
        const unmapped = unmap(boxes, keepIdx, meta[stem]);

        const tsDets: Detection[] = keepIdx.map((idx, k) => ({
          x1: unmapped[k * 4 + 0],
          y1: unmapped[k * 4 + 1],
          x2: unmapped[k * 4 + 2],
          y2: unmapped[k * 4 + 3],
          score: scores[idx],
        }));

        const pyDets: Detection[] = JSON.parse(
          readFileSync(path.join(GOLDEN_DIR, `${stem}.dets.json`), 'utf-8'),
        );

        const { matched, maxScoreDiff } = greedyMatch(tsDets, pyDets, MATCH_IOU);
        const denom = Math.max(1, Math.min(tsDets.length, pyDets.length));
        const matchPct = (100 * matched) / denom;

        console.log(
          `${stem.padEnd(14)}${rawDiff.toExponential(2).padStart(10)}${String(tsDets.length).padStart(6)}${String(pyDets.length).padStart(6)}${matchPct.toFixed(1).padStart(7)}%${maxScoreDiff.toExponential(2).padStart(11)}`,
        );

        expect(
          matchPct,
          `${stem}: only ${matched}/${denom} matched at IoU>=${MATCH_IOU} (ts=${tsDets.length}, py=${pyDets.length})`,
        ).toBeGreaterThanOrEqual(MATCH_GATE_PCT);
      }

      const t0 = performance.now();
      nms(densestBoxes, densestScores, IOU, MAX_DET);
      const nmsMs = performance.now() - t0;
      console.log(`\nNMS time on densest image (${densestStem}, ${densestCandidates} candidates): ${nmsMs.toFixed(2)} ms`);
    },
  );
});
