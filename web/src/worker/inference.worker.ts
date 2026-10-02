import { postprocess } from '../core';
import { clearModelCache, loadModel } from './model-store';
import { createBackend } from './ort';
import type { Backend } from './ort';
import { preprocess } from './preprocess';
import type { SessionInfo, WorkerRequest, WorkerResponse } from './protocol';

let backend: Backend | null = null;

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

async function handle(req: WorkerRequest) {
  switch (req.type) {
    case 'init': {
      backend = null;
      const model = await loadModel(req.modelUrl, req.useCache, (loaded, total) =>
        post({ type: 'progress', id: req.id, loaded, total }),
      );
      try {
        backend = await createBackend(model.bytes, req.ep);
      } catch (err) {
        if (model.source === 'cache') await model.evict(); // do not keep re-loading a cached copy that fails
        throw err;
      }
      const modelCached = await model.commit(); // cache only a model that actually produced a session
      const info: SessionInfo = {
        ...backend.info,
        modelSource: model.source,
        modelBytes: model.bytes.length,
        modelCached,
        fetchMs: model.fetchMs,
      };
      console.log(
        `[compvis] session start: crossOriginIsolated=${info.crossOriginIsolated} ep=${info.ep} threads=${info.numThreads}` +
          ` ort=${info.ortVersion} model=${info.modelSource} (${(info.modelBytes / 1048576).toFixed(2)} MB)` +
          (info.webgpuSkipReason ? ` webgpuSkipped="${info.webgpuSkipReason}"` : '') +
          (info.adapter ? ` adapter="${info.adapter}"` : ''),
      );
      post({ type: 'ready', id: req.id, info });
      return;
    }
    case 'run': {
      if (!backend) throw new Error('run before init');
      const t0 = performance.now();
      const pre = await preprocess(req.image, req.smoothing);
      const t1 = performance.now();
      const raw = await backend.run(pre.input);
      const t2 = performance.now();
      const dets = postprocess(raw, pre.meta, { conf: req.conf, iou: req.iou, maxDet: req.maxDet });
      const t3 = performance.now();
      const transfer: Transferable[] = [raw.buffer];
      if (req.returnInput) transfer.push(pre.input.buffer);
      post(
        {
          type: 'result',
          id: req.id,
          meta: pre.meta,
          dets,
          raw,
          input: req.returnInput ? pre.input : null,
          timings: {
            decodeMs: pre.decodeMs,
            letterboxMs: pre.letterboxMs,
            inferMs: t2 - t1,
            postMs: t3 - t2,
            totalMs: t3 - t0,
          },
        },
        transfer,
      );
      return;
    }
    case 'infer': {
      if (!backend) throw new Error('infer before init');
      const t0 = performance.now();
      const raw = await backend.run(req.input);
      post({ type: 'raw', id: req.id, raw, inferMs: performance.now() - t0 }, [raw.buffer]);
      return;
    }
    case 'clear-cache': {
      await clearModelCache();
      post({ type: 'cleared', id: req.id });
      return;
    }
  }
}

// Requests are processed strictly in order (init must finish before run, runs must not interleave).
let queue: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  queue = queue.then(() =>
    handle(req).catch((err: unknown) => {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      post({ type: 'error', id: req.id, message });
    }),
  );
};
