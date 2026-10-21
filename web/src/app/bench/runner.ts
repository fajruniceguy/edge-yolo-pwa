import { DEFAULT_CONF, IOU, MAX_DET, MODEL_URL } from '../config';
import { InferenceClient } from '../inference-client';
import type { ClientSessionInfo, EpChoice } from '../inference-client';
import type { BenchEnvironment, Battery } from './env';
import type { WakeLockStatus } from './wakelock';
import { driftPct, summarise } from './stats';
import type { Sample, StageStats } from './stats';

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

export interface RunOutput {
  results: ConfigResult[];
  images: ImageInfo[];
  cancelled: boolean;
}

export interface RunArgs {
  files: File[];
  passes: number;
  presets: Preset[];
  includeSamples: boolean;
  onProgress: (msg: string) => void;
  shouldCancel: () => boolean;
}

/**
 * Runs every selected configuration in its own fresh worker (ORT reads the thread count once, at start-up).
 * Per configuration: one cold run, then `passes` passes over all images; the very first run is the cold one.
 */
export async function runConfigs(args: RunArgs): Promise<RunOutput> {
  const { files, passes, presets } = args;
  const results: ConfigResult[] = [];
  const images: ImageInfo[] = [];
  let cancelled = false;

  for (const [pi, preset] of presets.entries()) {
    if (args.shouldCancel()) {
      cancelled = true;
      break;
    }
    const tag = `[${pi + 1}/${presets.length}] ${preset.label}`;
    const base = { id: preset.id, label: preset.label, ep: preset.ep, threads: preset.threads };
    const client = new InferenceClient();
    try {
      args.onProgress(`${tag}: loading model and creating the session…`);
      const info = await client.init({ modelUrl: MODEL_URL, ep: preset.ep, useCache: true, numThreads: preset.threads ?? undefined });
      const samples: Sample[] = [];
      outer: for (let pass = 1; pass <= passes; pass++) {
        for (const [ii, file] of files.entries()) {
          if (args.shouldCancel()) {
            cancelled = true;
            break outer;
          }
          args.onProgress(`${tag}: pass ${pass}/${passes}, image ${ii + 1}/${files.length}${samples.length === 0 ? ' (cold run)' : ''}`);
          const t0 = performance.now();
          const r = await client.run(file, { smoothing: 'low', conf: DEFAULT_CONF, iou: IOU, maxDet: MAX_DET });
          const wallMs = performance.now() - t0;
          samples.push({
            pass,
            image: ii + 1,
            decodeMs: r.timings.decodeMs,
            letterboxMs: r.timings.letterboxMs,
            inferMs: r.timings.inferMs,
            postMs: r.timings.postMs,
            totalMs: r.timings.totalMs,
            wallMs,
            dets: r.dets.length,
          });
          if (images.length < files.length && !images.some((x) => x.index === ii + 1)) {
            images.push({ index: ii + 1, width: r.meta.w0, height: r.meta.h0, megapixels: (r.meta.w0 * r.meta.h0) / 1e6, bytes: file.size });
          }
        }
      }
      const warm = samples.slice(1);
      results.push({
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
        detections: samples.slice(0, files.length).map((s) => s.dets),
        ...(args.includeSamples ? { samples } : {}),
      });
    } catch (e) {
      results.push({ preset: base, ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      client.dispose();
    }
  }
  images.sort((a, b) => a.index - b.index);
  return { results, images, cancelled };
}

export interface BenchReport {
  schema: 'compvis-bench/1';
  startedAt: string;
  finishedAt: string;
  cancelled: boolean;
  page: string;
  settings: { passes: number; imageCount: number; imgsz: 640; smoothing: 'low'; conf: 0.25; iou: number; maxDet: number };
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
  results: ConfigResult[];
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
  L.push(`crossOriginIsolated=${r.environment.crossOriginIsolated} | imgsz ${r.settings.imgsz} | ${r.settings.passes} passes x ${r.settings.imageCount} image(s) | conf ${r.settings.conf} iou ${r.settings.iou} max_det ${r.settings.maxDet}`);
  const b0 = r.conditions.batteryStart;
  const b1 = r.conditions.batteryEnd;
  L.push(`battery: ${b0 ? `${Math.round(b0.level * 100)}% ${b0.charging ? 'charging' : 'unplugged'}` : `n/a (manual: ${r.conditions.chargingManual})`} -> ${b1 ? `${Math.round(b1.level * 100)}% ${b1.charging ? 'charging' : 'unplugged'}` : 'n/a'} | wake lock held: ${r.conditions.wakeLockHeld}${r.conditions.wakeLock.error ? ` (${r.conditions.wakeLock.error})` : ''}${r.conditions.wakeLock.lostDuringRun ? ' (lost during run)' : ''} | page hidden: ${r.conditions.hiddenDuringRun}`);
  L.push(`images: ${r.images.map((i) => `#${i.index} ${i.width}x${i.height} (${i.megapixels.toFixed(1)} MP, ${(i.bytes / 1e6).toFixed(1)} MB)`).join('; ')}`);
  if (r.protocolIssues.length) L.push(`protocol issues: ${r.protocolIssues.join('; ')}`);
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
  return L.join('\n');
}
