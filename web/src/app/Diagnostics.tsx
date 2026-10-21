import { useState } from 'react';
import { copyText } from './clipboard';
import { buildDiagnostics } from './buildDiagnostics';
import type { StageTimings } from './inference-client';
import { overrides, useModelState } from './model';
import { usePwaState } from './pwa';
import { t } from './strings';

/** Copies a diagnostics blob (see diagnostics.ts) so a tester can paste it when something goes wrong. */
export function DiagnosticsButton({ error, timings }: { error: { text: string; detail: string } | null; timings: StageTimings | null }) {
  const model = useModelState();
  const pwa = usePwaState();
  const [copied, setCopied] = useState(false);

  async function onClick() {
    const text = await buildDiagnostics({ model, overrides, error, lastTimings: timings, swActive: pwa.swActive });
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
  }

  return (
    <span className="diag">
      <button type="button" className="btn btn-small" onClick={() => void onClick()} data-testid="diag-copy">
        {t.copyDiagnostics}
      </button>
      {copied && (
        <span className="muted" role="status" data-testid="diag-copied">
          {' '}
          {t.diagnosticsCopied}
        </span>
      )}
    </span>
  );
}
