"""Locate a Rubik face in a raw photo using a one-class YOLOv8 model."""

import os
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from app.core.errors import APIError
from app.services.detection.grid_detection import FACE_SIZE, CellBox, DetectedGrid

MODEL_PATH = Path(__file__).resolve().parents[3] / "models" / "face_best.pt"
FACE_PADDING = 0.035


@lru_cache(maxsize=2)
def _load_model(path: str, modified_ns: int):
    try:
        default_config_dir = MODEL_PATH.parent.parent / ".ultralytics"
        if "YOLO_CONFIG_DIR" not in os.environ:
            (default_config_dir / "Ultralytics").mkdir(parents=True, exist_ok=True)
            os.environ["YOLO_CONFIG_DIR"] = str(default_config_dir)
        from ultralytics import YOLO

        return YOLO(path)
    except (ImportError, OSError, RuntimeError, ValueError) as exc:
        raise APIError(500, "INTERNAL_ERROR", "Model tìm mặt Rubik chưa sẵn sàng") from exc


def _model(model_path: Path | None = None):
    path = model_path or MODEL_PATH
    try:
        modified_ns = path.stat().st_mtime_ns
    except OSError as exc:
        raise APIError(500, "INTERNAL_ERROR", "Model tìm mặt Rubik chưa sẵn sàng") from exc
    return _load_model(str(path.resolve()), modified_ns)


def _array(value: object) -> np.ndarray:
    if hasattr(value, "detach"):
        value = value.detach()
    if hasattr(value, "cpu"):
        value = value.cpu()
    return np.asarray(value)


def locate_face(image_bgr: np.ndarray, *, model_path: Path | None = None) -> DetectedGrid:
    """Crop the strongest/largest face and return its canonical 3x3 cell grid."""
    if image_bgr.ndim != 3 or image_bgr.shape[2] != 3:
        raise ValueError("Expected a BGR image")
    model = _model(model_path)
    result = model.predict(source=image_bgr, conf=0.25, imgsz=384, verbose=False)[0]
    if result.names != {0: "face"}:
        raise APIError(500, "INTERNAL_ERROR", "Nhãn của model tìm mặt không hợp lệ")
    if result.boxes is None:
        raise ValueError("No Rubik face detected")
    boxes = _array(result.boxes.xyxy)
    confidences = _array(result.boxes.conf)
    classes = _array(result.boxes.cls)
    height, width = image_bgr.shape[:2]
    candidates = []
    for box, confidence, class_id in zip(boxes, confidences, classes, strict=True):
        if int(class_id) != 0:
            continue
        x0, y0, x1, y1 = map(float, box)
        area = max(0.0, x1 - x0) * max(0.0, y1 - y0)
        if area < 0.01 * width * height:
            continue
        candidates.append((area * float(confidence), (x0, y0, x1, y1)))
    if not candidates:
        raise ValueError("No Rubik face detected")
    _, (x0, y0, x1, y1) = max(candidates, key=lambda item: item[0])
    box_width, box_height = x1 - x0, y1 - y0
    x0 = max(0, int(x0 - FACE_PADDING * box_width))
    y0 = max(0, int(y0 - FACE_PADDING * box_height))
    x1 = min(width, int(x1 + FACE_PADDING * box_width + 0.999))
    y1 = min(height, int(y1 + FACE_PADDING * box_height + 0.999))
    if x1 - x0 < 30 or y1 - y0 < 30:
        raise ValueError("Rubik face crop is too small")
    face_image = cv2.resize(
        image_bgr[y0:y1, x0:x1], (FACE_SIZE, FACE_SIZE), interpolation=cv2.INTER_CUBIC
    )
    cell_size = FACE_SIZE // 3
    cells = [
        CellBox(col * cell_size, row * cell_size, cell_size, cell_size)
        for row in range(3) for col in range(3)
    ]
    corners = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype=np.float32)
    return DetectedGrid(face_image=face_image, cells=cells, corners=corners)
