"""Prepare colour and contrast views without altering sticker hues."""

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class PreparedImage:
    color: np.ndarray
    gray: np.ndarray


def preprocess_image(image: np.ndarray, max_side: int = 1200) -> PreparedImage:
    if image is None or image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("Invalid BGR image")
    height, width = image.shape[:2]
    if min(height, width) < 90:
        raise ValueError("Image is too small")

    scale = min(1.0, max_side / max(height, width))
    if scale < 1.0:
        image = cv2.resize(
            image,
            (round(width * scale), round(height * scale)),
            interpolation=cv2.INTER_AREA,
        )
    color = cv2.GaussianBlur(image, (5, 5), 0)
    gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    return PreparedImage(color=color, gray=gray)
