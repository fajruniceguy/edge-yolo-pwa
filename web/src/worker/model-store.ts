const CACHE_NAME = 'compvis-model-v1';

export interface LoadedModel {
  bytes: Uint8Array;
  source: 'network' | 'cache';
  fetchMs: number;
  /** Store the bytes in Cache Storage. Call only after the session was created from them (no-op for a cache hit). */
  commit: () => Promise<void>;
  /** Drop this URL's cache entry (used when a cached copy fails to load). */
  evict: () => Promise<void>;
}

export type ProgressFn = (loaded: number, total: number | null) => void;

/**
 * Model bytes: Cache Storage hit, else network with byte progress.
 * Nothing is written to the cache here: a host that answers a missing file with an HTML page (SPA fallback)
 * or a truncated body must not be able to poison the cache, so the caller commits after the model loads.
 * (navigator.storage.persist() is Window-only; the client calls it.)
 */
export async function loadModel(url: string, useCache: boolean, onProgress: ProgressFn): Promise<LoadedModel> {
  const t0 = performance.now();
  const cache = await caches.open(CACHE_NAME);
  const evict = async () => {
    await cache.delete(url);
  };

  if (useCache) {
    const hit = await cache.match(url);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      onProgress(bytes.length, bytes.length);
      return { bytes, source: 'cache', fetchMs: performance.now() - t0, commit: async () => {}, evict };
    }
  }

  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`model fetch failed: HTTP ${resp.status} for ${url}`);
  const type = resp.headers.get('content-type') ?? '';
  if (type.startsWith('text/html')) {
    throw new Error(`model URL returned an HTML page, not a model (is the file hosted at ${url}?)`);
  }
  const declared = Number(resp.headers.get('content-length'));
  let total: number | null = Number.isFinite(declared) && declared > 0 ? declared : null;

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const reader = resp.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    // Content-Length is the compressed size when a CDN gzips; never report >100%.
    if (total !== null && loaded > total) total = null;
    onProgress(loaded, total);
  }

  const bytes = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }

  const commit = async () => {
    try {
      await cache.put(
        url,
        new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(loaded) } }),
      );
    } catch (e) {
      console.warn('[compvis] model not cached (quota?):', e instanceof Error ? e.message : e);
    }
  };

  return { bytes, source: 'network', fetchMs: performance.now() - t0, commit, evict };
}

export async function clearModelCache(): Promise<void> {
  await caches.delete(CACHE_NAME);
}
