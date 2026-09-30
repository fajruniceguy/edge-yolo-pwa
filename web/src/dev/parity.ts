// Dev-only page logic for /dev/parity. Not imported by the app entry, so it never reaches dist/.
import { InferenceClient } from '../app/inference-client';
import type { ClientSessionInfo, EpChoice, Smoothing } from '../app/inference-client';
import { greedyMatch, INPUT_SIZE, postprocess } from '../core';
import type { Detection, LetterboxMeta } from '../core';

const MODEL_URL = '/dev-assets/model/best.onnx';
const FIXTURES = '/dev-assets/fixtures';
const STEMS = ['test_208', 'test_505', 'test_805', 'test_1577', 'test_2418'];
const CONF = 0.25;
const IOU = 0.7;
const MAX_DET = 300; // parity setting (ultralytics default), not the app default
const MATCH_IOU = 0.9;
const PLANE = INPUT_SIZE * INPUT_SIZE;

interface GoldenMeta extends LetterboxMeta {
  det_count: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const epSel = $<HTMLSelectElement>('ep');
const cacheChk = $<HTMLInputElement>('cache');
const sweepChk = $<HTMLInputElement>('sweep');
const runBtn = $<HTMLButtonElement>('run');
const clearBtn = $<HTMLButtonElement>('clear');
const copyBtn = $<HTMLButtonElement>('copy');
const statusEl = $<HTMLDivElement>('status');
const bar = $<HTMLProgressElement>('bar');
const out = $<HTMLPreElement>('out');

declare global {
  interface Window {
    __parity?: { done: boolean; text: string };
  }
}

const f = (x: number, d = 1) => x.toFixed(d);
const e = (x: number) => x.toExponential(2);
const cell = (v: string | number, w: number) => String(v).padStart(w);
const left = (v: string, w: number) => v.padEnd(w);

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json() as Promise<T>;
}
async function getF32(url: string): Promise<Float32Array> {
  // Observed in headless Edge 154: a plain `*.bin` fetch is answered with a synthetic empty 204
  // (connection: close, no COOP/COEP headers, never reaches Vite); the same URL with a query string
  // returns the real bytes. The query suffix is a workaround; the size check below keeps it loud.
  const r = await fetch(`${url}?f32`);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength % 4 !== 0) {
    throw new Error(`${url}: got ${buf.byteLength} bytes (HTTP ${r.status}) - not a float32 blob`);
  }
  return new Float32Array(buf);
}

function setStatus(s: string) {
  statusEl.textContent = s;
}

function lbDiff(a: Float32Array, g: Float32Array, m: LetterboxMeta) {
  let max = 0;
  let sum = 0;
  let cSum = 0;
  let cN = 0;
  let over = 0;
  const thr = 8 / 255;
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < INPUT_SIZE; y++) {
      const inY = y >= m.top && y < INPUT_SIZE - m.bottom;
      for (let x = 0; x < INPUT_SIZE; x++) {
        const i = c * PLANE + y * INPUT_SIZE + x;
        const d = Math.abs(a[i] - g[i]);
        if (d > max) max = d;
        sum += d;
        if (d > thr) over++;
        if (inY && x >= m.left && x < INPUT_SIZE - m.right) {
          cSum += d;
          cN++;
        }
      }
    }
  }
  return { max, mean: sum / a.length, meanContent: cN ? cSum / cN : 0, pctOver: (100 * over) / a.length };
}

function rawDiff(a: Float32Array, g: Float32Array) {
  const n = 8400;
  let box = 0;
  let score = 0;
  for (let i = 0; i < 4 * n; i++) box = Math.max(box, Math.abs(a[i] - g[i]));
  for (let i = 4 * n; i < 5 * n; i++) score = Math.max(score, Math.abs(a[i] - g[i]));
  return { box, score };
}

function metaOk(m: LetterboxMeta, g: LetterboxMeta): boolean {
  return (
    m.w0 === g.w0 &&
    m.h0 === g.h0 &&
    m.left === g.left &&
    m.right === g.right &&
    m.top === g.top &&
    m.bottom === g.bottom &&
    Math.abs(m.r - g.r) < 1e-9
  );
}

function matchStats(ts: Detection[], py: Detection[]) {
  const { matched, maxScoreDiff } = greedyMatch(ts, py, MATCH_IOU);
  const denom = Math.max(1, Math.min(ts.length, py.length));
  return { pct: (100 * matched) / denom, maxScoreDiff };
}

const lines: string[] = [];

async function runParity(): Promise<string> {
  lines.length = 0;
  const log = (s = '') => lines.push(s);
  const ep = epSel.value as EpChoice;
  const smoothings: Smoothing[] = sweepChk.checked ? ['low', 'medium', 'high'] : ['low'];

  const client = new InferenceClient();
  try {
    setStatus('loading model + creating session…');
    bar.hidden = false;
    bar.value = 0;
    const info: ClientSessionInfo = await client.init(
      { modelUrl: MODEL_URL, ep, useCache: cacheChk.checked },
      (loaded, total) => {
        bar.max = total ?? (loaded || 1);
        bar.value = loaded;
        setStatus(`model bytes: ${(loaded / 1048576).toFixed(1)}${total ? ' / ' + (total / 1048576).toFixed(1) : ''} MB`);
      },
    );
    bar.hidden = true;

    log(`CompVis /dev/parity  ${new Date().toISOString()}`);
    log(`UA: ${navigator.userAgent}`);
    log(`crossOriginIsolated main=${self.crossOriginIsolated} worker=${info.crossOriginIsolated}  hardwareConcurrency=${navigator.hardwareConcurrency}`);
    log(`ORT ${info.ortVersion}  EP=${info.ep}  threads=${info.numThreads}  requested=${ep}`);
    log(`adapter: ${info.adapter ?? 'n/a'}${info.webgpuSkipReason ? `  | webgpu skipped: ${info.webgpuSkipReason}` : ''}`);
    log(
      `model: ${info.modelSource}, ${(info.modelBytes / 1048576).toFixed(2)} MB, load ${f(info.fetchMs, 0)} ms, session create ${f(info.sessionMs, 0)} ms, storage.persist=${info.persisted}`,
    );
    log(`settings: imgsz=${INPUT_SIZE} conf=${CONF} iou=${IOU} max_det=${MAX_DET} match IoU>=${MATCH_IOU}`);
    log();

    // golden data
    const goldenMeta = await getJson<Record<string, GoldenMeta>>(`${FIXTURES}/golden/meta.json`);

    // ---- [A] EP numerics: golden input.bin -> session
    log('[A] EP numerics: golden input.bin -> session vs golden raw.bin / dets.json (no canvas involved)');
    log(`${left('image', 11)}${cell('boxMaxD', 10)}${cell('scoreMaxD', 10)}${cell('py', 5)}${cell('ts', 5)}${cell('match%', 8)}${cell('maxDscore', 11)}${cell('infer ms', 10)}`);
    for (const [i, stem] of STEMS.entries()) {
      setStatus(`[A] ${stem}`);
      const input = await getF32(`${FIXTURES}/golden/${stem}.input.bin`);
      const goldenRaw = await getF32(`${FIXTURES}/golden/${stem}.raw.bin`);
      const py = await getJson<Detection[]>(`${FIXTURES}/golden/${stem}.dets.json`);
      const { raw, inferMs } = await client.infer(input);
      const rd = rawDiff(raw, goldenRaw);
      const ts = postprocess(raw, goldenMeta[stem], { conf: CONF, iou: IOU, maxDet: MAX_DET });
      const m = matchStats(ts, py);
      log(
        `${left(stem, 11)}${cell(e(rd.box), 10)}${cell(e(rd.score), 10)}${cell(py.length, 5)}${cell(ts.length, 5)}${cell(f(m.pct), 7)}%${cell(e(m.maxScoreDiff), 11)}${cell(f(inferMs), 10)}${i === 0 ? '  (cold)' : ''}`,
      );
    }
    log();

    // ---- [B] full pipeline
    log('[B] Full worker pipeline: image -> createImageBitmap -> OffscreenCanvas letterbox -> session -> decode/NMS/unmap vs golden');
    log('    lb* = letterbox tensor vs golden input.bin: max abs diff, mean abs diff over content region / whole tensor, % of values off by > 8/255');
    log(
      `${left('image', 11)}${left('smooth', 7)}${cell('py', 5)}${cell('ts', 5)}${cell('dCount%', 8)}${cell('match%', 8)}${cell('maxDscore', 11)}${cell('lbMax', 8)}${cell('lbMeanC', 9)}${cell('lbMeanAll', 10)}${cell('lb>8/255%', 10)}${cell('meta', 5)}${cell('decode', 8)}${cell('letterbx', 9)}${cell('infer', 8)}${cell('post', 7)}${cell('total', 8)}`,
    );
    const summary = new Map<Smoothing, { maxDCount: number; minMatch: number; maxLb: number }>();
    let first = true;
    for (const stem of STEMS) {
      const blob = await (await fetch(`${FIXTURES}/images/${stem}.jpg`)).blob();
      const goldenInput = await getF32(`${FIXTURES}/golden/${stem}.input.bin`);
      const py = await getJson<Detection[]>(`${FIXTURES}/golden/${stem}.dets.json`);
      const gm = goldenMeta[stem];
      for (const smoothing of smoothings) {
        setStatus(`[B] ${stem} smoothing=${smoothing}`);
        const r = await client.run(blob, { smoothing, conf: CONF, iou: IOU, maxDet: MAX_DET, returnInput: true });
        const lb = lbDiff(r.input as Float32Array, goldenInput, gm);
        const m = matchStats(r.dets, py);
        const dCount = (100 * (r.dets.length - py.length)) / Math.max(1, py.length);
        const t = r.timings;
        log(
          `${left(stem, 11)}${left(smoothing, 7)}${cell(py.length, 5)}${cell(r.dets.length, 5)}${cell(f(dCount), 8)}${cell(f(m.pct), 7)}%${cell(e(m.maxScoreDiff), 11)}${cell(f(lb.max, 3), 8)}${cell(f(lb.meanContent, 4), 9)}${cell(f(lb.mean, 4), 10)}${cell(f(lb.pctOver, 2), 10)}${cell(metaOk(r.meta, gm) ? 'ok' : 'BAD', 5)}${cell(f(t.decodeMs), 8)}${cell(f(t.letterboxMs), 9)}${cell(f(t.inferMs), 8)}${cell(f(t.postMs), 7)}${cell(f(t.totalMs), 8)}${first ? '  (cold)' : ''}`,
        );
        first = false;
        const s = summary.get(smoothing) ?? { maxDCount: 0, minMatch: 100, maxLb: 0 };
        s.maxDCount = Math.max(s.maxDCount, Math.abs(dCount));
        s.minMatch = Math.min(s.minMatch, m.pct);
        s.maxLb = Math.max(s.maxLb, lb.max);
        summary.set(smoothing, s);
      }
    }
    log();
    log('[C] Summary per canvas smoothing (all 5 images)');
    log(`${left('smooth', 8)}${cell('max|dCount|%', 14)}${cell('min match%', 12)}${cell('max lbMax', 11)}`);
    for (const [k, s] of summary) log(`${left(k, 8)}${cell(f(s.maxDCount), 14)}${cell(f(s.minMatch), 12)}${cell(f(s.maxLb, 3), 11)}`);
    log();
    log('Notes: (cold) = first run of that table, includes warm-up (shader/JIT/canvas). All times ms, EP/threads as in header.');
    return lines.join('\n');
  } finally {
    bar.hidden = true;
    client.dispose();
  }
}

async function run() {
  runBtn.disabled = true;
  copyBtn.disabled = true;
  window.__parity = { done: false, text: '' };
  out.textContent = 'running…';
  let text: string;
  try {
    text = await runParity();
    setStatus('done');
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    text = `${lines.join('\n')}\n\nERROR: ${msg}`;
    setStatus('failed');
  }
  out.textContent = text;
  window.__parity = { done: true, text };
  runBtn.disabled = false;
  copyBtn.disabled = false;
}

async function copy() {
  const text = out.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  setStatus('copied to clipboard');
}

runBtn.onclick = () => void run();
copyBtn.onclick = () => void copy();
clearBtn.onclick = async () => {
  const c = new InferenceClient();
  try {
    await c.clearModelCache();
    setStatus('model cache cleared');
  } finally {
    c.dispose();
  }
};

// ?autorun=1&ep=wasm|webgpu|auto&sweep=0&cache=0  (handy for scripted runs)
const q = new URLSearchParams(location.search);
if (q.has('ep')) epSel.value = q.get('ep') as string;
if (q.get('sweep') === '0') sweepChk.checked = false;
if (q.get('cache') === '0') cacheChk.checked = false;
if (q.get('autorun') === '1') void run();
