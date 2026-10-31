"""Locate a quadrilateral face and return its nine cell rectangles."""

from dataclasses import dataclass

import cv2
import numpy as np

from app.services.detection.preprocessing import PreparedImage

FACE_SIZE = 360


@dataclass(frozen=True)
class CellBox:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class DetectedGrid:
    face_image: np.ndarray
    cells: list[CellBox]
    corners: np.ndarray


def _ordered_corners(points: np.ndarray) -> np.ndarray:
    points = points.reshape(4, 2).astype(np.float32)
    ordered = np.zeros((4, 2), dtype=np.float32)
    sums = points.sum(axis=1)
    differences = np.diff(points, axis=1).ravel()
    ordered[0] = points[np.argmin(sums)]  # top-left
    ordered[2] = points[np.argmax(sums)]  # bottom-right
    ordered[1] = points[np.argmin(differences)]  # top-right
    ordered[3] = points[np.argmax(differences)]  # bottom-left
    if len({tuple(point) for point in ordered}) != 4:
        raise ValueError("Degenerate quadrilateral")
    return ordered


def detect_grid(prepared: PreparedImage) -> DetectedGrid:
    edges = cv2.Canny(prepared.gray, 60, 160)
    edges = cv2.morphologyEx(
        edges,
        cv2.MORPH_CLOSE,
        np.ones((5, 5), dtype=np.uint8),
    )
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    image_area = prepared.gray.shape[0] * prepared.gray.shape[1]
    candidates: list[tuple[float, np.ndarray]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if not 0.08 * image_area <= area <= 0.92 * image_area:
            continue
        perimeter = cv2.arcLength(contour, True)
        polygon = cv2.approxPolyDP(contour, 0.025 * perimeter, True)
        if len(polygon) != 4 or not cv2.isContourConvex(polygon):
            continue
        corners = _ordered_corners(polygon)
        top = np.linalg.norm(corners[1] - corners[0])
        bottom = np.linalg.norm(corners[2] - corners[3])
        left = np.linalg.norm(corners[3] - corners[0])
        right = np.linalg.norm(corners[2] - corners[1])
        horizontal = (top + bottom) / 2
        vertical = (left + right) / 2
        if min(horizontal, vertical) < 60:
            continue
        if not 0.60 <= horizontal / vertical <= 1.65:
            continue
        candidates.append((area, corners))

    if not candidates:
        raise ValueError("Rubik face contour not found")
    _, corners = max(candidates, key=lambda item: item[0])
    destination = np.array(
        [[0, 0], [FACE_SIZE - 1, 0], [FACE_SIZE - 1, FACE_SIZE - 1], [0, FACE_SIZE - 1]],
        dtype=np.float32,
    )
    transform = cv2.getPerspectiveTransform(corners, destination)
    face_image = cv2.warpPerspective(prepared.color, transform, (FACE_SIZE, FACE_SIZE))
    cell_size = FACE_SIZE // 3
    cells = [
        CellBox(col * cell_size, row * cell_size, cell_size, cell_size)
        for row in range(3)
        for col in range(3)
    ]
    return DetectedGrid(face_image=face_image, cells=cells, corners=corners)
