import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { DEFAULT_CONF, IOU, MAX_DET } from '../config';
import { collectEnvironment, readBattery } from './env';
import type { Battery, BenchEnvironment } from './env';
import { MIN_WARM_PASSES, protocolIssues } from './protocol';
import { PRESETS, THREAD_SWEEP_IDS, formatSummary, runConfigs } from './runner';
import type { BenchReport } from './runner';

type RunState = 'idle' | 'running' | 'done';
type Charging = 'unknown' | 'plugged' | 'unplugged';

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** Developer tool (English only): measures per-stage latency on this device with images picked from its gallery. */
export function Bench() {
  const [env, setEnv] = useState<BenchEnvironment | null>(null);
  const [battery, setBattery] = useState<Battery | null | undefined>(undefined);
  const [files, setFiles] = useState<File[]>([]);
  const [passes, setPasses] = useState(MIN_WARM_PASSES);
  const [selected, setSelected] = useState<Record<string, boolean>>({ auto: true });
  const [attested, setAttested] = useState({ batterySaverOff: false, efficiencyModeOff: false, roomTemperature: false });
  const [chargingManual, setChargingManual] = useState<Charging>('unknown');
  const [includeSamples, setIncludeSamples] = useState(false);
  const [state, setState] = useState<RunState>('idle');
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<BenchReport | null>(null);
  const [copied, setCopied] = useState('');
  const cancelRef = useRef(false);

  useEffect(() => {
    document.title = 'Benchmark';
    void collectEnvironment().then(setEnv);
    void readBattery().then(setBattery);
  }, []);

  const chosen = PRESETS.filter((p) => selected[p.id]);
  const inferences = chosen.length * passes * files.length;
  const canRun = state !== 'running' && files.length > 0 && chosen.length > 0 && passes >= 1;
  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setReport(null);
  }

  async function run() {
    cancelRef.current = false;
    setState('running');
    setReport(null);
    setCopied('');
    const startedAt = new Date().toISOString();

    // Keep the screen on for the whole run (a protocol condition) and notice if the page is ever hidden.
    let wakeLockHeld = false;
    let hiddenDuringRun = false;
    let lock: WakeLockSentinel | null = null;
    try {
      lock = (await navigator.wakeLock?.request('screen')) ?? null;
      wakeLockHeld = lock !== null;
      lock?.addEventListener('release', () => {
        wakeLockHeld = false;
      });
    } catch {
      wakeLockHeld = false;
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenDuringRun = true;
    };
    document.addEventListener('visibilitychange', onVis);

    const batteryStart = await readBattery();
    let out;
    try {
      out = await runConfigs({
        files,
        passes,
        presets: chosen,
        includeSamples,
        onProgress: setProgress,
        shouldCancel: () => cancelRef.current,
      });
    } finally {
      document.removeEventListener('visibilitychange', onVis);
      await lock?.release().catch(() => {});
    }
    const batteryEnd = await readBattery();
    const environment = env ?? (await collectEnvironment());

    const issues = protocolIssues({
      passes,
      imageCount: files.length,
      attested,
      chargingKnown: batteryStart !== null || chargingManual !== 'unknown',
      wakeLockHeld,
      hiddenDuringRun,
      cancelled: out.cancelled,
      anyConfigOk: out.results.some((r) => r.ok),
    });
    setReport({
      schema: 'compvis-bench/1',
      startedAt,
      finishedAt: new Date().toISOString(),
      cancelled: out.cancelled,
      page: location.origin + location.pathname,
      settings: { passes, imageCount: files.length, imgsz: 640, smoothing: 'low', conf: DEFAULT_CONF as 0.25, iou: IOU, maxDet: MAX_DET },
      images: out.images,
      environment,
      conditions: { batteryStart, batteryEnd, chargingManual, wakeLockHeld, hiddenDuringRun, attested },
      protocolCompliant: issues.length === 0,
      protocolIssues: issues,
      results: out.results,
    });
    setProgress('');
    setState('done');
  }

  const summary = report ? formatSummary(report) : '';
  const json = report ? JSON.stringify(report, null, 1) : '';
  const copy = async (what: string, text: string) => {
    await copyText(text);
    setCopied(what);
  };
  const ua = env?.uaData as { model?: string; platform?: string; platformVersion?: string } | null | undefined;

  return (
    <main className="screen bench" data-state={state} data-testid="bench">
      <header>
        <h1>Benchmark</h1>
        <p className="muted">
          Times the whole pipeline on this device using photos you pick from it. Photos never leave the device.{' '}
          <a href="/">Back to the app</a>
        </p>
      </header>

      <details>
        <summary>This device</summary>
        <dl className="timings" data-testid="bench-env">
          <dt>Model</dt>
          <dd>{ua?.model || 'hidden by the browser'}</dd>
          <dt>Platform</dt>
          <dd>{ua ? `${ua.platform ?? '?'} ${ua.platformVersion ?? ''}` : '?'}</dd>
          <dt>Cores</dt>
          <dd>{env?.hardwareConcurrency ?? '?'}</dd>
          <dt>Cross-origin isolated</dt>
          <dd>{env ? String(env.crossOriginIsolated) : '?'}</dd>
          <dt>Battery</dt>
          <dd>{battery === undefined ? '…' : battery ? `${Math.round(battery.level * 100)}% ${battery.charging ? 'charging' : 'unplugged'}` : 'not exposed by this browser'}</dd>
        </dl>
      </details>

      <section className="control">
        <h2>1. Photos</h2>
        <input type="file" accept="image/*" multiple onChange={onFiles} data-testid="bench-files" />
        <p className="muted">
          {files.length ? `${files.length} photo(s) selected. Use the same photos every time you compare results.` : 'Pick one or more photos from the gallery.'}
        </p>
      </section>

      <section className="control">
        <h2>2. Configurations</h2>
        {PRESETS.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" checked={!!selected[p.id]} onChange={() => toggle(p.id)} data-testid={`cfg-${p.id}`} /> {p.label}
          </label>
        ))}
        <button
          type="button"
          className="btn btn-small"
          onClick={() => setSelected(Object.fromEntries(THREAD_SWEEP_IDS.map((id) => [id, true])))}
          data-testid="cfg-sweep"
        >
          Select WASM thread sweep (1 to 4)
        </button>
        <p className="muted">Each configuration runs in a fresh worker, because the thread count is read once at start-up.</p>
      </section>

      <section className="control">
        <h2>3. Passes</h2>
        <label htmlFor="passes">
          Passes over the photo set: <strong>{passes}</strong> (protocol needs at least {MIN_WARM_PASSES})
        </label>
        <input id="passes" type="number" min={1} max={100} value={passes} onChange={(e) => setPasses(Math.max(1, Math.floor(Number(e.target.value) || 1)))} data-testid="bench-passes" />
        <p className="muted">
          {inferences} inference(s) in total. The first run of each configuration is reported separately as the cold run.
        </p>
      </section>

      <section className="control">
        <h2>4. Conditions (you confirm these)</h2>
        <label className="check">
          <input type="checkbox" checked={attested.batterySaverOff} onChange={() => setAttested((a) => ({ ...a, batterySaverOff: !a.batterySaverOff }))} data-testid="att-saver" /> Battery saver / power mode is off
        </label>
        <label className="check">
          <input type="checkbox" checked={attested.efficiencyModeOff} onChange={() => setAttested((a) => ({ ...a, efficiencyModeOff: !a.efficiencyModeOff }))} data-testid="att-eff" /> Browser efficiency / energy saver is off
        </label>
        <label className="check">
          <input type="checkbox" checked={attested.roomTemperature} onChange={() => setAttested((a) => ({ ...a, roomTemperature: !a.roomTemperature }))} data-testid="att-temp" /> Phone is at room temperature (not warm from charging, sun or a pocket)
        </label>
        {battery === null && (
          <label>
            Charging state (the browser does not report it):{' '}
            <select value={chargingManual} onChange={(e) => setChargingManual(e.target.value as Charging)} data-testid="charging-manual">
              <option value="unknown">unknown</option>
              <option value="plugged">plugged in</option>
              <option value="unplugged">on battery</option>
            </select>
          </label>
        )}
        <p className="muted">The screen is kept awake automatically during the run; do not switch apps or tabs.</p>
        <label className="check">
          <input type="checkbox" checked={includeSamples} onChange={() => setIncludeSamples((v) => !v)} /> Include every individual run in the JSON (long)
        </label>
      </section>

      <div className="bench-actions">
        <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={!canRun} data-testid="bench-run">
          {state === 'running' ? 'Running…' : 'Run benchmark'}
        </button>
        {state === 'running' && (
          <button type="button" className="btn" onClick={() => (cancelRef.current = true)} data-testid="bench-cancel">
            Cancel
          </button>
        )}
      </div>

      {state === 'running' && (
        <p role="status" className="muted" data-testid="bench-status">
          {progress}
        </p>
      )}

      {report && (
        <section data-testid="bench-report" data-compliant={String(report.protocolCompliant)}>
          <div className={`banner${report.protocolCompliant ? '' : ' banner-warn'}`} role="status">
            <span>
              {report.protocolCompliant
                ? 'This run follows the measurement protocol.'
                : `Not protocol-compliant: ${report.protocolIssues.join('; ')}.`}
            </span>
          </div>
          <h2>Summary</h2>
          <pre className="mono bench-pre" data-testid="bench-summary">
            {summary}
          </pre>
          <div className="bench-actions">
            <button type="button" className="btn btn-primary" onClick={() => void copy('JSON', json)} data-testid="bench-copy-json">
              Copy as JSON
            </button>
            <button type="button" className="btn" onClick={() => void copy('summary', summary)} data-testid="bench-copy-summary">
              Copy summary text
            </button>
          </div>
          {copied && <p className="muted" role="status">Copied {copied} to the clipboard.</p>}
          <details>
            <summary>JSON</summary>
            <textarea readOnly className="mono bench-json" value={json} data-testid="bench-json" rows={12} />
          </details>
        </section>
      )}
    </main>
  );
}
