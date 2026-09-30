# CLAUDE.md — CompVis PWA

## What this is

A Progressive Web App that runs a YOLOv8s object detector **on-device in the browser** via onnxruntime-web. User takes a photo → model runs locally → app shows boxes and an object count. No server inference.

Model was trained by Valda Veisa on **SKU-110K**: densely packed **retail shelf products**. **Single class** (`nc: 1`, name `object`). It detects "a product is here", it does not classify products. Never describe it as warehouse detection or multi-class — both are false.

Interaction model is **capture-then-process**, not live video. Latency of 1–3 s on WASM is acceptable. Do not propose switching to YOLOv8n.

## Token and file hygiene — HARD RULES

- **Never** `cat`, `head`, `xxd`, `strings`, or Read any file under `model/` or any `*.onnx`, `*.pt`, `*.bin`. Inspect them only through scripts that print summaries.
- **Never** view images in `tools/fixtures/images/` unless I ask. You don't need to see them.
- **Scripts print summaries, never full tensors or full detection lists.** Shapes, dtypes, min/max/mean, counts, first 5 rows, max abs diff, match percentages. If a script could print more than ~50 lines, it is wrong.
- Golden fixtures are for scripts and tests to consume. Don't Read `*.dets.json` directly; write a one-liner that summarizes it.
- Test output: use reporters that show failures concisely. No dumping arrays in assertion messages — assert on summaries (count, max diff).

## Repo layout

```
model/                 # gitignored. best.onnx (42.67 MB), best.pt, data.yaml
tools/                 # Python reference harness
  fixtures/images/     # 5 raw SKU-110K test images (test_208, 505, 805, 1577, 2418)
  fixtures/ground_truth.csv
  fixtures/golden/     # generated: <name>.input.bin, <name>.raw.bin, <name>.dets.json, meta.json
web/                   # Vite + React + TypeScript
  src/core/            # pure TS: letterbox, decode, nms, unmap. No DOM.
  src/worker/          # onnxruntime-web session in a Web Worker
  src/app/             # UI
  tests/               # vitest, runs in Node with onnxruntime-node
docs/benchmarks.md     # measured numbers only
```

Python: venv in `tools/.venv`. Deps: ultralytics, onnx, onnxruntime, numpy, opencv-python-headless, pandas. Node deps beyond vite, react, typescript, vitest, onnxruntime-web, onnxruntime-node, vite-plugin-pwa: **ask first**.

## Model contract (CONFIRMED — Phase 0, `tools/inspect_onnx.py` against `model/best.onnx`)

Exported with `format="onnx", imgsz=640, simplify=True, opset=12`, all else default → static shape, FP32, no NMS in graph.

- Input `images`: float32 `[1, 3, 640, 640]`, RGB, NCHW, values 0–1
- Output `output0`: float32 `[1, 5, 8400]`, **channel-major**: for anchor i, `cx = d[0*8400+i]`, `cy = d[1*8400+i]`, `w = d[2*8400+i]`, `h = d[3*8400+i]`, `score = d[4*8400+i]`. Coordinates in 640×640 letterboxed pixel space. YOLOv8 has no objectness; with one class, channel 4 is the final score.

Inspected: opset 12, ir_version 7, file size 42.67 MB, 234 nodes / 14 distinct op types, no `NonMaxSuppression` node (confirms no NMS in graph). Input/output names, shapes, and dtypes match exactly as specified above.

## Preprocessing (must mirror ultralytics LetterBox, fixed 640, auto=False)

```
r = min(640/h0, 640/w0)
new_w, new_h = round(w0*r), round(h0*r)
dw, dh = (640-new_w)/2, (640-new_h)/2
left, right = round(dw-0.1), round(dw+0.1)
top, bottom = round(dh-0.1), round(dh+0.1)
resize bilinear to (new_w, new_h), pad with (114,114,114), BGR→RGB if needed, /255, HWC→CHW
```
Respect EXIF orientation (browser: `createImageBitmap(blob, { imageOrientation: 'from-image' })`).

## Postprocessing (mirror ultralytics non_max_suppression)

- Keep anchors with `score > conf` (strict). Defaults: `conf = 0.25`, `iou = 0.7`.
- xywh → xyxy, sort by score desc, cap at 30,000 candidates, greedy NMS (class-agnostic; one class anyway).
- `max_det = 300` **for parity tests** (matches ultralytics). **App default `max_det = 1000`** — dense shelves exceed 300.
- Unmap: `x = (x - left) / r`, `y = (y - top) / r`, clip to original image bounds.

## Parity strategy — three layers, isolate each

1. **Export parity:** same 640×640 tensor through `best.pt` (raw model forward, eval mode; output may be a tuple — take element 0) and `best.onnx`. Compare raw `[1,5,8400]`: report max abs diff on boxes and scores. Expect ~1e-3 or better.
2. **Python pipeline parity:** my Python letterbox + decode + NMS vs `YOLO("model/best.onnx").predict(conf=0.25, iou=0.7, max_det=300)`. Do NOT compare against `best.pt` predict for this — it uses rectangular (auto) letterboxing, a different input shape.
3. **TS parity:** TS decode + NMS fed the saved `.raw.bin` must match Python `.dets.json`. TS letterbox fed the same image must match `.input.bin` within small tolerance (canvas resize ≠ cv2 resize — report the diff, don't hide it).

Match metric: greedy one-to-one match at IoU ≥ 0.9. Report count A, count B, matched %, max score diff.

## Phases — one phase per session. Stop at the gate, report, wait for me.

**Phase 0 — Inspect.** `tools/inspect_onnx.py`: input/output names, shapes, dtypes, opset, file size, op-type histogram (top 15). Update the Model contract section above to CONFIRMED or correct it.
Gate: contract confirmed.

**Phase 1 — Reference harness.** `tools/reference.py` generates golden fixtures for all 5 images; `tools/compare.py` runs parity layers 1 and 2. Also print per-image detection count vs ground-truth box count from `ground_truth.csv`.
Gate: layer 1 max diff small, layer 2 ≥ 98% matched on every image.

**Phase 2 — TS core.** `web/src/core/` pure functions + vitest parity tests (layer 3, decode/NMS half) using onnxruntime-node and the golden files. Measure NMS time on the densest image in Node.
Gate: TS dets match Python dets ≥ 99% on all 5 images.

**Phase 3 — Browser runtime.** Worker, EP selection (`webgpu` then `wasm`, log which loaded), model fetch with byte progress → Cache Storage → `navigator.storage.persist()`. Check current onnxruntime-web docs for WebGPU import path — do not trust memory. Letterbox via OffscreenCanvas in worker.
Gate: desktop Chrome, all 5 images, counts within a few % of golden. Report letterbox tensor diff.

**Phase 4 — App.** Single flow: `<input type="file" accept="image/*" capture="environment">` → processing state → result: image + box overlay (boxes only, no labels), large count, per-stage timings, confidence slider that re-runs decode+NMS on cached raw output (no re-inference).

**Phase 5 — PWA.** vite-plugin-pwa: manifest, icons, shell + ORT wasm precache. Model stays in our own cache, not the SW precache. Offline works after first load. iOS add-to-home-screen hint.

**Phase 6 — Deploy + bench.** Host must send COOP/COEP (WASM threads need `crossOriginIsolated`). 42.67 MB model may exceed per-file limits on some hosts — verify; fallback is a Hugging Face model repo (CORS-enabled). `/bench` route: fixed images, N runs, cold first run reported separately, median + p90 per stage (preprocess / inference / NMS / total), EP, thread count, UA, copy-as-JSON.
Gate: real numbers from a real phone in `docs/benchmarks.md`.

**Phase 7 (conditional)** — re-export at imgsz 416/320 and FP16 from `best.pt`. Any accuracy claim at a new imgsz requires re-running `val(split="test")` at that imgsz on Kaggle. Until then, no accuracy number is attached to it.

## Honesty rules for README, docs, and any numbers

- Only measured numbers. Every latency number names device, browser, EP, and imgsz.
- "7.2 ms" is **T4 GPU**, never presented as edge/browser performance.
- Test metrics (640, T4-evaluated): mAP50 0.928, mAP50-95 0.577, P 0.913, R 0.866; 2,935 images, 431,419 instances.
- Model training credit: Valda Veisa. PWA + in-browser inference: Fajru Rahman.

## Status

- [x] Phase 0
- [x] Phase 1
- [ ] Phase 2
- [ ] Phase 3
- [ ] Phase 4
- [ ] Phase 5
- [ ] Phase 6
