export interface Step {
  /** 0-based */
  pass: number;
  image: number;
  config: number;
}

/**
 * Order of runs for an interleaved comparison: every (pass, image) slot runs all configurations back to back,
 * and the starting configuration rotates from slot to slot so no configuration is always first or last.
 * Heat and background load then affect all configurations alike, which a sequential sweep cannot guarantee.
 */
export function interleavedSchedule(configs: number, passes: number, images: number): Step[] {
  const steps: Step[] = [];
  for (let pass = 0; pass < passes; pass++) {
    for (let image = 0; image < images; image++) {
      const slot = pass * images + image;
      for (let j = 0; j < configs; j++) steps.push({ pass, image, config: (slot + j) % configs });
    }
  }
  return steps;
}
