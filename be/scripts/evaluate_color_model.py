"""Evaluate exact 3x3 face recognition, not just YOLO box mAP."""

import argparse
from collections import Counter
import json
from pathlib import Path

import cv2
import numpy as np

from app.services.detection.grid_detection import FACE_SIZE, CellBox, DetectedGrid
from app.services.detection.inference import COLORS, classify_grid


def evaluate(data_root: Path, model_path: Path, split: str = "test") -> dict[str, object]:
    image_dir = data_root / "images" / split
    label_dir = data_root / "labels" / split
    images = sorted(image_dir.glob("*.png"))
    if not images:
        raise ValueError(f"No images in {image_dir}")
    cell_size = FACE_SIZE // 3
    cells = [CellBox(col * cell_size, row * cell_size, cell_size, cell_size)
             for row in range(3) for col in range(3)]
    detected = confident = exact_faces = confident_exact_faces = correct_stickers = invalid_labels = 0
    confidence_scores: list[float] = []
    confusion: Counter[str] = Counter()
    error_examples: list[dict[str, object]] = []
    for image_path in images:
        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError(f"Could not read {image_path}")
        expected = [None] * 9
        valid_labels = True
        for line in (label_dir / f"{image_path.stem}.txt").read_text().splitlines():
            class_id, x, y, _, _ = line.split()
            cell_index = min(2, int(float(y) * 3)) * 3 + min(2, int(float(x) * 3))
            if expected[cell_index] is not None:
                valid_labels = False
                break
            expected[cell_index] = COLORS[int(class_id)]
        if not valid_labels or any(color is None for color in expected):
            invalid_labels += 1
            continue
        grid = DetectedGrid(image, cells, corners=np.zeros((4, 2), dtype=np.float32))
        try:
            predicted, confidence = classify_grid(grid, model_path=model_path)
        except ValueError:
            continue
        detected += 1
        confidence_scores.append(confidence)
        confident += confidence >= 0.7
        correct = sum(a == b for a, b in zip(predicted, expected, strict=True))
        for actual, guessed in zip(expected, predicted, strict=True):
            if actual != guessed:
                confusion[f"{actual}->{guessed}"] += 1
        if correct < 9 and len(error_examples) < 10:
            error_examples.append({
                "image": image_path.name,
                "expected": expected,
                "predicted": predicted,
                "confidence": confidence,
            })
        correct_stickers += correct
        exact_faces += correct == 9
        confident_exact_faces += correct == 9 and confidence >= 0.7
    return {
        "images": len(images),
        "invalid_labels_skipped": invalid_labels,
        "valid_images": len(images) - invalid_labels,
        "nine_stickers_detected": detected,
        "passes_contract_confidence": confident,
        "exact_faces": exact_faces,
        "confident_exact_faces": confident_exact_faces,
        "sticker_accuracy_on_valid_images": round(correct_stickers / (9 * (len(images) - invalid_labels)), 4)
        if len(images) > invalid_labels else 0.0,
        "mean_min_confidence_detected": round(sum(confidence_scores) / detected, 4) if detected else 0.0,
        "confusion": dict(confusion.most_common()),
        "error_examples": error_examples,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--split", choices=("train", "val", "test"), default="test")
    args = parser.parse_args()
    print(json.dumps(evaluate(args.data, args.model, args.split), indent=2))


if __name__ == "__main__":
    main()
