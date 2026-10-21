// Phase 6 measurement protocol (docs/benchmarks.md, "Measurement conditions"), as checkable rules.
export const MIN_WARM_PASSES = 10;

export interface Attested {
  batterySaverOff: boolean;
  efficiencyModeOff: boolean;
  roomTemperature: boolean;
}

export interface ProtocolInput {
  passes: number;
  imageCount: number;
  attested: Attested;
  /** Charging state is known: from the Battery API or chosen by hand. */
  chargingKnown: boolean;
  wakeLockHeld: boolean;
  hiddenDuringRun: boolean;
  cancelled: boolean;
  /** At least one configuration produced results. */
  anyConfigOk: boolean;
}

/** Returns the list of reasons a run does not follow the protocol (empty = compliant). */
export function protocolIssues(i: ProtocolInput): string[] {
  const issues: string[] = [];
  if (i.passes < MIN_WARM_PASSES) issues.push(`fewer than ${MIN_WARM_PASSES} passes (${i.passes})`);
  if (i.imageCount < 1) issues.push('no images');
  if (!i.attested.batterySaverOff) issues.push('battery saver / power mode not confirmed off');
  if (!i.attested.efficiencyModeOff) issues.push('browser efficiency / energy saver not confirmed off');
  if (!i.attested.roomTemperature) issues.push('room temperature not confirmed');
  if (!i.chargingKnown) issues.push('charging state unknown');
  if (!i.wakeLockHeld) issues.push('screen wake lock was not held for the whole run');
  if (i.hiddenDuringRun) issues.push('the page was hidden during the run');
  if (i.cancelled) issues.push('run was cancelled');
  if (!i.anyConfigOk) issues.push('no configuration completed');
  return issues;
}
