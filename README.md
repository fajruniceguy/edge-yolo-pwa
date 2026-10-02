# CompVis PWA

## Credits

- Model training: **Valda Veisa** ([training notebook](training/sku110k_yolov8s_train.ipynb): YOLOv8s on SKU-110K)
- PWA and in-browser inference: **Fajru Rahman**
  
A Progressive Web App that counts densely packed retail shelf products **on-device, in the browser**. Take a photo, a YOLOv8s detector runs locally through [onnxruntime-web](https://onnxruntime.ai/), and the app shows boxes and an object count. There is no inference server.

> **Status: work in progress.** The inference core, browser runtime and the capture-to-count app are built and parity-tested on desktop browsers; deployment and phone benchmarks are not done yet. See [Status](#status).

## What the model is (and is not)

- Trained by **Valda Veisa** on [SKU-110K](https://github.com/eg4000/SKU110K_CVPR19): densely packed **retail shelf products**. Available publicly at kaggle.com/code/valdaveisa15/output-warehouse
- **Single class** (`nc: 1`, name `object`). It detects "a product is here". It does **not** classify products, and it is not a warehouse or multi-class detector.
- YOLOv8s, fixed 640×640 input, FP32, exported to ONNX (opset 12) with no NMS in the graph.
- Test-set metrics from training (640, evaluated on a T4 GPU; 2,935 images, 431,419 instances): mAP50 0.928, mAP50-95 0.577, precision 0.913, recall 0.866. These are accuracy numbers, not browser latency.
- Interaction is **capture-then-process**, not live video.

The trained weights are **not included** in this repository (see [Third-party terms](#third-party-terms)).

## Status

| Phase | What | State |
|---|---|---|
| 0 | Inspect ONNX, confirm model contract | done |
| 1 | Python reference harness, golden fixtures, export and pipeline parity | done |
| 2 | TypeScript decode / NMS / unmap, parity vs Python | done |
| 3 | Browser runtime: worker, WebGPU→WASM selection, model cache, OffscreenCanvas letterbox, `/dev/parity` | done; verified on desktop WASM and WebGPU, see [`docs/benchmarks.md`](docs/benchmarks.md) |
| 4 | App UI: capture, overlay, count, timings, confidence slider | implemented and checked end to end in headless Edge (dev server and production build, desktop and phone-sized viewport); not yet tried on a phone |
| 5 | PWA: manifest, icons, offline, ORT precache, iOS hint | implemented; offline checked in headless Edge (production build); waiting for a manual Chrome DevTools offline test, see [Offline](#offline-pwa) |
| 6 | Deploy (COOP/COEP host) and real-phone benchmarks | not started |

There are **no browser latency benchmarks yet**; they will go in `docs/benchmarks.md` once measured on a real phone.

## Measured parity

Parity is checked in three isolated layers against 5 SKU-110K test images. "Matched" is a greedy one-to-one match at IoU ≥ 0.9 (`conf 0.25`, `iou 0.7`, `max_det 300`).

| Layer | Comparison | Result |
|---|---|---|
| 1. Export | `best.pt` vs `best.onnx`, same tensor, raw `[1,5,8400]` | max abs diff: boxes 6.1e-4 – 7.7e-3 px, scores 1.2e-5 – 3.5e-5 |
| 2. Python pipeline | my letterbox+decode+NMS vs ultralytics `predict` on the ONNX | 100% matched on all 5 images (119 / 173 / 251 / 120 / 131 detections) |
| 3. TypeScript | TS decode+NMS on the saved raw output vs Python detections | 100% matched on all 5 images, max score diff 0 |

Layer 3's preprocessing half (canvas letterbox vs OpenCV) is what `/dev/parity` measures in a browser. A preliminary run in **headless Edge 154 on Windows, imgsz 640** gave: canvas smoothing `low` keeps detection counts within 2.5% of Python (letterbox tensor max abs diff 0.043 on a 0–1 scale, mean about 0.002) on both the WASM and WebGPU paths, while `medium`/`high` drift up to −20% on one image. The Phase 3 gate runs (desktop Edge 154 on WASM, Chrome 154 on WebGPU) are summarised in [`docs/benchmarks.md`](docs/benchmarks.md); run `/dev/parity` to reproduce them.

**Known limit:** the model misses many small products. On `test_1577` recall is 0.58 against 0.84–0.99 on the other four images. Details and per-image tables are in [`tools/fixtures/README.md`](tools/fixtures/README.md). Parity with the Python pipeline says nothing about accuracy against ground truth.

## Quick start (web)

Requires Node ≥ 20.19.

```bash
cd web
npm ci
npm run typecheck      # tsc -b over the app / worker / node projects
npm test               # vitest (parity tests skip if golden fixtures or the model are absent)
npm run build
npm run dev            # http://localhost:5173
```

`npm run dev` serves with COOP/COEP headers so WASM threads work (`crossOriginIsolated`). The page at `/` is the app: choose or take a photo (`<input type="file" accept="image/*" capture="environment">`), see the box overlay (boxes only, no labels), a large count, per-stage timings, and a confidence slider that re-runs decode + NMS on the cached raw output without running the model again. The UI is in Indonesian or English following `navigator.language`. In dev the model is served from `../model/best.onnx`; set `VITE_MODEL_URL` (see `web/.env.example`) to load it from elsewhere. Production hosting of the model is a Phase 6 decision, so a plain `npm run build` has no model URL that works yet.

### `/dev/parity` (dev server only)

With `model/best.onnx` and the golden fixtures in place (next section), open `http://localhost:5173/dev/parity`, pick an execution provider, press **Run**, then **Copy result**. It runs the 5 fixture images through the full worker pipeline and prints a plain-text report: detection count and match % vs the Python golden output, letterbox tensor diff vs `input.bin`, EP numerics (golden input tensor straight into the session), per-stage timings, EP, thread count and cross-origin-isolation state. The page and the model/fixture routes exist only under `vite serve`; none of it is in a production build.

## Offline (PWA)

After one online visit the app starts and runs with no network.

- **Service worker** (vite-plugin-pwa, Workbox): precaches the app shell, the icons and manifest, **and the onnxruntime-web glue + `.wasm` files for both builds** (WebGPU and plain WASM, because the runtime only decides at start-up). That is 23 manifest entries, 40.5 MiB uncompressed; the two `.wasm` files are 14.2 and 26.8 MB raw and Vite's gzip estimate is 3.7 and 6.7 MB, so what you download depends on whether the host compresses them.
- **The model is not in the service-worker precache.** The worker keeps `best.onnx` in its own Cache Storage entry (`compvis-model-v1`) and writes it only after a session was created from it, so a host that answers a missing file with an HTML page cannot poison the cache. The app asks the browser for persistent storage (`navigator.storage.persist()`).
- The footer shows **Offline: ready** only when both halves exist (an active service worker and the model in the cache).
- **Updates** never reload the page by themselves: a new version waits and a banner offers "Reload".
- **iOS** has no install prompt, so on iPhone/iPad Safari or Chrome (when not already installed) a dismissible hint explains Share, then "Add to Home Screen".
- The service worker only exists in production builds, not under `npm run dev`.

### Repeat the offline test in Chrome

```bash
cd web
npm run build
mkdir dist/model && cp ../model/best.onnx dist/model/    # dist/ is gitignored; a rebuild wipes it, so copy again
npm run preview                                          # http://localhost:4173
```

1. Open `http://localhost:4173` in a fresh profile or Incognito window. Wait until the footer shows both the engine line ("Engine: … model from network") and **"Offline: ready to work without internet."**
2. DevTools (F12) → **Application → Service Workers**: status should be "activated and is running". Under **Cache Storage** you should see `workbox-precache-v2-…` (shell + `ort/*.wasm`) and `compvis-model-v1` with 1 entry.
3. In **Application → Service Workers**, tick **Offline**, then reload (Ctrl+R). The page must load, the footer must say "model from cache", and taking or choosing a photo must give a count and boxes.
4. For a stricter check, stop `npm run preview` (Ctrl+C) with Offline unticked and reload: it must still work, because the service worker answers everything.
5. Untick **Offline** when done. To start over: Application → Storage → "Clear site data".

## Fixtures and the Python reference harness

The reference harness needs three things that are **not in the repo**:

1. `model/best.onnx` (and `best.pt` for layer 1): your own copy of the trained model.
2. The 5 SKU-110K test images `test_208`, `test_505`, `test_805`, `test_1577`, `test_2418` (`.jpg`) in `tools/fixtures/images/`. Get them from the [SKU-110K dataset](https://github.com/eg4000/SKU110K_CVPR19) (also see the [Ultralytics docs](https://docs.ultralytics.com/datasets/detect/sku-110k/)) and verify them against the MD5 table in [`tools/fixtures/README.md`](tools/fixtures/README.md).
3. `tools/fixtures/ground_truth.csv` (columns `image,x1,y1,x2,y2,class,image_width,image_height`), the test-split annotations for those 5 images.

Then, from the repo root:

```bash
python -m venv tools/.venv
source tools/.venv/bin/activate          # Windows: tools\.venv\Scripts\activate
pip install -r tools/requirements.txt

python tools/inspect_onnx.py             # model contract summary
python tools/reference.py                # writes tools/fixtures/golden/ (gitignored)
python tools/compare.py                  # parity layers 1 and 2 + detections vs ground truth
python tools/eval_gt.py                  # TP/FP/FN vs ground truth at IoU 0.5
```

## How it works

- **Preprocessing** mirrors ultralytics `LetterBox` (fixed 640, `auto=False`): resize keeping aspect, pad with 114, RGB, `/255`, HWC→CHW. EXIF orientation is respected via `createImageBitmap(blob, { imageOrientation: 'from-image' })`. In the browser the resize is an `OffscreenCanvas` draw inside the worker; canvas resampling is not `cv2.INTER_LINEAR`, so the tensor difference is measured, not assumed.
- **Postprocessing** mirrors ultralytics `non_max_suppression`: keep `score > conf`, xywh→xyxy, sort, cap at 30,000 candidates, greedy class-agnostic NMS, unmap to original pixels and clip. `max_det` is 300 for parity tests; the app uses 1000 because dense shelves exceed 300.
- **Runtime**: a module Web Worker loads the model (byte-progress fetch → Cache Storage), then tries the `onnxruntime-web/webgpu` build and falls back to `onnxruntime-web/wasm`. The two are separate ORT builds, so which EP loaded is known exactly and is logged together with `crossOriginIsolated` and the thread count. ORT's Emscripten glue and `.wasm` files are not bundled; they are served untouched from `/ort/`.
- **Type safety**: `tsconfig.app.json` and `tsconfig.worker.json` do not include Node types; only `tsconfig.node.json` (tests and config) does.

## Repository layout

```
model/                  gitignored; best.onnx, best.pt, data.yaml (not distributed)
training/               Valda Veisa's YOLOv8s training notebook (SKU-110K; outputs included)
tools/                  Python reference harness and fixtures docs
  fixtures/golden/      generated by reference.py (gitignored)
web/                    Vite + React + TypeScript
  src/core/             pure TS: letterbox, decode, NMS, unmap, postprocess, match (no DOM)
  src/worker/           inference Web Worker: ORT session, model cache, letterbox
  src/app/              the UI (React), PWA registration/update/iOS hint, main-thread client for the worker
  src/dev/, dev/        /dev/parity page (dev server only)
  devtools/             Vite plugins: COOP/COEP, ORT file serving, dev-only fixtures
  tests/                vitest parity tests (Node + onnxruntime-node)
CLAUDE.md               project rules and phase plan
```

## Third-party terms

The Apache-2.0 license covers this repository's source code only (see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE)). It does not grant rights to:

- **SKU-110K**: the dataset is provided for academic and non-commercial use. Its images and annotations are not redistributed here; obtain them from the authors. Goldman et al., *Precise Detection in Densely Packed Scenes*, CVPR 2019.
- **The trained model**: not distributed. It derives from Ultralytics YOLOv8, which is licensed under AGPL-3.0 (or an Ultralytics enterprise license); check those terms before distributing the weights or a service built on them.
- **onnxruntime-web / onnxruntime-node**: MIT, used as dependencies.
