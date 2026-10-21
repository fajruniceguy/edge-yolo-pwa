import { DEFAULT_CONF, IOU, MAX_DET, MODEL_URL } from '../config';
import { InferenceClient } from '../inference-client';
import type { ClientSessionInfo, EpChoice } from '../inference-client';
import type { BenchEnvironment, Battery } from './env';
import { interleavedSchedule } from './schedule';
import { driftPct, pairedComparison, summarise } from './stats';
import type { Paired, Sample, StageStats } from './stats';
import type { WakeLockStatus } from './wakelock';

export interface Preset {
  id: string;
  label: string;
  ep: EpChoice;
  /** Explicit WASM thread count; null = ORT's default. */
  threads: number | null;
}

export const PRESETS: Preset[] = [
  { id: 'auto', label: 'Auto: WebGPU if available, else WASM (what the app does)', ep: 'auto', threads: null },
  { id: 'webgpu', label: 'WebGPU only', ep: 'webgpu', threads: null },
  { id: 'wasm', label: 'WASM, ORT default threads', ep: 'wasm', threads: null },
  ...[1, 2, 3, 4, 6, 8].map((n): Preset => ({ id: `wasm-t${n}`, label: `WASM, ${n} thread${n > 1 ? 's' : ''}`, ep: 'wasm', threads: n })),
];

export const THREAD_SWEEP_IDS = ['wasm-t1', 'wasm-t2', 'wasm-t3', 'wasm-t4'];

/** All sessions stay alive at once in interleaved mode (about 45 MB of model plus runtime memory each). */
export const MAX_INTERLEAVED_CONFIGS = 4;

export type RunOrder = 'sequential' | 'interleaved';

export interface ImageInfo {
  index: number;
  width: number;
  height: number;
  megapixels: number;
  bytes: number;
}

export interface ConfigResult {
  preset: { id: string; label: string; ep: EpChoice; threads: number | null };
  ok: boolean;
  error?: string;
  session?: Pick<
    ClientSessionInfo,
    'ep' | 'numThreads' | 'adapter' | 'webgpuSkipReason' | 'modelSource' | 'ortVersion' | 'crossOriginIsolated' | 'fetchMs' | 'sessionMs'
  >;
  /** The first run in a fresh worker/session. Reported separately, never mixed into the warm statistics. */
  cold?: Sample;
  warmCount?: number;
  warm?: StageStats;
  /** % change of median inference between the first and last third of the warm runs (slowing down > 0). */
  driftPct?: number | null;
  /** Detections per image on the cold pass, a sanity check that results are stable. */
  detections?: number[];
  samples?: Sample[];
}

/** Interleaved mode only: how a configuration compares with the first one, slot by slot under the same conditions. */
export interface PairedResult extends Paired {
  id: string;
  label: string;
  against: string;
}

export interface RunOutput {
  results: ConfigResult[];
  images: ImageInfo[];
  cancelled: boolean;
  paired: PairedResult[];
}

export interface RunArgs {
  files: File[];
  passes: number;
  presets: Preset[];
  order: RunOrder;
  /** Seconds to pause between configurations (sequential mode) so the phone can cool down. */
  cooldownSec: number;
  includeSamples: boolean;
  onProgress: (msg: string) => void;
  shouldCancel: () => boolean;
}

type Base = ConfigResult['preset'];
const baseOf = (p: Preset): Base => ({ id: p.id, label: p.label, ep: p.ep, threads: p.threads });
const initOptions = (p: Preset) => ({ modelUrl: MODEL_URL, ep: p.ep, useCache: true, numThreads: p.threads ?? undefined });

function buildResult(base: Base, info: ClientSessionInfo, samples: Sample[], fileCount: number, includeSamples: boolean): ConfigResult {
  const warm = samples.slice(1);
  return {
    preset: base,
    ok: samples.length > 0,
    session: {
      ep: info.ep,
      numThreads: info.numThreads,
      adapter: info.adapter,
      webgpuSkipReason: info.webgpuSkipReason,
      modelSource: info.modelSource,
      ortVersion: info.ortVersion,
      crossOriginIsolated: info.crossOriginIsolated,
      fetchMs: info.fetchMs,
      sessionMs: info.sessionMs,
    },
    cold: samples[0],
    warmCount: warm.length,
    warm: summarise(warm),
    driftPct: driftPct(warm),
    detections: samples.slice(0, fileCount).map((s) => s.dets),
    ...(includeSamples ? { samples } : {}),
  };
}

/** Runs one image through one client and returns the sample (timings measured in the worker, wall on this thread). */
async function runOne(client: InferenceClient, file: File, pass: number, image: number, seq: number, t0Run: number) {
  const started = performance.now();
  const r = await client.run(file, { smoothing: 'low', conf: DEFAULT_CONF, iou: IOU, maxDet: MAX_DET });
  const wallMs = performance.now() - started;
  const sample: Sample = {
    pass,
    image,
    decodeMs: r.timings.decodeMs,
    letterboxMs: r.timings.letterboxMs,
    inferMs: r.timings.inferMs,
    postMs: r.timings.postMs,
    totalMs: r.timings.totalMs,
    wallMs,
    dets: r.dets.length,
    seq,
    tMs: started - t0Run,
  };
  return { sample, meta: r.meta };
}

function noteImage(images: ImageInfo[], file: File, index: number, w0: number, h0: number) {
  if (!images.some((x) => x.index === index)) images.push({ index, width: w0, height: h0, megapixels: (w0 * h0) / 1e6, bytes: file.size });
}

async function pause(sec: number, label: string, args: RunArgs): Promise<boolean> {
  for (let left = sec; left > 0; left--) {
    if (args.shouldCancel()) return false;
    args.onProgress(`${label}: cooling down, ${left} s…`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  return !args.shouldCancel();
}

/** One configuration after another, each in a fresh worker. Differences between configurations are confounded by drift. */
async function runSequential(args: RunArgs): Promise<RunOutput> {
  const { files, passes, presets } = args;
  const results: ConfigResult[] = [];
  const images: ImageInfo[] = [];
  let cancelled = false;
  const t0Run = performance.now();
  let seq = 0;

  for (const [pi, preset] of presets.entries()) {
    if (args.shouldCancel()) {
      cancelled = true;
      break;
    }
    const tag = `[${pi + 1}/${presets.length}] ${preset.label}`;
    if (pi > 0 && args.cooldownSec > 0 && !(await pause(args.cooldownSec, tag, args))) {
      cancelled = true;
      break;
    }
    const client = new InferenceClient();
    try {
      args.onProgress(`${tag}: loading model and creating the session…`);
      const info = await client.init(initOptions(preset));
      const samples: Sample[] = [];
      outer: for (let pass = 1; pass <= passes; pass++) {
        for (const [ii, file] of files.entries()) {
          if (args.shouldCancel()) {
            cancelled = true;
            break outer;
          }
          args.onProgress(`${tag}: pass ${pass}/${passes}, image ${ii + 1}/${files.length}${samples.length === 0 ? ' (cold run)' : ''}`);
          const { sample, meta } = await runOne(client, file, pass, ii + 1, seq++, t0Run);
          samples.push(sample);
          noteImage(images, file, ii + 1, meta.w0, meta.h0);
        }
      }
      results.push(buildResult(baseOf(preset), info, samples, files.length, args.includeSamples));
    } catch (e) {
      results.push({ preset: baseOf(preset), ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      client.dispose();
    }
  }
  images.sort((a, b) => a.index - b.index);
  return { results, images, cancelled, paired: [] };
}

/**
 * All configurations alive at once; every (pass, image) slot runs each of them back to back, with the starting
 * configuration rotating. Heat and background load hit all configurations alike, so slot-by-slot ratios are fair.
 */
async function runInterleaved(args: RunArgs): Promise<RunOutput> {
  const { files, passes, presets } = args;
  const images: ImageInfo[] = [];
  let cancelled = false;
  const slots: { preset: Preset; client: InferenceClient; info?: ClientSessionInfo; samples: Sample[]; error?: string }[] = presets.map((preset) => ({
    preset,
    client: new InferenceClient(),
    samples: [],
  }));

  try {
    for (const [i, slot] of slots.entries()) {
      args.onProgress(`[${i + 1}/${slots.length}] ${slot.preset.label}: loading model and creating the session…`);
      try {
        slot.info = await slot.client.init(initOptions(slot.preset));
      } catch (e) {
        slot.error = e instanceof Error ? e.message : String(e);
        slot.client.dispose();
      }
    }
    const live = slots.filter((s) => !s.error);
    const steps = interleavedSchedule(live.length, passes, files.length);
    const t0Run = performance.now();
    let seq = 0;
    for (const step of steps) {
      if (args.shouldCancel()) {
        cancelled = true;
        break;
      }
      const slot = live[step.config];
      args.onProgress(`interleaved: pass ${step.pass + 1}/${passes}, image ${step.image + 1}/${files.length}, ${slot.preset.label}${slot.samples.length === 0 ? ' (cold run)' : ''}`);
      const { sample, meta } = await runOne(slot.client, files[step.image], step.pass + 1, step.image + 1, seq++, t0Run);
      slot.samples.push(sample);
      noteImage(images, files[step.image], step.image + 1, meta.w0, meta.h0);
    }
  } finally {
    for (const s of slots) if (!s.error) s.client.dispose();
  }

  const results: ConfigResult[] = slots.map((s) =>
    s.error || !s.info ? { preset: baseOf(s.preset), ok: false, error: s.error ?? 'no session' } : buildResult(baseOf(s.preset), s.info, s.samples, files.length, args.includeSamples),
  );

  const okSlots = slots.filter((s) => !s.error && s.samples.length > 1);
  const paired: PairedResult[] = [];
  if (okSlots.length >= 2) {
    const base = okSlots[0];
    for (const other of okSlots.slice(1)) {
      const p = pairedComparison(base.samples.slice(1), other.samples.slice(1));
      if (p) paired.push({ id: other.preset.id, label: other.preset.label, against: base.preset.id, ...p });
    }
  }
  images.sort((a, b) => a.index - b.index);
  return { results, images, cancelled, paired };
}

export function runConfigs(args: RunArgs): Promise<RunOutput> {
  return args.order === 'interleaved' ? runInterleaved(args) : runSequential(args);
}

export interface BenchReport {
  schema: 'compvis-bench/1';
  startedAt: string;
  finishedAt: string;
  cancelled: boolean;
  page: string;
  settings: { passes: number; imageCount: number; imgsz: 640; smoothing: 'low'; conf: 0.25; iou: number; maxDet: number; order: RunOrder; cooldownSec: number };
  images: ImageInfo[];
  environment: BenchEnvironment;
  conditions: {
    batteryStart: Battery | null;
    batteryEnd: Battery | null;
    chargingManual: 'unknown' | 'plugged' | 'unplugged';
    wakeLockHeld: boolean;
    wakeLock: WakeLockStatus;
    hiddenDuringRun: boolean;
    attested: { batterySaverOff: boolean; efficiencyModeOff: boolean; roomTemperature: boolean };
  };
  protocolCompliant: boolean;
  protocolIssues: string[];
  /** Caveats about how to read the numbers (not protocol failures). */
  notes: string[];
  /** Interleaved mode: each configuration against the first, slot by slot. */
  paired: PairedResult[];
  results: ConfigResult[];
}

/** Caveats a reader must keep in mind, derived from how the run was done. */
export function reportNotes(order: RunOrder, cooldownSec: number, okConfigs: number): string[] {
  const notes: string[] = [];
  if (okConfigs >= 2 && order === 'sequential') {
    notes.push('Configurations ran one after another: differences between them are confounded by drift and heat (see the drift column). Use interleaved mode to compare configurations.');
  }
  if (order === 'interleaved') notes.push('Interleaved: every configuration ran in the same (pass, image) slots with a rotating start, so the paired ratios compare them under the same conditions. All sessions were alive at once.');
  if (order === 'sequential' && cooldownSec > 0) notes.push(`A ${cooldownSec} s pause was taken between configurations.`);
  return notes;
}

const f = (x: number | undefined, d = 0) => (x === undefined || Number.isNaN(x) ? '-' : x.toFixed(d));
const pair = (s: { median: number; p90: number } | null | undefined) => (s ? `${f(s.median)} / ${f(s.p90)}` : '-');

/** Plain-text summary for pasting into chat or docs. Times in ms; "med / p90" = median / 90th percentile of warm runs. */
export function formatSummary(r: BenchReport): string {
  const L: string[] = [];
  const ua = r.environment.uaData as { model?: string; platformVersion?: string; platform?: string; fullVersionList?: { brand: string; version: string }[] } | null;
  const chrome = ua?.fullVersionList?.find((b) => /chrome|edge|chromium/i.test(b.brand));
  L.push(`CompVis /bench  ${r.startedAt}  (${r.protocolCompliant ? 'follows the measurement protocol' : 'NOT protocol-compliant'})`);
  L.push(`device: ${ua?.model || 'model hidden'} | ${ua?.platform ?? '?'} ${ua?.platformVersion ?? ''} | ${chrome ? `${chrome.brand} ${chrome.version}` : 'browser version hidden'} | cores ${r.environment.hardwareConcurrency} | RAM ${r.environment.deviceMemoryGB ?? '?'} GB`);
  L.push(`UA: ${r.environment.userAgent}`);
  L.push(`crossOriginIsolated=${r.environment.crossOriginIsolated} | imgsz ${r.settings.imgsz} | ${r.settings.passes} passes x ${r.settings.imageCount} image(s) | order ${r.settings.order} | conf ${r.settings.conf} iou ${r.settings.iou} max_det ${r.settings.maxDet}`);
  const b0 = r.conditions.batteryStart;
  const b1 = r.conditions.batteryEnd;
  L.push(`battery: ${b0 ? `${Math.round(b0.level * 100)}% ${b0.charging ? 'charging' : 'unplugged'}` : `n/a (manual: ${r.conditions.chargingManual})`} -> ${b1 ? `${Math.round(b1.level * 100)}% ${b1.charging ? 'charging' : 'unplugged'}` : 'n/a'} | wake lock held: ${r.conditions.wakeLockHeld}${r.conditions.wakeLock.error ? ` (${r.conditions.wakeLock.error})` : ''}${r.conditions.wakeLock.lostDuringRun ? ' (lost during run)' : ''} | page hidden: ${r.conditions.hiddenDuringRun}`);
  L.push(`images: ${r.images.map((i) => `#${i.index} ${i.width}x${i.height} (${i.megapixels.toFixed(1)} MP, ${(i.bytes / 1e6).toFixed(1)} MB)`).join('; ')}`);
  if (r.protocolIssues.length) L.push(`protocol issues: ${r.protocolIssues.join('; ')}`);
  for (const n of r.notes) L.push(`note: ${n}`);
  L.push('');
  L.push('times in ms; med / p90 over warm runs; cold = the first run of the configuration (reported separately)');
  L.push(`${'configuration'.padEnd(34)}${'EP'.padEnd(7)}${'thr'.padStart(4)}${'warm'.padStart(6)}${'cold total'.padStart(11)}${'preprocess'.padStart(14)}${'inference'.padStart(14)}${'NMS'.padStart(12)}${'total'.padStart(14)}${'wall med'.padStart(9)}${'drift%'.padStart(8)}`);
  for (const c of r.results) {
    if (!c.ok || !c.session || !c.warm) {
      L.push(`${c.preset.label.slice(0, 33).padEnd(34)}FAILED: ${c.error ?? 'no samples'}`);
      continue;
    }
    L.push(
      `${c.preset.label.slice(0, 33).padEnd(34)}${c.session.ep.padEnd(7)}${String(c.session.numThreads).padStart(4)}${String(c.warmCount).padStart(6)}${f(c.cold?.totalMs).padStart(11)}${pair(c.warm.preprocess).padStart(14)}${pair(c.warm.inference).padStart(14)}${pair(c.warm.nms).padStart(12)}${pair(c.warm.total).padStart(14)}${f(c.warm.wall?.median).padStart(9)}${(c.driftPct == null ? '-' : f(c.driftPct, 1)).padStart(8)}`,
    );
    L.push(`${''.padEnd(34)}cold: inference ${f(c.cold?.inferMs)}, preprocess ${f((c.cold?.decodeMs ?? 0) + (c.cold?.letterboxMs ?? 0))} | session create ${f(c.session.sessionMs)} | model ${c.session.modelSource} ${f(c.session.fetchMs)} ms | detections per image: ${c.detections?.join(',')}${c.session.webgpuSkipReason ? ` | WebGPU not used: ${c.session.webgpuSkipReason}` : ''}${c.session.adapter ? ` | adapter ${c.session.adapter}` : ''}`);
  }
  if (r.paired.length) {
    L.push('');
    L.push('paired inference time, same (pass, image) slots, interleaved: ratio < 1 means faster than the baseline');
    for (const p of r.paired) {
      L.push(`${p.label.slice(0, 33).padEnd(34)}vs ${p.against.padEnd(8)} n ${String(p.n).padStart(3)}  median ratio ${f(p.medianRatio, 2)}  p90 ratio ${f(p.p90Ratio, 2)}  faster in ${f(p.fasterShare * 100)}% of slots`);
    }
  }
  return L.join('\n');
}
