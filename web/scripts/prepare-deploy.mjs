// Assemble web/dist for a Vercel CLI deploy (run after `vite build`; see `npm run build:deploy`).
// The model is gitignored, so a git-connected deploy would ship without it; a CLI deploy of dist/ includes it.
// Prints a size summary only; the model file is copied, never read.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(import.meta.dirname, '..');
const DIST = path.join(WEB, 'dist');
const MODEL = path.resolve(WEB, '..', 'model', 'best.onnx');
const HOBBY_CLI_LIMIT = 100 * 1000 * 1000; // vercel.com/docs/limits: static file uploads via CLI, Hobby = 100 MB

function dirSize(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('web/dist/index.html missing: run `vite build` first');
if (!existsSync(MODEL)) throw new Error('model/best.onnx not found (it is gitignored): place it there before deploying');
if (statSync(MODEL).size < 10 * 1000 * 1000) throw new Error('model/best.onnx is suspiciously small (a pointer file?)');

mkdirSync(path.join(DIST, 'model'), { recursive: true });
copyFileSync(MODEL, path.join(DIST, 'model', 'best.onnx'));
copyFileSync(path.join(WEB, 'vercel.json'), path.join(DIST, 'vercel.json'));

const total = dirSize(DIST);
const mb = (n) => (n / 1e6).toFixed(1);
console.log(`dist ready for deploy: ${mb(total)} MB total (model ${mb(statSync(MODEL).size)} MB); Vercel Hobby CLI limit ${mb(HOBBY_CLI_LIMIT)} MB`);
if (total > HOBBY_CLI_LIMIT) throw new Error('dist exceeds the Hobby CLI upload limit; deploy will fail (host the model elsewhere or use Pro)');
console.log('next: npx vercel deploy dist --prod   (first time: npx vercel login)');
