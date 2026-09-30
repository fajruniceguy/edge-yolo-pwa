import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

const WEB_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..');

// Cross-origin isolation (WASM threads need SharedArrayBuffer -> crossOriginIsolated).
export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

function setHeaders(res: ServerResponse) {
  for (const [k, v] of Object.entries(ISOLATION_HEADERS)) res.setHeader(k, v);
}

// package.json is not in ORT-web's `exports`; resolve an exported subpath and take its dist dir.
const ORT_DIST = path.dirname(createRequire(import.meta.url).resolve('onnxruntime-web/wasm'));

/**
 * ORT-web build variants we use. `entry` is the extern-wasm ESM entry (JS only, no embedded
 * Emscripten glue); `glue`/`wasm` are fetched at runtime from `ORT_PREFIX` (see src/worker/ort.ts).
 */
export const ORT_VARIANTS = {
  webgpu: {
    entry: 'ort.webgpu.min.mjs',
    files: ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'],
  },
  wasm: {
    entry: 'ort.wasm.min.mjs',
    files: ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'],
  },
} as const;

/** Absolute paths of the extern-wasm entries, for `resolve.alias`. */
export function ortAliases() {
  return {
    'onnxruntime-web/webgpu': path.join(ORT_DIST, ORT_VARIANTS.webgpu.entry),
    'onnxruntime-web/wasm': path.join(ORT_DIST, ORT_VARIANTS.wasm.entry),
  };
}

const ORT_FILES = Object.values(ORT_VARIANTS).flatMap((v) => v.files);

/** Serves the ORT Emscripten glue + wasm untouched at `${base}ort/` (dev) and emits them into dist (build). */
export function ortRuntimeFiles(): Plugin {
  let base = '/';
  return {
    name: 'compvis:ort-runtime-files',
    configResolved(cfg) {
      base = cfg.base;
    },
    configureServer(server) {
      const prefix = `${base}ort/`;
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (!pathname.startsWith(prefix)) return next();
        const name = pathname.slice(prefix.length);
        if (!ORT_FILES.includes(name as (typeof ORT_FILES)[number])) return next();
        sendFile(req, res, path.join(ORT_DIST, name));
      });
    },
    generateBundle() {
      for (const name of ORT_FILES) {
        this.emitFile({ type: 'asset', fileName: `ort/${name}`, source: readFileSync(path.join(ORT_DIST, name)) });
      }
    },
  };
}

// URL prefix -> directory on disk. Dev only; nothing here is reachable from `vite build` output.
const DEV_MOUNTS: Record<string, string> = {
  '/dev-assets/model/': path.join(REPO_ROOT, 'model'),
  '/dev-assets/fixtures/': path.join(REPO_ROOT, 'tools', 'fixtures'),
};

/**
 * Dev-only: serves ../model and ../tools/fixtures (outside the Vite root) and the /dev/parity page.
 * `apply: 'serve'` means this plugin does not exist during `vite build`.
 */
export function devFixtures(): Plugin {
  return {
    name: 'compvis:dev-fixtures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = (req.url ?? '').split('?')[0];

        // /dev/parity -> /dev/parity/index.html (Vite's SPA fallback would otherwise serve the app)
        if (raw === '/dev/parity' || raw === '/dev/parity/') {
          req.url = '/dev/parity/index.html' + (req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
          return next();
        }

        for (const [urlPrefix, dir] of Object.entries(DEV_MOUNTS)) {
          if (!raw.startsWith(urlPrefix)) continue;
          const rel = decodeURIComponent(raw.slice(urlPrefix.length));
          const abs = path.resolve(dir, rel);
          // path traversal guard: must stay inside the mounted directory
          if (abs !== dir && !abs.startsWith(dir + path.sep)) {
            res.statusCode = 403;
            return res.end('forbidden');
          }
          return sendFile(req, res, abs);
        }
        next();
      });
    },
  };
}

const MIME: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.csv': 'text/csv',
};

function sendFile(_req: IncomingMessage, res: ServerResponse, abs: string) {
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    res.statusCode = 404;
    setHeaders(res);
    return res.end('not found');
  }
  setHeaders(res);
  res.setHeader('Content-Type', MIME[path.extname(abs)] ?? 'application/octet-stream');
  res.setHeader('Content-Length', statSync(abs).size);
  res.setHeader('Cache-Control', 'no-cache');
  createReadStream(abs).pipe(res);
}
