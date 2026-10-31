"""Standalone image-pipeline check for test_images/{U,D,F,B,L,R}.{png,jpg,jpeg}.

Run from be/: python scripts/check_detection.py
Use --generate-samples once to create six synthetic solved-face images.
"""

import argparse
from pathlib import Path
import sys

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.detection.color_classification import classify_grid  # noqa: E402
from app.services.detection.cube_state_builder import FaceResult, build_cube_state  # noqa: E402
from app.services.detection.grid_detection import detect_grid  # noqa: E402
from app.services.detection.preprocessing import preprocess_image  # noqa: E402

SAMPLE_COLORS = {
    "U": "white",
    "D": "yellow",
    "F": "green",
    "B": "blue",
    "L": "orange",
    "R": "red",
}
SAMPLE_BGR = {
    "white": (245, 245, 245),
    "yellow": (0, 255, 255),
    "green": (0, 220, 0),
    "blue": (255, 0, 0),
    "orange": (0, 128, 255),
    "red": (0, 0, 255),
}


def generate_samples(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for face, color in SAMPLE_COLORS.items():
        image = np.full((500, 500, 3), 180, dtype=np.uint8)
        cv2.rectangle(image, (68, 68), (432, 432), (15, 15, 15), -1)
        for row in range(3):
            for col in range(3):
                x0 = 74 + col * 120
                y0 = 74 + row * 120
                cv2.rectangle(
                    image,
                    (x0, y0),
                    (x0 + 110, y0 + 110),
                    SAMPLE_BGR[color],
                    -1,
                )
        output = directory / f"{face}.png"
        if not cv2.imwrite(str(output), image):
            raise RuntimeError(f"Could not write {output}")
        print(f"Generated {output}")


def run_pipeline(directory: Path) -> None:
    results: list[FaceResult] = []
    for index, face in enumerate(SAMPLE_COLORS, start=1):
        path = next(
            (directory / f"{face}.{suffix}" for suffix in ("png", "jpg", "jpeg")
             if (directory / f"{face}.{suffix}").is_file()),
            None,
        )
        if path is None:
            raise FileNotFoundError(f"Missing image for {face} in {directory}")
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Unreadable image: {path}")
        grid = detect_grid(preprocess_image(image))
        colors, confidence = classify_grid(grid)
        print(f"{face}: {colors} confidence={confidence:.4f}")
        results.append(FaceResult(face, index, colors, confidence))
    state, confidence = build_cube_state(results)
    print(f"Cube state: {state}")
    print(f"Cube confidence: {confidence:.4f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--directory",
        type=Path,
        default=ROOT / "test_images",
        help="Directory containing six face images named U,D,F,B,L,R",
    )
    parser.add_argument(
        "--generate-samples",
        action="store_true",
        help="Create synthetic solved-face PNGs before testing",
    )
    args = parser.parse_args()
    if args.generate_samples:
        generate_samples(args.directory)
    run_pipeline(args.directory)
