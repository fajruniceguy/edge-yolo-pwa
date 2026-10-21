import { describe, expect, it } from 'vitest';
import { holdWakeLock } from '../src/app/bench/wakelock';
import type { WakeLockApi } from '../src/app/bench/wakelock';

/** A fake Screen Wake Lock API whose sentinel fires 'release' on every release, like real browsers do. */
function fakeApi(opts: { reject?: Error } = {}) {
  const listeners: (() => void)[] = [];
  const sentinel = {
    addEventListener: (_: 'release', cb: () => void) => void listeners.push(cb),
    release: async () => void listeners.forEach((cb) => cb()),
  };
  const api: WakeLockApi = {
    request: async () => {
      if (opts.reject) throw opts.reject;
      return sentinel;
    },
  };
  return { api, fireExternalRelease: () => listeners.forEach((cb) => cb()) };
}

describe('holdWakeLock', () => {
  it('our own release at the end of the run is NOT a loss (the bug that failed a good run)', async () => {
    const { api } = fakeApi();
    const h = await holdWakeLock(api);
    expect(h.status()).toMatchObject({ supported: true, acquired: true, lostDuringRun: false });
    await h.release();
    expect(h.status().lostDuringRun).toBe(false);
  });

  it('a release by the system during the run IS a loss', async () => {
    const { api, fireExternalRelease } = fakeApi();
    const h = await holdWakeLock(api);
    fireExternalRelease();
    await h.release();
    expect(h.status().lostDuringRun).toBe(true);
  });

  it('a rejected request is reported with its reason; an absent API is unsupported', async () => {
    const h = await holdWakeLock(fakeApi({ reject: new DOMException('battery saver is on', 'NotAllowedError') }).api);
    expect(h.status()).toMatchObject({ supported: true, acquired: false });
    expect(h.status().error).toContain('NotAllowedError');
    const none = await holdWakeLock(null);
    expect(none.status()).toMatchObject({ supported: false, acquired: false, error: null });
  });
});
