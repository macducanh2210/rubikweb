"""YOLOv8 sticker detection on the perspective-corrected Rubik face."""

from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path

import cv2
import numpy as np

from app.core.errors import APIError
from app.services.detection.grid_detection import DetectedGrid

MODEL_PATH = Path(__file__).resolve().parents[3] / "models" / "best.pt"
COLORS = ("white", "yellow", "red", "orange", "blue", "green")


@dataclass(frozen=True)
class StickerDetection:
    """Pixel-space xyxy bounding box, colour and model confidence."""

    bbox: tuple[float, float, float, float]
    color: str
    confidence: float


@lru_cache(maxsize=2)
def _load_model(path: str, modified_ns: int):
    # The timestamp is part of the cache key so a newly trained checkpoint reloads.
    try:
        default_config_dir = MODEL_PATH.parent.parent / ".ultralytics"
        if "YOLO_CONFIG_DIR" not in os.environ:
            (default_config_dir / "Ultralytics").mkdir(parents=True, exist_ok=True)
            os.environ["YOLO_CONFIG_DIR"] = str(default_config_dir)
        from ultralytics import YOLO

        return YOLO(path)
    except (ImportError, OSError, RuntimeError, ValueError) as exc:
        raise APIError(500, "INTERNAL_ERROR", "Model nhận diện chưa sẵn sàng") from exc


def _model(model_path: Path):
    try:
        modified_ns = model_path.stat().st_mtime_ns
    except OSError as exc:
        raise APIError(500, "INTERNAL_ERROR", "Model nhận diện chưa sẵn sàng") from exc
    return _load_model(str(model_path.resolve()), modified_ns)


def _array(value: object) -> np.ndarray:
    if hasattr(value, "detach"):
        value = value.detach()
    if hasattr(value, "cpu"):
        value = value.cpu()
    return np.asarray(value)


def predict_stickers(
    image_bgr: np.ndarray,
    *,
    model_path: Path | None = None,
    imgsz: int = 384,
    augment: bool = False,
) -> list[StickerDetection]:
    """Return all sticker predictions from a rectified face image.

    The model is trained on the six exact English colour names used by the API.
    This function deliberately does not fall back to HSV when no checkpoint exists.
    """
    if image_bgr.ndim != 3 or image_bgr.shape[2] != 3:
        raise ValueError("Expected a BGR image")
    model = _model(model_path or MODEL_PATH)
    result = model.predict(source=image_bgr, conf=0.05, imgsz=imgsz,
                           augment=augment, verbose=False)[0]
    names = result.names
    if set(names.values() if isinstance(names, dict) else names) != set(COLORS):
        raise APIError(500, "INTERNAL_ERROR", "Nhãn màu của model không hợp lệ")
    if result.boxes is None:
        return []
    coordinates = _array(result.boxes.xyxy)
    confidences = _array(result.boxes.conf)
    classes = _array(result.boxes.cls)
    predictions: list[StickerDetection] = []
    for bbox, confidence, class_id in zip(coordinates, confidences, classes, strict=True):
        class_index = int(class_id)
        try:
            color = names[class_index]
        except (IndexError, KeyError, TypeError) as exc:
            raise APIError(500, "INTERNAL_ERROR", "Nhãn màu của model không hợp lệ") from exc
        x1, y1, x2, y2 = (float(value) for value in bbox)
        if not (0 <= x1 < x2 <= image_bgr.shape[1] and 0 <= y1 < y2 <= image_bgr.shape[0]):
            continue
        predictions.append(
            StickerDetection((x1, y1, x2, y2), color, round(float(confidence), 4))
        )
    return predictions


def classify_grid(
    grid: DetectedGrid,
    *,
    model_path: Path | None = None,
    imgsz: int = 384,
    augment: bool = True,
) -> tuple[list[str], float]:
    """Choose one YOLO sticker per cell and calibrate vivid red/orange evidence.

    Test-time augmentation improves robustness to source-photo variants. YOLO
    is still required to locate all nine stickers. The narrow HSV checks
    correct overexposed orange predicted as yellow and calibrate confidence for
    vivid orange/red stickers; they are not a model-free fallback.
    """
    detections = predict_stickers(grid.face_image, model_path=model_path,
                                  imgsz=imgsz, augment=augment)
    hsv_image = cv2.cvtColor(grid.face_image, cv2.COLOR_BGR2HSV)
    colors: list[str] = []
    confidences: list[float] = []
    for cell in grid.cells:
        matches = [
            item
            for item in detections
            if cell.x <= (item.bbox[0] + item.bbox[2]) / 2 < cell.x + cell.width
            and cell.y <= (item.bbox[1] + item.bbox[3]) / 2 < cell.y + cell.height
        ]
        if not matches:
            raise ValueError("YOLO did not detect all nine stickers")
        best = max(matches, key=lambda item: item.confidence)
        # Sample the sticker's central 30%, away from borders and glare edges.
        x0 = cell.x + round(cell.width * 0.35)
        x1 = cell.x + round(cell.width * 0.65)
        y0 = cell.y + round(cell.height * 0.35)
        y1 = cell.y + round(cell.height * 0.65)
        patch = hsv_image[y0:y1, x0:x1]
        if patch.size:
            hue, saturation, value = np.median(patch.reshape(-1, 3), axis=0)
        else:
            hue = saturation = value = 0
        vivid_orange = 10 <= hue <= 20 and saturation >= 220 and value >= 245
        vivid_red = (hue <= 2 or hue >= 177) and saturation >= 200 and value >= 245
        color = best.color
        confidence = best.confidence
        if color == "yellow" and vivid_orange:
            color = "orange"
            confidence = max(confidence, 0.75)
        elif (color == "orange" and vivid_orange) or (color == "red" and vivid_red):
            confidence = max(confidence, 0.75)
        colors.append(color)
        confidences.append(confidence)
    return colors, round(min(confidences), 4)
