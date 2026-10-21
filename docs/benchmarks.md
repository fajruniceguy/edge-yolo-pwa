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
| Canvas smoothing | `low` (the tables below show only `low`; the verbatim outputs include `medium`/`high`) |
| Page | `/dev/parity`, 5 SKU-110K test images, one run per image |
| Power state | not recorded for any run (see [Variability](#variability-between-sessions)) |

### Run 1: WASM, Edge 154 (desktop, headed)

Run on 2026-10-02, `requested=auto`. WebGPU was not used: Edge's `requestAdapter()` returned `null` on this machine, so the app fell back to WASM (Chrome got an adapter on the same machine, Run 2).

- UA: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0`
- EP: `wasm`, threads: 4, adapter: n/a
- Model load: 302 ms from network; session create: 590 ms

| image | decode | letterbox | infer | post | total | infer, golden input |
|---|---:|---:|---:|---:|---:|---:|
| test_208 | 52.3 | 14.0 | 1468.6 | 6.7 | 1541.7 | 1378.1 (cold) |
| test_505 | 48.1 | 10.7 | 1587.9 | 6.8 | 1653.5 | 1454.6 |
| test_805 | 24.1 | 7.6 | 1490.8 | 12.9 | 1535.5 | 1475.4 |
| test_1577 | 35.2 | 9.2 | 1619.7 | 4.1 | 1668.2 | 1585.8 |
| test_2418 | 38.3 | 8.6 | 1533.1 | 4.6 | 1584.5 | 1398.3 |

<details>
<summary>Verbatim "Copy result" output</summary>

```
CompVis /dev/parity  2026-10-02T01:42:12.902Z
UA: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0
crossOriginIsolated main=true worker=true  hardwareConcurrency=12
ORT 1.30.0  EP=wasm  threads=4  requested=auto
adapter: n/a  | webgpu skipped: requestAdapter() returned null
model: network, 42.67 MB, load 302 ms, session create 590 ms, storage.persist=false
settings: imgsz=640 conf=0.25 iou=0.7 max_det=300 match IoU>=0.9

[A] EP numerics: golden input.bin -> session vs golden raw.bin / dets.json (no canvas involved)
image         boxMaxD scoreMaxD   py   ts  match%  maxDscore  infer ms
test_208      9.99e-4   1.40e-5  119  119  100.0%    6.85e-7    1378.1  (cold)
test_505      5.13e-3   1.43e-5  173  173  100.0%    8.34e-7    1454.6
test_805      5.00e-4   7.00e-6  251  251  100.0%    5.36e-7    1475.4
test_1577     8.70e-4   1.90e-5  120  120  100.0%    1.40e-6    1585.8
test_2418     1.65e-3   1.07e-5  131  131  100.0%    5.96e-7    1398.3

[B] Full worker pipeline: image -> createImageBitmap -> OffscreenCanvas letterbox -> session -> decode/NMS/unmap vs golden
    lb* = letterbox tensor vs golden input.bin: max abs diff, mean abs diff over content region / whole tensor, % of values off by > 8/255
image      smooth    py   ts dCount%  match%  maxDscore   lbMax  lbMeanC lbMeanAll lb>8/255% meta  decode letterbx   infer   post   total
test_208   low      119  119     0.0   99.2%    3.13e-2   0.035   0.0017    0.0012      0.00   ok    52.3     14.0  1468.6    6.7  1541.7  (cold)
test_208   medium   119  120     0.8   91.6%    3.05e-1   0.376   0.0177    0.0133     11.47   ok    43.5     23.9  1454.6    5.3  1527.3
test_208   high     119  120     0.8   91.6%    3.05e-1   0.376   0.0177    0.0133     11.47   ok    49.0     20.7  1405.2   16.4  1491.4
test_505   low      173  171    -1.2   99.4%    4.44e-2   0.039   0.0027    0.0015      0.00   ok    48.1     10.7  1587.9    6.8  1653.5
test_505   medium   173  168    -2.9   91.7%    3.98e-1   0.373   0.0267    0.0150     13.50   ok    47.1     23.8  1485.1    7.1  1563.2
test_505   high     173  168    -2.9   91.7%    3.98e-1   0.373   0.0267    0.0150     13.50   ok    49.5     22.9  1533.3    8.4  1614.2
test_805   low      251  251     0.0  100.0%    1.64e-2   0.004   0.0019    0.0014      0.00   ok    24.1      7.6  1490.8   12.9  1535.5
test_805   medium   251  251     0.0  100.0%    7.12e-2   0.275   0.0159    0.0119     10.62   ok    39.4     21.6  1639.3   11.7  1712.0
test_805   high     251  251     0.0  100.0%    7.12e-2   0.275   0.0159    0.0119     10.62   ok    28.1     18.3  1637.2   13.5  1697.1
test_1577  low      120  123     2.5   98.3%    4.34e-2   0.043   0.0016    0.0012      0.00   ok    35.2      9.2  1619.7    4.1  1668.2
test_1577  medium   120   96   -20.0   88.5%    2.99e-1   0.471   0.0231    0.0173     16.01   ok    32.9     20.3  1508.8    3.7  1565.8
test_1577  high     120   96   -20.0   88.5%    2.99e-1   0.471   0.0231    0.0173     16.01   ok    44.7     18.9  1576.2    3.1  1643.0
test_2418  low      131  131     0.0  100.0%    1.55e-2   0.043   0.0021    0.0016      0.00   ok    38.3      8.6  1533.1    4.6  1584.5
test_2418  medium   131  128    -2.3   88.3%    1.60e-1   0.435   0.0295    0.0221     21.52   ok    53.3     26.9  1573.6    4.6  1658.5
test_2418  high     131  128    -2.3   88.3%    1.60e-1   0.435   0.0295    0.0221     21.52   ok    56.4     24.0  1759.3    5.8  1845.5

[C] Summary per canvas smoothing (all 5 images)
smooth    max|dCount|%  min match%  max lbMax
low                2.5        98.3      0.043
medium            20.0        88.3      0.471
high              20.0        88.3      0.471

Notes: (cold) = first run of that table, includes warm-up (shader/JIT/canvas). All times ms, EP/threads as in header.
```

</details>

### Run 2: WebGPU, Chrome 154 (desktop, headed)

Run on 2026-10-02, `requested=auto` (WebGPU first).

- UA: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36`
- EP: `webgpu`, `env.wasm.numThreads`: 4, adapter: `intel / gen-9`
- Model load: 446 ms from network; session create: 1,310 ms

| image | decode | letterbox | infer | post | total | infer, golden input |
|---|---:|---:|---:|---:|---:|---:|
| test_208 | 44.8 | 13.2 | 356.2 | 7.1 | 421.4 | 471.6 (cold) |
| test_505 | 39.7 | 8.2 | 365.1 | 3.6 | 416.6 | 363.6 |
| test_805 | 21.1 | 6.7 | 356.2 | 34.9 | 418.8 | 356.2 |
| test_1577 | 26.0 | 10.8 | 357.7 | 1.6 | 396.1 | 351.5 |
| test_2418 | 35.9 | 8.3 | 355.8 | 9.9 | 409.9 | 351.4 |

<details>
<summary>Verbatim "Copy result" output</summary>

```
CompVis /dev/parity  2026-10-02T01:53:36.418Z
UA: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36
crossOriginIsolated main=true worker=true  hardwareConcurrency=12
ORT 1.30.0  EP=webgpu  threads=4  requested=auto
adapter: intel / gen-9
model: network, 42.67 MB, load 446 ms, session create 1310 ms, storage.persist=false
settings: imgsz=640 conf=0.25 iou=0.7 max_det=300 match IoU>=0.9

[A] EP numerics: golden input.bin -> session vs golden raw.bin / dets.json (no canvas involved)
image         boxMaxD scoreMaxD   py   ts  match%  maxDscore  infer ms
test_208      5.31e-3   1.09e-5  119  119  100.0%    2.32e-6     471.6  (cold)
test_505      4.00e-2   5.42e-6  173  173  100.0%    2.47e-6     363.6
test_805      9.31e-4   6.71e-6  251  251  100.0%    9.24e-7     356.2
test_1577     4.27e-3   3.20e-5  120  120  100.0%    2.18e-6     351.5
test_2418     1.07e-2   3.29e-5  131  131  100.0%    1.07e-6     351.4

[B] Full worker pipeline: image -> createImageBitmap -> OffscreenCanvas letterbox -> session -> decode/NMS/unmap vs golden
    lb* = letterbox tensor vs golden input.bin: max abs diff, mean abs diff over content region / whole tensor, % of values off by > 8/255
image      smooth    py   ts dCount%  match%  maxDscore   lbMax  lbMeanC lbMeanAll lb>8/255% meta  decode letterbx   infer   post   total
test_208   low      119  119     0.0   99.2%    3.12e-2   0.035   0.0017    0.0012      0.00   ok    44.8     13.2   356.2    7.1   421.4  (cold)
test_208   medium   119  120     0.8   91.6%    3.05e-1   0.376   0.0177    0.0133     11.47   ok    54.5     25.2   352.4    3.9   436.1
test_208   high     119  120     0.8   91.6%    3.05e-1   0.376   0.0177    0.0133     11.47   ok    39.5     20.4   351.0   48.0   459.0
test_505   low      173  171    -1.2   99.4%    4.44e-2   0.039   0.0027    0.0015      0.00   ok    39.7      8.2   365.1    3.6   416.6
test_505   medium   173  168    -2.9   91.7%    3.98e-1   0.373   0.0267    0.0150     13.50   ok    58.4     54.9   376.9   19.2   509.4
test_505   high     173  168    -2.9   91.7%    3.98e-1   0.373   0.0267    0.0150     13.50   ok   129.5     31.0   359.4    3.1   523.0
test_805   low      251  251     0.0  100.0%    1.64e-2   0.004   0.0019    0.0014      0.00   ok    21.1      6.7   356.2   34.9   418.8
test_805   medium   251  251     0.0  100.0%    7.12e-2   0.275   0.0159    0.0119     10.62   ok    99.5     35.4   357.8    7.2   499.8
test_805   high     251  251     0.0  100.0%    7.12e-2   0.275   0.0159    0.0119     10.62   ok    23.8     21.9   359.5   30.6   435.9
test_1577  low      120  123     2.5   98.3%    4.34e-2   0.043   0.0016    0.0012      0.00   ok    26.0     10.8   357.7    1.6   396.1
test_1577  medium   120   96   -20.0   88.5%    2.99e-1   0.471   0.0231    0.0173     16.01   ok    38.2     25.6   356.3    4.9   425.0
test_1577  high     120   96   -20.0   88.5%    2.99e-1   0.471   0.0231    0.0173     16.01   ok   116.3     39.1   362.3    1.2   518.9
test_2418  low      131  131     0.0  100.0%    1.55e-2   0.043   0.0021    0.0016      0.00   ok    35.9      8.3   355.8    9.9   409.9
test_2418  medium   131  128    -2.3   88.3%    1.60e-1   0.435   0.0295    0.0221     21.52   ok   126.5     26.9  356.0    2.4   511.8
test_2418  high     131  128    -2.3   88.3%    1.60e-1   0.435   0.0295    0.0221     21.52   ok    39.0     17.3   351.4    9.5   417.3

[C] Summary per canvas smoothing (all 5 images)
smooth    max|dCount|%  min match%  max lbMax
low                2.5        98.3      0.043

Notes: (cold) = first run of that table, includes warm-up (shader/JIT/canvas). All times ms, EP/threads as in header.
```

</details>

### Additional runs: headless Edge 154

Two earlier runs on 2026-09-30 through the DevTools protocol (headless), before the headed runs above. Same machine; UA `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0`.

**Run 3: WASM** (`requested=wasm`): EP `wasm`, threads 4, adapter n/a; model load 358 ms from network (75 ms from Cache Storage on a second run in the same session); session create 433 ms.

| image | decode | letterbox | infer | post | total | infer, golden input |
|---|---:|---:|---:|---:|---:|---:|
| test_208 | 46.0 | 16.5 | 573.8 | 6.7 | 643.2 | 634.3 (cold) |
| test_505 | 49.2 | 16.6 | 546.9 | 7.0 | 619.6 | 798.3 |
| test_805 | 27.2 | 13.7 | 521.1 | 13.9 | 575.9 | 829.8 |
| test_1577 | 50.0 | 21.8 | 620.9 | 2.8 | 695.6 | 619.7 |
| test_2418 | 46.9 | 16.5 | 880.2 | 4.9 | 948.6 | 582.6 |

**Run 4: WebGPU** (`requested=auto`): EP `webgpu`, `env.wasm.numThreads` 4, adapter `intel / gen-9`; model load 361 ms from network; session create 1,818 ms.

| image | decode | letterbox | infer | post | total | infer, golden input |
|---|---:|---:|---:|---:|---:|---:|
| test_208 | 142.1 | 45.1 | 352.8 | 7.3 | 547.6 | 2757.3 (cold) |
| test_505 | 66.6 | 14.1 | 351.2 | 24.5 | 456.5 | 388.1 |
| test_805 | 86.3 | 28.5 | 367.1 | 11.7 | 493.7 | 359.9 |
| test_1577 | 28.1 | 12.7 | 365.8 | 2.6 | 409.2 | 391.6 |
| test_2418 | 32.2 | 12.0 | 352.4 | 2.9 | 399.5 | 381.6 |

The cold WebGPU inference depends on the browser's shader cache: 2,757 ms in the headless profile (fresh), 471.6 ms in the Chrome run. It happens in the golden-input pass, which runs first, so the full-pipeline column is already warm for this EP.

### Variability between sessions

Warm WASM inference on this machine moved from about 520 to 880 ms (headless, Run 3) to about 1,380 to 1,620 ms (headed Edge, Run 1; typically cited as ~1,450 ms). The power state was not recorded for any session, and the difference is attributed to that; it has not been isolated or verified. WebGPU warm inference was stable at 351 to 367 ms across the headless and headed runs. Treat any single WASM figure from this machine as a range, not a constant. This is the reason the phone protocol below fixes and records the measurement conditions.

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

With canvas smoothing `low`, detection counts were within 2.5% of the Python golden output and the match rate was at least 98.3% on all 5 images, identically in Edge (WASM) and Chrome (WebGPU) and in the headless runs (match is greedy one-to-one at IoU >= 0.9). Letterbox tensor max abs diff vs the OpenCV tensor was 0.043 (0-1 scale). Canvas smoothing `medium` and `high` were identical to each other and drifted up to -20% in count on test_1577.

## Phone results (Phase 6)

### First protocol-compliant run: POCO M4 Pro, WASM thread sweep

Run on 2026-10-21 09:35 to 09:46 UTC with `/bench` on the deployed site. The page marked it **compliant** (battery saver, efficiency mode and room temperature were attested by the tester; charging state, wake lock and page visibility were measured). One session, one phone.

| | |
|---|---|
| Device | POCO M4 Pro, model `2201117PG`, platform version 11.0.0 (UA client hints), 8 logical cores, `navigator.deviceMemory` 4 GB |
| Browser | Chrome 155.0.8059.84 for Android |
| EP | WASM (WebGPU not used: `requestAdapter()` returned null); `crossOriginIsolated = true` |
| imgsz / model | 640 / `best.onnx` from Cache Storage |
| Power | on battery (unplugged), 70% at start and 67% at end; battery saver off (attested) |
| Photos | 3 gallery photos, each 2608 x 4624 (12.06 MP, 2.7 to 3.1 MB); detections per photo [8, 104, 84] in every configuration |
| Protocol | 10 passes x 3 photos = 30 runs per configuration: 1 cold + 29 warm. Configurations ran one after another in this order: 1, 2, 3, 4, 6, 8 threads, each in a fresh worker |

All times in ms; "med / p90" over the 29 warm runs; cold = the first run of that configuration.

| Threads | Cold total | Preprocess med / p90 | Inference med / p90 | Inference min to max | NMS med / p90 | Total med / p90 | Drift % |
|---:|---:|---|---|---|---|---|---:|
| 1 | 4,070 | 603 / 673 | 3,449 / 3,518 | 3,388 to 3,736 | 1.2 / 6.8 | 4,035 / 4,137 | -1.1 |
| 2 | 2,196 | 566 / 623 | **1,923** / 2,145 | 1,756 to 3,086 | 1.2 / 1.7 | **2,463** / 2,750 | +2.1 |
| 3 | 5,454 | 453 / 527 | 4,319 / 5,339 | 3,524 to 5,682 | 1.6 / 8.2 | 4,756 / 5,792 | +18.4 |
| 4 | 5,022 | 420 / 540 | 3,478 / 4,918 | 1,965 to 8,494 | 2.7 / 11.6 | 3,864 / 5,383 | -41.8 |
| 6 | 3,206 | 415 / 461 | 2,648 / 3,173 | 2,355 to 4,131 | 3.7 / 12.1 | 3,076 / 3,651 | -7.1 |
| 8 | 3,119 | 444 / 524 | 3,682 / 5,469 | 2,280 to 12,258 | 8.4 / 17.5 | 4,093 / 5,950 | +37.9 |

Drift = change of the median inference time between the first and last third of the warm runs (positive = slower at the end).

What this does and does not show:

- **1 thread to 2 threads is a real speed-up (about 1.8x on inference)**, and both runs were steady (drift -1.1% and +2.1%, p90 within 2% and 12% of the median).
- **3, 4, 6 and 8 threads were not faster than 2 in this run, and were much less steady** (p90 / median of 1.24, 1.41, 1.20 and 1.49, against 1.12 for 2 threads). Their drift values (+18%, -42%, -7%, +38%) say the phone's state changed while they ran, so they cannot be ranked against each other or against 2 threads from this run alone.
- **The same configuration measured very differently minutes apart.** An earlier single-configuration run on the same phone and the same 4-thread setting (flagged non-compliant only because of a wake-lock reporting bug in `/bench`, fixed in `a229c00`) measured warm inference 1,998 / 2,131 ms (median / p90, 29 runs, drift +0.85%, total 2,312 / 2,570 ms, 78% to 77% battery). The 4-thread block in the sweep above measured 3,478 / 4,918. That is a 75% difference for one setting, so ordering and time effects are larger than the differences between 2, 4 and 6 threads.
- **The tester reported the phone was hot at the end of the run** (comparable to playing a demanding game). Temperature was not measured (browsers expose no temperature), so this is a note, not a number. It fits heat or throttling building up over the 11-minute, roughly 180-inference run, which is a stress test and not how the app is used (one inference per photo), but it is also an uncontrolled factor that later configurations ran under.
- **No cause is established** for the slow, noisy blocks (background load, CPU frequency and scheduling on a big.LITTLE chip, or heat were not separated). The configurations were not interleaved, so any of them could have run in a worse moment.
- Against the 1 to 3 s target for WASM: median total was within it only for 2 threads (2.46 s) and for the earlier 4-thread run (2.31 s).
- **Preprocess** (decode + letterbox of a 12 MP photo) was 415 to 603 ms median, 10 to 15% of the total; **NMS** was negligible (1 to 8 ms). Letterbox time is bimodal (about 25 to 40 ms or 100 to 160 ms) in every configuration.
- Cold runs were close to warm for WASM (no large warm-up penalty); session creation took 0.4 to 1.6 s.

### Informal first runs (not benchmarks)

Two single photos analysed in the deployed app (`https://compvis-pwa.vercel.app`, production build) on a POCO M4 Pro, read from screenshots. One run each, no repeats, no conditions controlled: treat them as an order of magnitude, not a result. All times in ms.

| | Run A | Run B |
|---|---:|---:|
| Device | POCO M4 Pro | POCO M4 Pro |
| Browser | Chrome for Android (version not recorded) | Chrome for Android (version not recorded) |
| Android version | not recorded | not recorded |
| EP / threads / imgsz | WASM / 4 / 640 | WASM / 4 / 640 |
| Model source | network (first visit) | Cache Storage (airplane mode, offline reload) |
| Battery / charging / power mode | 45% / not recorded / not recorded | 43% / not recorded / not recorded |
| Decode | 172 | 189 |
| Letterbox | 171 | 28.6 |
| Inference | 2,411 | 2,886 |
| Postprocess (decode + NMS) | 2.3 | 1.1 |
| **Total** | **2,757** | **3,105** |
| Slider re-run (decode + NMS only) | 0.1 | not shown |
| Detections | 8 | 9 |

The two runs are different photos in different states, and inference differs by about 20% between them; that spread is why the protocol needs N >= 10 warm runs, median and p90, and recorded conditions.

### Running it: `/bench`

Open `/bench` on the phone (the deployed site, or a dev/preview build over `adb reverse`), pick the photo set from the gallery, tick the conditions you have met, run at least 10 passes, and copy the JSON (or the summary text). The page checks the rules below that it can see (charging state, wake lock held, page never hidden, passes, cancelled), takes your word for the three it cannot (battery saver, efficiency mode, room temperature), and prints "not protocol-compliant" with the reasons if any fail. To compare configurations (thread counts, engines) use **interleaved** order: every configuration runs on every photo in turn, starting configuration rotating, with all sessions alive at once (up to 4), and the report adds paired ratios against the first configuration. One-after-another order is confounded by drift and heat, as the first sweep above shows, so the report says so in its notes; it can add a cool-down pause between configurations. Statistics are medians and 90th percentiles by linear interpolation (numpy's default) over the warm runs; the cold run is separate. Add results below only from runs it marks as compliant.

### Measurement conditions

Phone numbers are only comparable if the conditions are fixed and written down next to the numbers. For every phone result:

- **Charging state**: record it (plugged in or on battery) and keep it the same for all runs of one result.
- **Battery saver / power mode**: off, and record the mode. Low-power modes throttle CPU and GPU clocks.
- **Browser efficiency / energy-saving mode**: off (for example Edge efficiency mode, Chrome Energy Saver / Memory Saver on desktop). Chrome for Android may have none of these; if its settings show none, treat the condition as met and rely on the phone's own battery saver and per-app battery restriction (set the browser to no restrictions).
- **Screen**: on and awake for the whole run, app in the foreground.
- **Temperature**: phone at room temperature at the start (not just taken out of a pocket, a car or a charger). Note if the device feels warm at the end; a thermally throttled run is reported as such, not averaged in silently.
- **Runs**: N >= 10 warm runs per image set after the cold first run, which is reported separately.
- **Statistic**: report median and p90 per stage (preprocess / inference / NMS / total), never the mean of a few runs.
- **Also record**: device model, OS version, browser and version, EP actually used, thread count, `crossOriginIsolated`, imgsz, model file size, and whether the model came from the network or Cache Storage.

| Device | Browser + version | EP | Threads | imgsz | Charging | Power mode | Cold first run (ms) | Median / p90 preprocess | Median / p90 inference | Median / p90 NMS | Median / p90 total |
|---|---|---|---:|---:|---|---|---:|---|---|---|---|
| POCO M4 Pro (2201117PG, Android 11) | Chrome 155.0.8059.84 | WASM | 1 | 640 | unplugged, 70% to 67% | battery saver off (attested) | 4,070 | 603 / 673 | 3,449 / 3,518 | 1.2 / 6.8 | 4,035 / 4,137 |
| POCO M4 Pro (2201117PG, Android 11) | Chrome 155.0.8059.84 | WASM | 2 | 640 | unplugged, 70% to 67% | battery saver off (attested) | 2,196 | 566 / 623 | 1,923 / 2,145 | 1.2 / 1.7 | 2,463 / 2,750 |
| POCO M4 Pro (2201117PG, Android 11) | Chrome 155.0.8059.84 | WASM | 3 | 640 | unplugged, 70% to 67% | battery saver off (attested) | 5,454 | 453 / 527 | 4,319 / 5,339 | 1.6 / 8.2 | 4,756 / 5,792 |
| POCO M4 Pro (2201117PG, Android 11) | Chrome 155.0.8059.84 | WASM | 4 | 640 | unplugged, 70% to 67% | battery saver off (attested) | 5,022 | 420 / 540 | 3,478 / 4,918 | 2.7 / 11.6 | 3,864 / 5,383 |
| POCO M4 Pro (2201117PG, Android 11) | Chrome 155.0.8059.84 | WASM | 6 | 640 | unplugged, 70% to 67% | battery saver off (attested) | 3,206 | 415 / 461 | 2,648 / 3,173 | 3.7 / 12.1 | 3,076 / 3,651 |
| POCO M4 Pro (2201117PG, Android 11) | Chrome 155.0.8059.84 | WASM | 8 | 640 | unplugged, 70% to 67% | battery saver off (attested) | 3,119 | 444 / 524 | 3,682 / 5,469 | 8.4 / 17.5 | 4,093 / 5,950 |
