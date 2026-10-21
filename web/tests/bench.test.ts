import { describe, expect, it } from 'vitest';
import { MIN_WARM_PASSES, protocolIssues } from '../src/app/bench/protocol';
import { driftPct, percentile, stat, summarise } from '../src/app/bench/stats';
import type { Sample } from '../src/app/bench/stats';

const sample = (over: Partial<Sample> = {}): Sample => ({
  pass: 1,
  image: 1,
  decodeMs: 10,
  letterboxMs: 5,
  inferMs: 100,
  postMs: 2,
  totalMs: 117,
  wallMs: 120,
  dets: 3,
  ...over,
});

describe('stats', () => {
  it('percentile interpolates linearly like numpy (R-7)', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(s, 0.5)).toBeCloseTo(5.5, 10);
    expect(percentile(s, 0.9)).toBeCloseTo(9.1, 10);
    expect(percentile(s, 0)).toBe(1);
    expect(percentile(s, 1)).toBe(10);
    expect(percentile([7], 0.9)).toBe(7);
  });

  it('stat sorts a copy and reports n/median/p90/min/max; empty is null', () => {
    const input = [4, 1, 3, 2];
    expect(stat(input)).toEqual({ n: 4, median: 2.5, p90: 3.7, min: 1, max: 4 });
    expect(input).toEqual([4, 1, 3, 2]);
    expect(stat([])).toBeNull();
  });

  it('summarise names stages as in the protocol: preprocess = decode + letterbox, nms = post', () => {
    const s = summarise([sample(), sample({ decodeMs: 20, letterboxMs: 10, inferMs: 200, postMs: 4, totalMs: 234, wallMs: 240 })]);
    expect(s.preprocess?.median).toBe((15 + 30) / 2);
    expect(s.inference?.median).toBe(150);
    expect(s.nms?.median).toBe(3);
    expect(s.total?.median).toBe((117 + 234) / 2);
    expect(s.wall?.max).toBe(240);
  });

  it('driftPct compares the median inference of the first and last third, in run order', () => {
    const flat = Array.from({ length: 9 }, () => sample({ inferMs: 100 }));
    expect(driftPct(flat)).toBe(0);
    const slowing = [100, 100, 100, 110, 110, 110, 130, 130, 130].map((inferMs) => sample({ inferMs }));
    expect(driftPct(slowing)).toBeCloseTo(30, 10);
    expect(driftPct(flat.slice(0, 5))).toBeNull(); // too few samples
  });
});

describe('protocolIssues', () => {
  const ok = {
    passes: MIN_WARM_PASSES,
    imageCount: 3,
    attested: { batterySaverOff: true, efficiencyModeOff: true, roomTemperature: true },
    chargingKnown: true,
    wakeLockHeld: true,
    hiddenDuringRun: false,
    cancelled: false,
    anyConfigOk: true,
  };

  it('is empty when every condition holds', () => {
    expect(protocolIssues(ok)).toEqual([]);
  });

  it('flags each broken condition separately', () => {
    expect(protocolIssues({ ...ok, passes: 9 })).toHaveLength(1);
    expect(protocolIssues({ ...ok, attested: { ...ok.attested, roomTemperature: false } })).toHaveLength(1);
    expect(protocolIssues({ ...ok, chargingKnown: false })).toHaveLength(1);
    expect(protocolIssues({ ...ok, wakeLockHeld: false })).toHaveLength(1);
    expect(protocolIssues({ ...ok, hiddenDuringRun: true })).toHaveLength(1);
    expect(protocolIssues({ ...ok, cancelled: true })).toHaveLength(1);
    expect(protocolIssues({ ...ok, imageCount: 0 })).toHaveLength(1);
    expect(protocolIssues({ ...ok, anyConfigOk: false })).toHaveLength(1);
  });
});
