// Screen Wake Lock for the benchmark run. DOM-free on purpose so it can be unit-tested in Node.

export interface WakeLockStatus {
  supported: boolean;
  /** The browser granted the screen wake lock at the start of the run. */
  acquired: boolean;
  /** The lock was released by the system or browser while the run was in progress (not by us at the end). */
  lostDuringRun: boolean;
  /** Why the request failed, if it did. */
  error: string | null;
}

interface SentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
export interface WakeLockApi {
  request(type: 'screen'): Promise<SentinelLike>;
}
export interface WakeLockHandle {
  status(): WakeLockStatus;
  release(): Promise<void>;
}

/**
 * Holds a screen wake lock for the run. A "release" event only counts as lost if it arrives while the run is
 * active: our own release() at the end also fires that event and must not be read as a loss.
 */
export async function holdWakeLock(
  api: WakeLockApi | null | undefined = (globalThis as { navigator?: { wakeLock?: WakeLockApi } }).navigator?.wakeLock,
): Promise<WakeLockHandle> {
  const st: WakeLockStatus = { supported: !!api, acquired: false, lostDuringRun: false, error: null };
  let sentinel: SentinelLike | null = null;
  let releasing = false;
  if (api) {
    try {
      sentinel = await api.request('screen');
      st.acquired = true;
      sentinel.addEventListener('release', () => {
        if (!releasing) st.lostDuringRun = true;
      });
    } catch (e) {
      st.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  }
  return {
    status: () => ({ ...st }),
    async release() {
      releasing = true;
      try {
        await sentinel?.release();
      } catch {
        // already released
      }
    },
  };
}
