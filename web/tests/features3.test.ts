import { describe, expect, it } from 'vitest';
import { parseOverrides } from '../src/app/overrides';
import { interleavedSchedule } from '../src/app/bench/schedule';
import { pairedComparison } from '../src/app/bench/stats';
import type { Sample } from '../src/app/bench/stats';

const s = (pass: number, image: number, inferMs: number): Sample => ({
  pass, image, decodeMs: 1, letterboxMs: 1, inferMs, postMs: 1, totalMs: inferMs + 3, wallMs: inferMs + 3, dets: 1,
});

describe('parseOverrides', () => {
  it('defaults to auto with nothing forced', () => {
    expect(parseOverrides('')).toEqual({ ep: 'auto', numThreads: undefined, forced: false });
  });
  it('reads ep and threads', () => {
    expect(parseOverrides('?ep=wasm&threads=2')).toEqual({ ep: 'wasm', numThreads: 2, forced: true });
    expect(parseOverrides('?ep=webgpu')).toEqual({ ep: 'webgpu', numThreads: undefined, forced: true });
    expect(parseOverrides('?threads=4').forced).toBe(true);
  });
  it('ignores invalid values instead of guessing', () => {
    expect(parseOverrides('?ep=gpu&threads=0')).toEqual({ ep: 'auto', numThreads: undefined, forced: false });
    expect(parseOverrides('?threads=2.5&ep=')).toEqual({ ep: 'auto', numThreads: undefined, forced: false });
    expect(parseOverrides('?threads=99').numThreads).toBeUndefined();
    expect(parseOverrides('?threads=abc').numThreads).toBeUndefined();
  });
});

describe('interleavedSchedule', () => {
  it('runs every configuration exactly passes x images times', () => {
    const steps = interleavedSchedule(3, 4, 2);
    expect(steps).toHaveLength(3 * 4 * 2);
    for (let c = 0; c < 3; c++) expect(steps.filter((x) => x.config === c)).toHaveLength(8);
  });
  it('keeps each (pass, image) slot together and rotates which configuration goes first', () => {
    const steps = interleavedSchedule(3, 2, 2);
    const firsts = [];
    for (let slot = 0; slot < 4; slot++) {
      const group = steps.slice(slot * 3, slot * 3 + 3);
      expect(new Set(group.map((g) => `${g.pass}:${g.image}`)).size).toBe(1);
      expect(group.map((g) => g.config).sort()).toEqual([0, 1, 2]);
      firsts.push(group[0].config);
    }
    expect(firsts).toEqual([0, 1, 2, 0]);
  });
  it('degenerates to the plain order for one configuration', () => {
    expect(interleavedSchedule(1, 2, 2).every((x) => x.config === 0)).toBe(true);
  });
});

describe('pairedComparison', () => {
  it('compares the same (pass, image) slots and reports ratio and win share', () => {
    const base = [s(1, 1, 100), s(1, 2, 200), s(2, 1, 100), s(2, 2, 400)];
    const other = [s(1, 1, 50), s(1, 2, 100), s(2, 1, 100), s(2, 2, 800)];
    const p = pairedComparison(base, other);
    expect(p?.n).toBe(4);
    expect(p?.medianRatio).toBeCloseTo((0.5 + 1) / 2, 10); // ratios 0.5, 0.5, 1, 2 -> median 0.75
    expect(p?.fasterShare).toBe(0.5);
  });
  it('uses only slots both configurations have, and is null with none', () => {
    expect(pairedComparison([s(1, 1, 100)], [s(2, 2, 100)])).toBeNull();
    expect(pairedComparison([s(1, 1, 100), s(1, 2, 100)], [s(1, 2, 50)])?.n).toBe(1);
  });
});
