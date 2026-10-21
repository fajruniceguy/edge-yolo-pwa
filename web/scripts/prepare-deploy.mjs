// Assemble web/deploy/ for a Vercel CLI deploy (run after `vite build`; see `npm run build:deploy`).
// deploy/ = dist/ + vercel.json + the model. The model is gitignored, so a git-connected deploy would ship
// without it; a CLI deploy of this folder includes it. deploy/ is separate from dist/ on purpose: Vite empties
// dist/ on every build, which would delete the .vercel project link the CLI keeps in the deployed folder.
// Prints a size summary only; the model file is copied, never read.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(import.meta.dirname, '..');
const DIST = path.join(WEB, 'dist');
const DEPLOY = path.join(WEB, 'deploy');
const MODEL = path.resolve(WEB, '..', 'model', 'best.onnx');
const HOBBY_CLI_LIMIT = 100 * 1000 * 1000; // vercel.com/docs/limits: static file uploads via CLI, Hobby = 100 MB

function dirSize(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.vercel') continue; // CLI link metadata, not uploaded content
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('web/dist/index.html missing: run `vite build` first');
if (!existsSync(MODEL)) throw new Error('model/best.onnx not found (it is gitignored): place it there before deploying');
if (statSync(MODEL).size < 10 * 1000 * 1000) throw new Error('model/best.onnx is suspiciously small (a pointer file?)');

mkdirSync(DEPLOY, { recursive: true });
for (const name of readdirSync(DEPLOY)) {
  if (name !== '.vercel') rmSync(path.join(DEPLOY, name), { recursive: true, force: true }); // keep the project link
}
cpSync(DIST, DEPLOY, { recursive: true });
mkdirSync(path.join(DEPLOY, 'model'), { recursive: true });
copyFileSync(MODEL, path.join(DEPLOY, 'model', 'best.onnx'));
copyFileSync(path.join(WEB, 'vercel.json'), path.join(DEPLOY, 'vercel.json'));

const total = dirSize(DEPLOY);
const mb = (n) => (n / 1e6).toFixed(1);
console.log(`deploy/ ready: ${mb(total)} MB total (model ${mb(statSync(MODEL).size)} MB); Vercel Hobby CLI limit ${mb(HOBBY_CLI_LIMIT)} MB`);
if (total > HOBBY_CLI_LIMIT) throw new Error('deploy/ exceeds the Hobby CLI upload limit; the deploy will fail (host the model elsewhere or use Pro)');
console.log('next: cd deploy && npx vercel --prod   (first time: npx vercel login)');
