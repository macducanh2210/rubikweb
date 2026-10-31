"""Measure face localization and nine-colour recognition on held-out raw photos."""

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import numpy as np

from app.services.detection.face_inference import locate_face
from app.services.detection.inference import classify_grid
from scripts.import_roboflow import _group, _image_for_label, _rows

LAZY_NAMES = ("blue", "face", "green", "orange", "red", "white", "yellow")


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    x0 = max(a[0], b[0])
    y0 = max(a[1], b[1])
    x1 = min(a[2], b[2])
    y1 = min(a[3], b[3])
    intersection = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return intersection / (area_a + area_b - intersection) if intersection else 0.0


def evaluate(
    manifest: Path,
    face_model: Path,
    color_model: Path,
    split: str = "test",
    lazycube_root: Path | None = None,
    all_source_variants: bool = False,
    color_imgsz: int = 384,
    color_augment: bool = True,
) -> dict[str, object]:
    with manifest.open(encoding="utf-8", newline="") as file:
        manifest_rows = [row for row in csv.DictReader(file)
                         if row["split"] == split and row["source_dataset"] == "lazy"]
    source_groups = {row["source_group"] for row in manifest_rows}
    if all_source_variants:
        if lazycube_root is None:
            raise ValueError("lazycube_root is required for all_source_variants")
        image_paths = []
        for export_split in ("train", "valid", "test"):
            label_dir = lazycube_root / export_split / "labels"
            for label_path in sorted(label_dir.glob("*.txt")):
                if _group(label_path) not in source_groups:
                    continue
                image_path = _image_for_label(label_path, lazycube_root / export_split / "images")
                if image_path is None:
                    raise ValueError(f"No image for {label_path}")
                image_paths.append(image_path)
    else:
        image_paths = [Path(row["source_image"]) for row in manifest_rows]
    if not image_paths:
        raise ValueError(f"No LazyCube images in {split} split of {manifest}")
    found = localized = valid_labels = detected = confident = exact = confident_exact = correct_cells = 0
    confident_exact_examples: list[str] = []
    misclassified_examples: list[dict[str, object]] = []
    invalid_alignment_examples: list[dict[str, object]] = []
    confusion: dict[str, Counter[str]] = defaultdict(Counter)
    group_results: dict[str, list[int]] = {}
    for image_path in image_paths:
        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError(f"Cannot read {image_path}")
        label_path = image_path.parent.parent / "labels" / f"{image_path.stem}.txt"
        rows = _rows(label_path, LAZY_NAMES)
        if rows is None:
            raise ValueError(f"Invalid labels in {label_path}")
        height, width = image.shape[:2]
        try:
            grid = locate_face(image, model_path=face_model)
        except ValueError:
            continue
        found += 1
        corners = grid.corners
        crop_box = (corners[0, 0] / width, corners[0, 1] / height,
                    corners[2, 0] / width, corners[2, 1] / height)
        faces = [row for row in rows if row[0] == 1]
        if not faces:
            continue
        def face_box(row: tuple[int, float, float, float, float]) -> tuple[float, float, float, float]:
            _, x, y, w, h = row
            return x - w / 2, y - h / 2, x + w / 2, y + h / 2
        face = max(faces, key=lambda row: _iou(crop_box, face_box(row)))
        if _iou(crop_box, face_box(face)) < 0.5:
            continue
        localized += 1
        fx0, fy0, fx1, fy1 = face_box(face)
        stickers = [row for row in rows if row[0] != 1 and fx0 <= row[1] <= fx1
                    and fy0 <= row[2] <= fy1]
        if len(stickers) != 9:
            if len(invalid_alignment_examples) < 8:
                invalid_alignment_examples.append({"image": image_path.name,
                                                   "reason": "sticker_count",
                                                   "count": len(stickers)})
            continue
        expected: list[str | None] = [None] * 9
        for class_id, x, y, _, _ in stickers:
            col = min(2, max(0, int((x - crop_box[0]) / (crop_box[2] - crop_box[0]) * 3)))
            row = min(2, max(0, int((y - crop_box[1]) / (crop_box[3] - crop_box[1]) * 3)))
            index = row * 3 + col
            if expected[index] is not None:
                break
            expected[index] = LAZY_NAMES[class_id]
        if any(color is None for color in expected):
            if len(invalid_alignment_examples) < 8:
                invalid_alignment_examples.append({"image": image_path.name,
                                                   "reason": "grid_assignment",
                                                   "assigned": sum(color is not None for color in expected)})
            continue
        valid_labels += 1
        group_counts = group_results.setdefault(_group(image_path), [0, 0, 0])
        group_counts[0] += 1
        try:
            predicted, confidence = classify_grid(grid, model_path=color_model,
                                                   imgsz=color_imgsz, augment=color_augment)
        except ValueError:
            continue
        detected += 1
        confident += confidence >= 0.7
        correct = sum(a == b for a, b in zip(predicted, expected, strict=True))
        for truth, guess in zip(expected, predicted, strict=True):
            assert truth is not None
            confusion[truth][guess] += 1
        if correct != 9 and len(misclassified_examples) < 8:
            hsv_face = cv2.cvtColor(grid.face_image, cv2.COLOR_BGR2HSV)
            errors = []
            for index, (truth, guess) in enumerate(zip(expected, predicted, strict=True)):
                if truth == guess:
                    continue
                cell = grid.cells[index]
                patch = hsv_face[
                    cell.y + round(cell.height * 0.35):cell.y + round(cell.height * 0.65),
                    cell.x + round(cell.width * 0.35):cell.x + round(cell.width * 0.65),
                ]
                median_hsv = np.median(patch.reshape(-1, 3), axis=0).tolist()
                errors.append({"cell": index, "truth": truth, "guess": guess,
                               "median_hsv": median_hsv})
            misclassified_examples.append({"image": image_path.name, "expected": expected,
                                           "predicted": predicted, "confidence": confidence,
                                           "errors": errors})
        correct_cells += correct
        exact += correct == 9
        confident_exact += correct == 9 and confidence >= 0.7
        group_counts[1] += correct == 9
        group_counts[2] += correct == 9 and confidence >= 0.7
        if correct == 9 and confidence >= 0.7 and len(confident_exact_examples) < 3:
            confident_exact_examples.append(image_path.name)
    return {
        "raw_images": len(image_paths),
        "source_groups": len({_group(path) for path in image_paths}),
        "face_found": found,
        "face_iou_at_least_0_5": localized,
        "nine_ground_truth_cells_align": valid_labels,
        "nine_stickers_detected": detected,
        "passes_contract_confidence": confident,
        "exact_faces": exact,
        "confident_exact_faces": confident_exact,
        "sticker_accuracy_on_aligned_images": round(correct_cells / (9 * valid_labels), 4)
        if valid_labels else 0.0,
        "mean_exact_face_rate_per_evaluable_group": round(
            sum(counts[1] / counts[0] for counts in group_results.values()) / len(group_results), 4
        ) if group_results else 0.0,
        "mean_confident_exact_face_rate_per_evaluable_group": round(
            sum(counts[2] / counts[0] for counts in group_results.values()) / len(group_results), 4
        ) if group_results else 0.0,
        "groups_with_evaluable_annotations": len(group_results),
        "confident_exact_examples": confident_exact_examples,
        "confusion_by_expected_color": {color: dict(confusion[color]) for color in LAZY_NAMES if color != "face"},
        "misclassified_examples": misclassified_examples,
        "invalid_alignment_examples": invalid_alignment_examples,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--face-model", type=Path, required=True)
    parser.add_argument("--color-model", type=Path, required=True)
    parser.add_argument("--split", choices=("train", "val", "test"), default="test")
    parser.add_argument("--lazycube-root", type=Path,
                        help="Root of the original LazyCube Roboflow export")
    parser.add_argument("--all-source-variants", action="store_true",
                        help="Evaluate every original export variant in this leakage-safe source split")
    parser.add_argument("--color-imgsz", type=int, default=384,
                        help="YOLO sticker inference size (default: 384)")
    parser.add_argument("--color-augment", action=argparse.BooleanOptionalAction,
                        default=True,
                        help="Enable YOLO test-time augmentation for colour detection")
    parser.add_argument("--diagnostics", action="store_true",
                        help="Include confusion matrix and sample-level errors")
    args = parser.parse_args()
    result = evaluate(args.manifest, args.face_model, args.color_model, args.split,
                      args.lazycube_root, args.all_source_variants,
                      args.color_imgsz, args.color_augment)
    if not args.diagnostics:
        for key in ("confident_exact_examples", "confusion_by_expected_color",
                    "misclassified_examples", "invalid_alignment_examples"):
            result.pop(key)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
