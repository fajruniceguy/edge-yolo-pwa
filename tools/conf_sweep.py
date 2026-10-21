"""How do the confidence and NMS-IoU defaults score against ground truth? (run from the repo root)

    python tools/conf_sweep.py

Uses the saved raw model outputs (tools/fixtures/golden/<name>.raw.bin) and ground_truth.csv for the 5 fixture
images, so it needs no model run. Detections are matched to ground truth greedily at IoU >= 0.5, the same rule as
tools/eval_gt.py. Prints a summary table only. Five images is a small sample: use it to see the shape of the
trade-off, not to claim an optimum.
"""
import json
import os

import numpy as np
import pandas as pd

from eval_gt import GROUND_TRUTH_CSV, IMAGE_NAMES, match_tp_fp_fn
from pipeline import decode, nms, unmap

GOLDEN = "tools/fixtures/golden"
MATCH_IOU = 0.5
MAX_DET = 1000  # what the app uses


def load():
    gt = pd.read_csv(GROUND_TRUTH_CSV)
    meta = json.load(open(os.path.join(GOLDEN, "meta.json")))
    out = []
    for name in IMAGE_NAMES:
        stem = os.path.splitext(name)[0]
        raw = np.fromfile(os.path.join(GOLDEN, f"{stem}.raw.bin"), dtype=np.float32).reshape(1, 5, 8400)
        g = gt[gt["image"] == name][["x1", "y1", "x2", "y2"]].to_numpy(dtype=np.float64)
        out.append((stem, raw, meta[stem], g))
    return out


def run(data, conf, iou):
    tp = fp = fn = 0
    count_err = []
    for _, raw, meta, g in data:
        boxes, scores = decode(raw, conf)
        keep = nms(boxes, scores, iou_thresh=iou, max_det=MAX_DET)
        b = unmap(boxes[keep], meta).astype(np.float64)
        s = scores[keep].astype(np.float64)
        t, f, n, _ = match_tp_fp_fn(b, s, g, MATCH_IOU)
        tp, fp, fn = tp + len(t), fp + len(f), fn + len(n)
        count_err.append(100.0 * (len(b) - len(g)) / len(g))
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f1, count_err


def table(title, data, settings):
    print(f"\n{title}")
    print(f"{'conf':>5} {'iou':>5} {'precision':>9} {'recall':>7} {'F1':>6}   count error vs ground truth per image (%)  [208 505 805 1577 2418]")
    for conf, iou in settings:
        p, r, f1, ce = run(data, conf, iou)
        print(f"{conf:>5.2f} {iou:>5.2f} {p:>9.3f} {r:>7.3f} {f1:>6.3f}   " + " ".join(f"{e:+6.1f}" for e in ce))


def main():
    data = load()
    table("confidence sweep (NMS IoU 0.7, the app default)", data, [(c, 0.7) for c in (0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50)])
    table("NMS IoU sweep (confidence 0.25, the app default)", data, [(0.25, i) for i in (0.5, 0.6, 0.7, 0.8)])
    print("\nmicro-averaged over all boxes of the 5 images; match IoU 0.5; max_det 1000")


if __name__ == "__main__":
    main()
