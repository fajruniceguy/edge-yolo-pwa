# Fixture integrity

Canonical SKU-110K originals — MD5 and ground-truth box count per image.
Check `tools/fixtures/images/*.jpg` against these before trusting parity results.

| file | md5 | ground-truth boxes |
|---|---|---|
| test_208.jpg | dd556bd8a1979f8e98ccc7b3ef3eed89 | 111 |
| test_505.jpg | 4994ac8f96ded717dc163711d17cd57d | 162 |
| test_805.jpg | e89dc7ae51c0fa9dd7460bb4c3f5b35d | 249 |
| test_1577.jpg | 95fc1ea7de623632df53e7e71b2ceaa1 | 160 |
| test_2418.jpg | 4137566acac345ab9c768744f4106cad | 130 |

## Known limits

Measured by `tools/eval_gt.py` on these 5 images only (n=5, not a test-set metric — the
test-set numbers are in CLAUDE.md). Setup: golden `*.dets.json` (imgsz 640, conf 0.25,
iou 0.7, max_det 300) vs `ground_truth.csv`, greedy one-to-one match at IoU ≥ 0.5, walking
detections in descending-score order.

| image | TP | FP | FN | precision | recall |
|---|---|---|---|---|---|
| test_208.jpg | 93 | 26 | 18 | 0.782 | 0.838 |
| test_505.jpg | 157 | 16 | 5 | 0.908 | 0.969 |
| test_805.jpg | 247 | 4 | 2 | 0.984 | 0.992 |
| test_1577.jpg | 93 | 27 | 67 | 0.775 | 0.581 |
| test_2418.jpg | 122 | 9 | 8 | 0.931 | 0.938 |

**test_1577 is a small-object failure.** Recall there is 0.581 versus 0.838–0.992 on the
other four. Ground-truth box area as a fraction of image area, missed (FN) vs found (TP):

| group | n | min | Q1 | median | Q3 | max |
|---|---|---|---|---|---|---|
| FN | 67 | 0.00039 | 0.00070 | 0.00081 | 0.00100 | 0.01730 |
| TP | 93 | 0.00038 | 0.00095 | 0.00407 | 0.00782 | 0.02599 |

The median missed box is ~5× smaller than the median found box, and the FN third quartile
(0.00100) is about the TP first quartile (0.00095): roughly three quarters of the misses are
no larger than the smallest quarter of the found boxes.
Misses concentrate on small products in this image. That is an observation on one image,
not a measured cause; do not extrapolate it to a recall figure for other images or imgsz.
Consequence for the app: the detected count is a lower bound on shelves with small
products, and a parity check against golden dets (which reproduce the same misses) says
nothing about ground-truth accuracy.
