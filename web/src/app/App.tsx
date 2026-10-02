import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { postprocess } from '../core';
import type { Detection, LetterboxMeta } from '../core';
import { CONF_MAX, CONF_MIN, CONF_STEP, DEFAULT_CONF, IOU, MAX_DET } from './config';
import { fmtMB, fmtMs } from './format';
import type { StageTimings } from './inference-client';
import { ensureModel, useModelState } from './model';
import { ResultView } from './ResultView';
import { t } from './strings';

type Phase = 'idle' | 'processing' | 'result' | 'error';

interface Analysis {
  meta: LetterboxMeta;
  /** Raw output0, kept so the slider can re-run decode + NMS without re-running the model. */
  raw: Float32Array;
  timings: StageTimings;
}

/** Boxes currently shown. rerunMs is the cost of the last slider re-run (null until the slider is moved). */
interface View {
  dets: Detection[];
  rerunMs: number | null;
}

function friendlyError(err: unknown): { text: string; detail: string } {
  const detail = err instanceof Error ? err.message : String(err);
  const unreadable = /decode|InvalidState|image/i.test(detail);
  return { text: unreadable ? t.errImage : t.errGeneric, detail };
}

export function App() {
  const model = useModelState();
  const [phase, setPhase] = useState<Phase>('idle');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [conf, setConf] = useState(DEFAULT_CONF);
  const [error, setError] = useState<{ text: string; detail: string } | null>(null);

  // Start loading the model as soon as the page opens, so it is usually ready by the time a photo is taken.
  useEffect(() => {
    ensureModel().catch(() => {}); // failure is shown from model state
  }, []);

  // Free the previous photo's object URL when it is replaced or the page unmounts.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;

    setPhotoUrl(URL.createObjectURL(file));
    setAnalysis(null);
    setView(null);
    setError(null);
    setPhase('processing');
    try {
      const client = await ensureModel();
      const r = await client.run(file, { smoothing: 'low', conf: DEFAULT_CONF, iou: IOU, maxDet: MAX_DET });
      setAnalysis({ meta: r.meta, raw: r.raw, timings: r.timings });
      setView({ dets: r.dets, rerunMs: null });
      setConf(DEFAULT_CONF);
      setPhase('result');
    } catch (err) {
      setError(friendlyError(err));
      setPhase('error');
    }
  }

  // Slider: decode + NMS on the cached raw output only (no model run). Measured <= ~12 ms in Node even at the
  // lowest threshold, so it runs synchronously in the handler.
  function onConf(e: ChangeEvent<HTMLInputElement>) {
    const c = Number(e.target.value);
    setConf(c);
    if (!analysis) return;
    const t0 = performance.now();
    const dets = postprocess(analysis.raw, analysis.meta, { conf: c, iou: IOU, maxDet: MAX_DET });
    setView({ dets, rerunMs: performance.now() - t0 });
  }

  const busy = phase === 'processing';

  return (
    <main className="screen" data-phase={phase} data-model={model.status}>
      <header>
        <h1>{t.appTitle}</h1>
        {phase === 'idle' && <p className="muted">{t.tagline}</p>}
      </header>

      <label className={`btn btn-primary${busy ? ' is-disabled' : ''}`}>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          onChange={onFile}
          disabled={busy}
          data-testid="file"
        />
        {phase === 'idle' ? t.takePhoto : t.takeAnother}
      </label>

      {model.status === 'loading' && (
        <div className="status" role="status" data-testid="model-loading">
          <progress max={model.total ?? undefined} value={model.total ? model.loaded : undefined} />
          <span>{t.modelLoading(fmtMB(model.loaded), model.total ? fmtMB(model.total) : null)}</span>
        </div>
      )}

      {model.status === 'error' && (
        <div className="notice notice-error" role="alert" data-testid="model-error">
          <p>{t.modelError}</p>
          <details>
            <summary>{t.technical}</summary>
            <p className="mono">{model.message}</p>
          </details>
          <button type="button" className="btn" onClick={() => ensureModel().catch(() => {})}>
            {t.retry}
          </button>
        </div>
      )}

      {busy && photoUrl && (
        <div className="stage preview" aria-busy="true" data-testid="processing">
          <img src={photoUrl} alt={t.photoAlt} draggable={false} />
          <div className="busy">
            <span className="spinner" aria-hidden="true" />
            <span>{t.processing}</span>
          </div>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="notice notice-error" role="alert" data-testid="error">
          <p>{error.text}</p>
          <details>
            <summary>{t.technical}</summary>
            <p className="mono">{error.detail}</p>
          </details>
        </div>
      )}

      {phase === 'result' && analysis && view && photoUrl && (
        <>
          <section className="count" aria-live="polite">
            <div className="count-number" data-testid="count">
              {view.dets.length}
            </div>
            <div className="count-label">{t.countLabel}</div>
            {view.dets.length >= MAX_DET && <p className="muted">{t.capped(MAX_DET)}</p>}
          </section>

          <ResultView url={photoUrl} width={analysis.meta.w0} height={analysis.meta.h0} dets={view.dets} />

          <section className="control">
            <label htmlFor="conf">
              {t.confidence}: <strong data-testid="conf-value">{conf.toFixed(2)}</strong>
            </label>
            <input
              id="conf"
              type="range"
              min={CONF_MIN}
              max={CONF_MAX}
              step={CONF_STEP}
              value={conf}
              onChange={onConf}
              data-testid="conf"
            />
            <p className="muted">{t.confidenceHelp}</p>
          </section>

          <p className="muted">{t.estimateNote}</p>

          <section>
            <h2>{t.timings}</h2>
            <dl className="timings" data-testid="timings">
              <dt>{t.stage.decode}</dt>
              <dd>{fmtMs(analysis.timings.decodeMs)}</dd>
              <dt>{t.stage.letterbox}</dt>
              <dd>{fmtMs(analysis.timings.letterboxMs)}</dd>
              <dt>{t.stage.inference}</dt>
              <dd data-testid="infer-ms">{fmtMs(analysis.timings.inferMs)}</dd>
              <dt>{t.stage.post}</dt>
              <dd>{fmtMs(analysis.timings.postMs)}</dd>
              <dt className="total">{t.stage.total}</dt>
              <dd className="total">{fmtMs(analysis.timings.totalMs)}</dd>
              {view.rerunMs !== null && (
                <>
                  <dt className="rerun">{t.stage.rerun}</dt>
                  <dd className="rerun" data-testid="rerun-ms">
                    {fmtMs(view.rerunMs)}
                  </dd>
                </>
              )}
            </dl>
          </section>
        </>
      )}

      {model.status === 'ready' && (
        <footer className="muted" data-testid="session">
          {t.session(
            model.info.ep === 'webgpu' ? 'WebGPU' : 'WASM',
            model.info.numThreads,
            model.info.modelSource === 'cache' ? t.sourceCache : t.sourceNetwork,
          )}
        </footer>
      )}
    </main>
  );
}
