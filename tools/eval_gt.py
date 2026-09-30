import json
import os

import numpy as np
import pandas as pd

from pipeline import iou_one_vs_many

GOLDEN_DIR = "tools/fixtures/golden"
GROUND_TRUTH_CSV = "tools/fixtures/ground_truth.csv"
MATCH_IOU = 0.5
AREA_QUARTILE_IMAGE = "test_1577"

IMAGE_NAMES = [
    "test_208.jpg",
    "test_505.jpg",
    "test_805.jpg",
    "test_1577.jpg",
    "test_2418.jpg",
]


def load_dets(stem):
    with open(os.path.join(GOLDEN_DIR, f"{stem}.dets.json")) as f:
        dets = json.load(f)
    boxes = np.array([[d["x1"], d["y1"], d["x2"], d["y2"]] for d in dets], dtype=np.float64)
    scores = np.array([d["score"] for d in dets], dtype=np.float64)
    return boxes, scores


def match_tp_fp_fn(det_boxes, det_scores, gt_boxes, iou_thresh):
    n_gt = len(gt_boxes)
    used_gt = np.zeros(n_gt, dtype=bool)
    order = np.argsort(-det_scores)

    tp_det_idx, fp_det_idx, matched_gt_idx = [], [], []

    for i in order:
        if n_gt == 0:
            fp_det_idx.append(i)
            continue
        ious = iou_one_vs_many(det_boxes[i], gt_boxes)
        ious[used_gt] = -1
        j = int(np.argmax(ious))
        if ious[j] >= iou_thresh:
            used_gt[j] = True
            tp_det_idx.append(i)
            matched_gt_idx.append(j)
        else:
            fp_det_idx.append(i)

    fn_gt_idx = [j for j in range(n_gt) if not used_gt[j]]
    return tp_det_idx, fp_det_idx, fn_gt_idx, matched_gt_idx


def area_fraction(boxes, img_w, img_h):
    areas = np.clip(boxes[:, 2] - boxes[:, 0], 0, None) * np.clip(boxes[:, 3] - boxes[:, 1], 0, None)
    return areas / (img_w * img_h)


def area_quartiles(area_frac):
    if len(area_frac) == 0:
        return None
    return (
        len(area_frac),
        float(np.min(area_frac)),
        float(np.percentile(area_frac, 25)),
        float(np.percentile(area_frac, 50)),
        float(np.percentile(area_frac, 75)),
        float(np.max(area_frac)),
    )


def main():
    gt = pd.read_csv(GROUND_TRUTH_CSV)

    print(f"{'image':<14} {'TP':>4} {'FP':>4} {'FN':>4} {'precision':>9} {'recall':>7}")

    for name in IMAGE_NAMES:
        stem = os.path.splitext(name)[0]
        det_boxes, det_scores = load_dets(stem)

        img_gt = gt[gt["image"] == name]
        gt_boxes = img_gt[["x1", "y1", "x2", "y2"]].to_numpy(dtype=np.float64)

        tp_idx, fp_idx, fn_idx, matched_gt_idx = match_tp_fp_fn(
            det_boxes, det_scores, gt_boxes, MATCH_IOU
        )

        tp, fp, fn = len(tp_idx), len(fp_idx), len(fn_idx)
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0

        print(f"{name:<14} {tp:>4} {fp:>4} {fn:>4} {precision:>9.3f} {recall:>7.3f}")

        if stem == AREA_QUARTILE_IMAGE:
            img_w = int(img_gt["image_width"].iloc[0])
            img_h = int(img_gt["image_height"].iloc[0])

            fn_area_frac = area_fraction(gt_boxes[fn_idx], img_w, img_h)
            tp_area_frac = area_fraction(gt_boxes[matched_gt_idx], img_w, img_h)

            print()
            print(f"{stem}: gt-box area / image-area, FN vs TP")
            print(f"{'group':<6} {'n':>4} {'min':>9} {'Q1':>9} {'median':>9} {'Q3':>9} {'max':>9}")
            for label, area_frac in (("FN", fn_area_frac), ("TP", tp_area_frac)):
                stats = area_quartiles(area_frac)
                if stats is None:
                    print(f"{label:<6} {0:>4}")
                    continue
                n, lo, q1, med, q3, hi = stats
                print(f"{label:<6} {n:>4} {lo:>9.5f} {q1:>9.5f} {med:>9.5f} {q3:>9.5f} {hi:>9.5f}")


if __name__ == "__main__":
    main()
