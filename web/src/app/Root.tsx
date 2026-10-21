import { Suspense, lazy } from 'react';
import { App } from './App';

// /bench is a developer page (no model auto-load, its own workers), loaded on demand so the app bundle stays small.
// The service worker's navigation fallback and vercel.json's rewrite both serve index.html for it.
const Bench = lazy(() => import('./bench/Bench').then((m) => ({ default: m.Bench })));

const isBench = () => location.pathname.replace(/\/+$/, '') === '/bench';

export function Root() {
  return isBench() ? (
    <Suspense fallback={null}>
      <Bench />
    </Suspense>
  ) : (
    <App />
  );
}
