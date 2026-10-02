# Benchmarks

Measured numbers only. Every latency number names the device, browser, execution provider (EP) and imgsz. Nothing here is an edge-device or phone number until the phone section below is filled in.

Not to be confused with the training-time "7.2 ms", which is a T4 GPU figure and says nothing about browser performance.

## Dev machine (not edge-device numbers)

Windows desktop used for development. These are **dev-server** runs (unminified, Vite dev), not production builds, and not phones.

Common setup for every run below:

| | |
|---|---|
| OS | Windows 10 Home Single Language, build 19045 |
| Logical cores | 12 (`navigator.hardwareConcurrency`); CPU model not recorded |
| GPU adapter (WebGPU) | `intel / gen-9` (Intel Gen-9 integrated GPU) |
| Model | `best.onnx`, 42.67 MB, FP32, static `[1,3,640,640]`, **imgsz 640** |
| Runtime | onnxruntime-web 1.30.0, `crossOriginIsolated = true` (main and worker) |
| Postprocess | conf 0.25, iou 0.7, max_det 300 (parity settings) |
| Canvas smoothing | `low` |
| Page | `/dev/parity`, 5 SKU-110K test images, one run per image |

### Run 1: WASM, headless Edge 154

Run on 2026-09-30 through the DevTools protocol (headless), `requested=wasm`.

- UA: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0`
- EP: `wasm`, threads: 4, adapter: n/a
- Model load: 358 ms from network (75 ms from Cache Storage on a second run in the same session); session create: 433 ms

| image | decode | letterbox | infer | post | total | infer, golden input |
|---|---:|---:|---:|---:|---:|---:|
| test_208 | 46.0 | 16.5 | 573.8 | 6.7 | 643.2 | 634.3 (cold) |
| test_505 | 49.2 | 16.6 | 546.9 | 7.0 | 619.6 | 798.3 |
| test_805 | 27.2 | 13.7 | 521.1 | 13.9 | 575.9 | 829.8 |
| test_1577 | 50.0 | 21.8 | 620.9 | 2.8 | 695.6 | 619.7 |
| test_2418 | 46.9 | 16.5 | 880.2 | 4.9 | 948.6 | 582.6 |

### Run 2: WebGPU, headless Edge 154

Run on 2026-09-30 through the DevTools protocol (headless), `requested=auto` (WebGPU first).

- UA: same as Run 1
- EP: `webgpu`, `env.wasm.numThreads`: 4, adapter: `intel / gen-9`
- Model load: 361 ms from network; session create: 1,818 ms

| image | decode | letterbox | infer | post | total | infer, golden input |
|---|---:|---:|---:|---:|---:|---:|
| test_208 | 142.1 | 45.1 | 352.8 | 7.3 | 547.6 | 2757.3 (cold) |
| test_505 | 66.6 | 14.1 | 351.2 | 24.5 | 456.5 | 388.1 |
| test_805 | 86.3 | 28.5 | 367.1 | 11.7 | 493.7 | 359.9 |
| test_1577 | 28.1 | 12.7 | 365.8 | 2.6 | 409.2 | 391.6 |
| test_2418 | 32.2 | 12.0 | 352.4 | 2.9 | 399.5 | 381.6 |

The cold WebGPU inference (2,757 ms) includes shader compilation and happens in the golden-input pass, which runs first; the full-pipeline column is therefore already warm for this EP.

### Gate runs reported by Fajru (headed browsers, summary only)

| EP | Browser | Device | Threads | imgsz | Reported |
|---|---|---|---|---|---|
| WASM | Edge 154, Windows | CPU model not recorded | 4 | 640 | ~1,450 ms infer |
| WebGPU | Chrome 154 | Intel Gen-9 iGPU | n/a | 640 | ~355 ms infer (warm), 1.3 s session create |

Canvas smoothing `low` gave identical results across both. Per-image timing columns for these two runs are not recorded in this file yet: paste the `/dev/parity` "Copy result" output to add them. These figures differ from Run 1 and Run 2 above (headless runs); the difference has not been investigated.

### Column definitions

All times in ms, measured inside the worker.

- **decode**: `createImageBitmap(blob, { imageOrientation: 'from-image' })`
- **letterbox**: OffscreenCanvas draw + `getImageData` + RGBA to CHW float32
- **infer**: `session.run` including copying the output off the runtime heap
- **post**: decode + NMS + unmap
- **total**: wall time from the start of decode to the end of post, so about the sum of the four (message transfer to the main thread not included)
- **infer, golden input**: `session.run` on the saved `input.bin` tensor, so no canvas involved

(cold) marks the first run of a table, which includes warm-up. Each cell is a single run; there are no medians or p90 yet.

### Correctness on the same runs

With canvas smoothing `low`, detection counts were within 2.5% of the Python golden output and the match rate was at least 98.3% on all 5 images, on both the WASM and WebGPU paths (match is greedy one-to-one at IoU ≥ 0.9). Letterbox tensor max abs diff vs the OpenCV tensor was 0.043 (0–1 scale). These are headless-run figures; see the README for context.

## Phone results (Phase 6)

**Not measured yet.** To be filled from the `/bench` route on real phones: fixed images, N runs, cold first run reported separately, median and p90 per stage (preprocess / inference / NMS / total), EP, thread count, user agent.

| Device | Browser + version | EP | Threads | imgsz | Cold first run (ms) | Median / p90 preprocess | Median / p90 inference | Median / p90 NMS | Median / p90 total |
|---|---|---|---:|---:|---:|---|---|---|---|
| _pending_ | | | | 640 | | | | | |
