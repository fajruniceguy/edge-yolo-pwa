import json
import os

import cv2
import numpy as np
import onnxruntime as ort

from pipeline import decode, letterbox, nms, unmap

MODEL_PATH = "model/best.onnx"
IMAGES_DIR = "tools/fixtures/images"
GOLDEN_DIR = "tools/fixtures/golden"
CONF = 0.25
IOU = 0.7
MAX_DET = 300

IMAGE_NAMES = [
    "test_208.jpg",
    "test_505.jpg",
    "test_805.jpg",
    "test_1577.jpg",
    "test_2418.jpg",
]


def main():
    os.makedirs(GOLDEN_DIR, exist_ok=True)
    session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    meta_all = {}

    for name in IMAGE_NAMES:
        stem = os.path.splitext(name)[0]
        img_bgr = cv2.imread(os.path.join(IMAGES_DIR, name))

        tensor, lb_meta = letterbox(img_bgr)
        raw = session.run(None, {input_name: tensor})[0]

        boxes_640, scores = decode(raw, conf=CONF)
        keep = nms(boxes_640, scores, iou_thresh=IOU, max_det=MAX_DET)
        boxes_640, scores = boxes_640[keep], scores[keep]
        boxes_orig = unmap(boxes_640, lb_meta)

        tensor.astype(np.float32).tofile(os.path.join(GOLDEN_DIR, f"{stem}.input.bin"))
        raw.astype(np.float32).tofile(os.path.join(GOLDEN_DIR, f"{stem}.raw.bin"))

        order = np.argsort(-scores)
        dets = [
            {
                "x1": float(boxes_orig[i, 0]),
                "y1": float(boxes_orig[i, 1]),
                "x2": float(boxes_orig[i, 2]),
                "y2": float(boxes_orig[i, 3]),
                "score": float(scores[i]),
            }
            for i in order
        ]
        with open(os.path.join(GOLDEN_DIR, f"{stem}.dets.json"), "w") as f:
            json.dump(dets, f)

        meta_all[stem] = {**lb_meta, "det_count": len(dets), "conf": CONF, "iou": IOU, "max_det": MAX_DET}
        print(f"{name}: {len(dets)} dets")

    with open(os.path.join(GOLDEN_DIR, "meta.json"), "w") as f:
        json.dump(meta_all, f, indent=2)


if __name__ == "__main__":
    main()
