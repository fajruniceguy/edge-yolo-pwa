import json
import os
import warnings

import numpy as np
import pandas as pd
import torch
from ultralytics import YOLO

from pipeline import greedy_match

MODEL_PT = "model/best.pt"
MODEL_ONNX = "model/best.onnx"
IMAGES_DIR = "tools/fixtures/images"
GOLDEN_DIR = "tools/fixtures/golden"
GROUND_TRUTH_CSV = "tools/fixtures/ground_truth.csv"

CONF = 0.25
IOU = 0.7
MAX_DET = 300
MATCH_IOU = 0.9

IMAGE_NAMES = [
    "test_208.jpg",
    "test_505.jpg",
    "test_805.jpg",
    "test_1577.jpg",
    "test_2418.jpg",
]


def load_golden(stem):
    input_tensor = np.fromfile(
        os.path.join(GOLDEN_DIR, f"{stem}.input.bin"), dtype=np.float32
    ).reshape(1, 3, 640, 640)
    raw_onnx = np.fromfile(
        os.path.join(GOLDEN_DIR, f"{stem}.raw.bin"), dtype=np.float32
    ).reshape(1, 5, 8400)
    with open(os.path.join(GOLDEN_DIR, f"{stem}.dets.json")) as f:
        dets = json.load(f)
    return input_tensor, raw_onnx, dets


def layer1_export_parity(pt_model, stem):
    input_tensor, raw_onnx, _ = load_golden(stem)
    with torch.no_grad():
        out = pt_model(torch.from_numpy(input_tensor))
    if isinstance(out, (tuple, list)):
        out = out[0]
    raw_pt = out.numpy()

    max_diff_boxes = float(np.max(np.abs(raw_pt[:, :4, :] - raw_onnx[:, :4, :])))
    max_diff_scores = float(np.max(np.abs(raw_pt[:, 4, :] - raw_onnx[:, 4, :])))
    return max_diff_boxes, max_diff_scores


def layer2_pipeline_parity(yolo_onnx, stem, name):
    _, _, dets_mine = load_golden(stem)
    boxes_mine = np.array([[d["x1"], d["y1"], d["x2"], d["y2"]] for d in dets_mine], dtype=np.float32)
    scores_mine = np.array([d["score"] for d in dets_mine], dtype=np.float32)

    results = yolo_onnx.predict(
        source=os.path.join(IMAGES_DIR, name),
        conf=CONF, iou=IOU, max_det=MAX_DET, imgsz=640,
        verbose=False, save=False,
    )
    boxes_ul = results[0].boxes.xyxy.cpu().numpy()
    scores_ul = results[0].boxes.conf.cpu().numpy()

    matched, max_score_diff = greedy_match(boxes_mine, scores_mine, boxes_ul, scores_ul, iou_thresh=MATCH_IOU)
    denom = min(len(boxes_mine), len(boxes_ul)) or 1
    matched_pct = 100.0 * matched / denom

    return len(boxes_mine), len(boxes_ul), matched_pct, max_score_diff


def main():
    warnings.filterwarnings("ignore")

    ckpt = torch.load(MODEL_PT, map_location="cpu", weights_only=False)
    pt_model = ckpt["model"].float().eval()
    yolo_onnx = YOLO(MODEL_ONNX, task="detect")

    gt = pd.read_csv(GROUND_TRUTH_CSV)
    gt_counts = gt.groupby("image").size()

    print(f"{'image':<14} {'L1 box':>9} {'L1 score':>9} {'A':>5} {'B':>5} {'match%':>7} {'scoreDiff':>9} {'gt':>5}")
    for name in IMAGE_NAMES:
        stem = os.path.splitext(name)[0]
        l1_box, l1_score = layer1_export_parity(pt_model, stem)
        count_a, count_b, matched_pct, score_diff = layer2_pipeline_parity(yolo_onnx, stem, name)
        gt_count = int(gt_counts.get(name, -1))

        print(
            f"{name:<14} {l1_box:>9.2e} {l1_score:>9.2e} {count_a:>5} {count_b:>5} "
            f"{matched_pct:>6.1f}% {score_diff:>9.2e} {gt_count:>5}"
        )


if __name__ == "__main__":
    main()
