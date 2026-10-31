"""Classify sticker colours with circular Euclidean HSV distance."""

import cv2
import numpy as np

from app.services.detection.grid_detection import DetectedGrid

# OpenCV HSV coordinates: hue 0..179, saturation/value 0..255.
REFERENCE_HSV = {
    "white": (0, 0, 245),
    "yellow": (30, 255, 255),
    "red": (0, 255, 255),
    "orange": (15, 255, 255),
    "blue": (120, 255, 255),
    "green": (60, 255, 220),
}


def _hsv_distance(hsv: tuple[float, float, float], reference: tuple[int, int, int]) -> float:
    hue, saturation, value = hsv
    ref_hue, ref_saturation, ref_value = reference
    hue_distance = min(abs(hue - ref_hue), 180 - abs(hue - ref_hue))
    # Hue is unstable for nearly achromatic pixels, so white relies on S/V.
    if ref_saturation == 0 or saturation < 45:
        hue_distance = 0 if ref_saturation == 0 else hue_distance
    return float(
        np.linalg.norm(
            [hue_distance / 90, (saturation - ref_saturation) / 255, (value - ref_value) / 255]
        )
    )


def classify_grid(grid: DetectedGrid) -> tuple[list[str], float]:
    colors: list[str] = []
    confidences: list[float] = []
    for cell in grid.cells:
        # Sample the central 50% to avoid borders and neighbouring stickers.
        x0 = cell.x + cell.width // 4
        x1 = cell.x + 3 * cell.width // 4
        y0 = cell.y + cell.height // 4
        y1 = cell.y + 3 * cell.height // 4
        patch = grid.face_image[y0:y1, x0:x1]
        if patch.size == 0:
            raise ValueError("Empty sticker patch")
        average_bgr = np.mean(patch, axis=(0, 1)).round().astype(np.uint8)
        hsv = cv2.cvtColor(average_bgr[None, None, :], cv2.COLOR_BGR2HSV)[0, 0]
        hsv_tuple = tuple(float(channel) for channel in hsv)
        distances = sorted(
            (_hsv_distance(hsv_tuple, reference), name)
            for name, reference in REFERENCE_HSV.items()
        )
        best_distance, best_name = distances[0]
        second_distance = distances[1][0]
        confidence = max(0.0, min(1.0, 1.0 - best_distance / 0.55))
        confidence *= max(0.0, min(1.0, (second_distance - best_distance) / 0.10))
        colors.append(best_name)
        confidences.append(confidence)
    return colors, round(float(min(confidences)), 4)
