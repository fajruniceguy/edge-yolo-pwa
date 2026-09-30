import numpy as np
import cv2

INPUT_SIZE = 640


def letterbox(img_bgr):
    h0, w0 = img_bgr.shape[:2]
    r = min(INPUT_SIZE / h0, INPUT_SIZE / w0)
    new_w, new_h = round(w0 * r), round(h0 * r)
    dw, dh = (INPUT_SIZE - new_w) / 2, (INPUT_SIZE - new_h) / 2
    left, right = round(dw - 0.1), round(dw + 0.1)
    top, bottom = round(dh - 0.1), round(dh + 0.1)

    resized = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    padded = cv2.copyMakeBorder(
        resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114)
    )

    rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)
    tensor = rgb.astype(np.float32) / 255.0
    tensor = np.ascontiguousarray(tensor.transpose(2, 0, 1)[None, ...])

    meta = {
        "w0": w0, "h0": h0, "r": r,
        "left": left, "top": top, "right": right, "bottom": bottom,
    }
    return tensor, meta


def decode(raw, conf=0.25):
    d = raw[0]
    cx, cy, w, h, score = d[0], d[1], d[2], d[3], d[4]
    keep = score > conf
    cx, cy, w, h, score = cx[keep], cy[keep], w[keep], h[keep], score[keep]
    boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
    return boxes.astype(np.float32), score.astype(np.float32)


def nms(boxes, scores, iou_thresh=0.7, max_det=300, max_candidates=30000):
    order = np.argsort(-scores)[:max_candidates]
    boxes = boxes[order]

    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)

    active = np.ones(len(boxes), dtype=bool)
    keep = []
    for i in range(len(boxes)):
        if not active[i]:
            continue
        keep.append(i)
        if len(keep) >= max_det:
            break
        xx1 = np.maximum(x1[i], x1[i + 1:])
        yy1 = np.maximum(y1[i], y1[i + 1:])
        xx2 = np.minimum(x2[i], x2[i + 1:])
        yy2 = np.minimum(y2[i], y2[i + 1:])
        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        union = areas[i] + areas[i + 1:] - inter
        iou = np.where(union > 0, inter / union, 0)
        active[i + 1:][iou > iou_thresh] = False

    return order[keep]


def unmap(boxes_640, meta):
    boxes = boxes_640.copy()
    r, left, top = meta["r"], meta["left"], meta["top"]
    w0, h0 = meta["w0"], meta["h0"]

    boxes[:, [0, 2]] = (boxes[:, [0, 2]] - left) / r
    boxes[:, [1, 3]] = (boxes[:, [1, 3]] - top) / r
    boxes[:, [0, 2]] = np.clip(boxes[:, [0, 2]], 0, w0)
    boxes[:, [1, 3]] = np.clip(boxes[:, [1, 3]], 0, h0)
    return boxes


def iou_one_vs_many(box, boxes):
    xx1 = np.maximum(box[0], boxes[:, 0])
    yy1 = np.maximum(box[1], boxes[:, 1])
    xx2 = np.minimum(box[2], boxes[:, 2])
    yy2 = np.minimum(box[3], boxes[:, 3])
    inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
    area_box = (box[2] - box[0]) * (box[3] - box[1])
    areas = np.clip(boxes[:, 2] - boxes[:, 0], 0, None) * np.clip(boxes[:, 3] - boxes[:, 1], 0, None)
    union = area_box + areas - inter
    return np.where(union > 0, inter / union, 0)


def greedy_match(boxes_a, scores_a, boxes_b, scores_b, iou_thresh=0.9):
    """Greedy one-to-one match, walking A in descending score order.
    Returns (matched_count, max_abs_score_diff_over_matched_pairs)."""
    if len(boxes_a) == 0 or len(boxes_b) == 0:
        return 0, 0.0

    order = np.argsort(-scores_a)
    used_b = np.zeros(len(boxes_b), dtype=bool)
    matched = 0
    max_score_diff = 0.0

    for i in order:
        ious = iou_one_vs_many(boxes_a[i], boxes_b)
        ious[used_b] = -1
        j = int(np.argmax(ious))
        if ious[j] >= iou_thresh:
            used_b[j] = True
            matched += 1
            max_score_diff = max(max_score_diff, abs(float(scores_a[i]) - float(scores_b[j])))

    return matched, max_score_diff
