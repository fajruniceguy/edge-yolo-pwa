export interface Stat {
  n: number;
  median: number;
  p90: number;
  min: number;
  max: number;
}

/** One pipeline run on one image, all in ms (stage times measured inside the worker, wall on the main thread). */
export interface Sample {
  pass: number;
  image: number;
  decodeMs: number;
  letterboxMs: number;
  inferMs: number;
  postMs: number;
  totalMs: number;
  /** Main-thread time around the whole call, including message passing. */
  wallMs: number;
  dets: number;
  /** Order in which samples were taken across the whole run (0-based), for checking interleaving. */
  seq?: number;
  /** Milliseconds since the start of the run when this sample began, to see drift over time. */
  tMs?: number;
}

/** Stages named as in the Phase 6 protocol: preprocess / inference / NMS / total (+ wall). */
export interface StageStats {
  preprocess: Stat | null;
  inference: Stat | null;
  nms: Stat | null;
  total: Stat | null;
  wall: Stat | null;
}

/** Percentile by linear interpolation between closest ranks (numpy's default, "R-7"). `sorted` ascending, p in [0,1]. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function stat(values: readonly number[]): Stat | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return { n: s.length, median: percentile(s, 0.5), p90: percentile(s, 0.9), min: s[0], max: s[s.length - 1] };
}

export function summarise(samples: readonly Sample[]): StageStats {
  return {
    preprocess: stat(samples.map((s) => s.decodeMs + s.letterboxMs)),
    inference: stat(samples.map((s) => s.inferMs)),
    nms: stat(samples.map((s) => s.postMs)),
    total: stat(samples.map((s) => s.totalMs)),
    wall: stat(samples.map((s) => s.wallMs)),
  };
}

/**
 * Percent change of the median inference time between the first and the last third of the samples, in run order.
 * A clearly positive value means the phone slowed down during the run (thermal throttling, power management).
 * Null when there are fewer than 6 samples.
 */
export function driftPct(samples: readonly Sample[]): number | null {
  if (samples.length < 6) return null;
  const third = Math.floor(samples.length / 3);
  const first = stat(samples.slice(0, third).map((s) => s.inferMs));
  const last = stat(samples.slice(samples.length - third).map((s) => s.inferMs));
  if (!first || !last || first.median === 0) return null;
  return (100 * (last.median - first.median)) / first.median;
}

export interface Paired {
  /** Number of (pass, image) slots where both configurations have a warm sample. */
  n: number;
  /** Median of other.inferMs / base.inferMs over those slots (below 1 = `other` is faster). */
  medianRatio: number;
  p90Ratio: number;
  /** Share of slots where `other` was faster than `base`. */
  fasterShare: number;
}

/**
 * Paired comparison of inference time for two configurations measured in the same (pass, image) slots.
 * Only meaningful when the runs were interleaved, so both saw the same drift and heat. Pass warm samples only.
 */
export function pairedComparison(base: readonly Sample[], other: readonly Sample[]): Paired | null {
  const byKey = new Map(base.map((s) => [`${s.pass}:${s.image}`, s.inferMs] as const));
  const ratios: number[] = [];
  for (const o of other) {
    const b = byKey.get(`${o.pass}:${o.image}`);
    if (b !== undefined && b > 0) ratios.push(o.inferMs / b);
  }
  if (ratios.length === 0) return null;
  const sorted = [...ratios].sort((a, b) => a - b);
  return {
    n: ratios.length,
    medianRatio: percentile(sorted, 0.5),
    p90Ratio: percentile(sorted, 0.9),
    fasterShare: ratios.filter((r) => r < 1).length / ratios.length,
  };
}
