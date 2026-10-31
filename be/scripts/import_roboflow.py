"""Convert the supplied LazyCube/Yumi exports into leakage-safe YOLO face data.

Run from the backend root: ``python -m scripts.import_roboflow --lazycube ... --yumi ...``.
The Yumi export is derived from LazyCube source photos. Split by the common
source-photo name, never by Roboflow's augmented ``.rf.<hash>`` file name.
"""

import argparse
import csv
import hashlib
import json
import random
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import yaml

from scripts.prepare_dataset import COLORS, _augmentation, _write_labels

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FACE_SIZE = 360


@dataclass(frozen=True)
class Candidate:
    group: str
    image_path: Path
    face_box: tuple[float, float, float, float] | None
    stickers: tuple[tuple[int, float, float, float, float], ...]
    score: float


def _read_image(path: Path) -> np.ndarray | None:
    return cv2.imdecode(np.frombuffer(path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)


def _rows(path: Path, class_names: tuple[str, ...]) -> list[tuple[int, float, float, float, float]] | None:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        values = line.split()
        if len(values) != 5:
            return None
        try:
            class_index = int(values[0])
            x, y, width, height = map(float, values[1:])
        except ValueError:
            return None
        if not 0 <= class_index < len(class_names) or not (
            0 <= x <= 1 and 0 <= y <= 1 and 0 < width <= 1 and 0 < height <= 1
        ):
            return None
        rows.append((class_index, x, y, width, height))
    return rows


def _group(path: Path) -> str:
    return path.stem.split(".rf.", 1)[0]


def _image_for_label(label: Path, image_dir: Path) -> Path | None:
    for suffix in (".jpg", ".jpeg", ".png"):
        path = image_dir / f"{label.stem}{suffix}"
        if path.is_file():
            return path
    return None


def _lazy_candidates(root: Path) -> dict[str, list[Candidate]]:
    class_names = ("blue", "face", "green", "orange", "red", "white", "yellow")
    candidates: dict[str, list[Candidate]] = defaultdict(list)
    for split in ("train", "valid", "test"):
        for label_path in (root / split / "labels").glob("*.txt"):
            image_path = _image_for_label(label_path, root / split / "images")
            rows = _rows(label_path, class_names)
            if image_path is None or rows is None:
                continue
            image = _read_image(image_path)
            if image is None:
                continue
            height, width = image.shape[:2]
            faces = [row for row in rows if row[0] == 1]
            stickers = [row for row in rows if row[0] != 1]
            for face in faces:
                _, fx, fy, fw, fh = face
                inside = [
                    row for row in stickers
                    if abs(row[1] - fx) <= fw / 2 and abs(row[2] - fy) <= fh / 2
                ]
                if len(inside) != 9:
                    continue
                positions = {
                    (min(2, int(3 * (row[1] - (fx - fw / 2)) / fw)),
                     min(2, int(3 * (row[2] - (fy - fh / 2)) / fh)))
                    for row in inside
                }
                if len(positions) != 9:
                    continue
                pixel_width, pixel_height = fw * width, fh * height
                if min(pixel_width, pixel_height) < 70:
                    continue
                rectangularity = min(pixel_width, pixel_height) / max(pixel_width, pixel_height)
                score = pixel_width * pixel_height * rectangularity
                mapped = tuple(
                    (COLORS.index(class_names[row[0]]), *row[1:]) for row in inside
                )
                candidates[_group(label_path)].append(
                    Candidate(_group(label_path), image_path, tuple(face[1:]), mapped, score)
                )
    return candidates


def _yumi_candidates(root: Path) -> dict[str, list[Candidate]]:
    class_names = ("blue", "green", "orange", "red", "white", "yellow")
    candidates: dict[str, list[Candidate]] = defaultdict(list)
    for split in ("train", "valid", "test"):
        for label_path in (root / split / "labels").glob("*.txt"):
            image_path = _image_for_label(label_path, root / split / "images")
            rows = _rows(label_path, class_names)
            if image_path is None or rows is None or len(rows) != 9:
                continue
            # Prefer versions with fewer clipped boxes; they keep more colour evidence.
            unclipped = sum(
                x - w / 2 > 0.01 and x + w / 2 < 0.99
                and y - h / 2 > 0.01 and y + h / 2 < 0.99
                for _, x, y, w, h in rows
            )
            mapped = tuple((COLORS.index(class_names[row[0]]), *row[1:]) for row in rows)
            candidates[_group(label_path)].append(
                Candidate(_group(label_path), image_path, None, mapped, float(unclipped))
            )
    return candidates


def _crop_lazy(candidate: Candidate) -> tuple[np.ndarray, list[int], list[tuple[float, float, float, float]]]:
    image = _read_image(candidate.image_path)
    if image is None or candidate.face_box is None:
        raise ValueError("Invalid LazyCube image")
    height, width = image.shape[:2]
    fx, fy, fw, fh = candidate.face_box
    pad = 0.035
    x0 = max(0, int((fx - fw * (0.5 + pad)) * width))
    y0 = max(0, int((fy - fh * (0.5 + pad)) * height))
    x1 = min(width, int((fx + fw * (0.5 + pad)) * width + 0.999))
    y1 = min(height, int((fy + fh * (0.5 + pad)) * height + 0.999))
    if x1 - x0 < 70 or y1 - y0 < 70:
        raise ValueError("Face crop is too small")
    crop = cv2.resize(image[y0:y1, x0:x1], (FACE_SIZE, FACE_SIZE), interpolation=cv2.INTER_CUBIC)
    classes = []
    boxes = []
    for class_id, x, y, box_width, box_height in candidate.stickers:
        bx0 = max(x0, (x - box_width / 2) * width)
        by0 = max(y0, (y - box_height / 2) * height)
        bx1 = min(x1, (x + box_width / 2) * width)
        by1 = min(y1, (y + box_height / 2) * height)
        if bx1 <= bx0 or by1 <= by0:
            raise ValueError("Sticker outside face crop")
        classes.append(class_id)
        boxes.append(
            ((bx0 + bx1 - 2 * x0) / (2 * (x1 - x0)),
             (by0 + by1 - 2 * y0) / (2 * (y1 - y0)),
             (bx1 - bx0) / (x1 - x0),
             (by1 - by0) / (y1 - y0))
        )
    positions = {
        (min(2, int(3 * x)), min(2, int(3 * y)))
        for x, y, _, _ in boxes
    }
    if len(positions) != 9:
        raise ValueError("Cropped face does not have one sticker in each grid cell")
    return crop, classes, boxes


def _resize_yumi(candidate: Candidate) -> tuple[np.ndarray, list[int], list[tuple[float, float, float, float]]]:
    image = _read_image(candidate.image_path)
    if image is None:
        raise ValueError("Invalid Yumi image")
    image = cv2.resize(image, (FACE_SIZE, FACE_SIZE), interpolation=cv2.INTER_CUBIC)
    return image, [row[0] for row in candidate.stickers], [tuple(row[1:]) for row in candidate.stickers]


def _save(
    output: Path,
    split: str,
    stem: str,
    image: np.ndarray,
    classes: list[int],
    boxes: list[tuple[float, float, float, float]],
) -> None:
    if len(classes) != 9 or len(boxes) != 9:
        raise ValueError("Each face needs exactly nine sticker labels")
    image_dir = output / "images" / split
    label_dir = output / "labels" / split
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    success, encoded = cv2.imencode(".png", image)
    if not success:
        raise ValueError("Could not encode face crop")
    (image_dir / f"{stem}.png").write_bytes(encoded.tobytes())
    _write_labels(label_dir / f"{stem}.txt", classes, boxes)


def import_datasets(
    lazycube: Path,
    yumi: Path,
    output: Path,
    *,
    seed: int = 42,
    augmentations_per_image: int = 1,
    split_manifest: Path | None = None,
    all_train_variants: bool = False,
) -> dict[str, int]:
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output directory is not empty: {output}")
    if augmentations_per_image < 0:
        raise ValueError("augmentations_per_image must be non-negative")
    lazy = _lazy_candidates(lazycube)
    yumi_candidates = _yumi_candidates(yumi)
    selected: dict[str, tuple[Candidate, np.ndarray, list[int], list[tuple[float, float, float, float]]]] = {}
    for key, options in lazy.items():
        for candidate in sorted(options, key=lambda item: item.score, reverse=True):
            try:
                image, classes, boxes = _crop_lazy(candidate)
                selected[key] = (candidate, image, classes, boxes)
                break
            except ValueError:
                continue
    keys = sorted(selected)
    if len(keys) < 7:
        raise ValueError("Not enough nine-sticker LazyCube source photos")
    if split_manifest is None:
        random.Random(seed).shuffle(keys)
        n_train = round(len(keys) * 0.70)
        n_val = max(1, round(len(keys) * 0.15))
        splits = {
            "train": keys[:n_train],
            "val": keys[n_train:n_train + n_val],
            "test": keys[n_train + n_val:],
        }
    else:
        with split_manifest.open(encoding="utf-8", newline="") as file:
            assignments = {row["source_group"]: row["split"] for row in csv.DictReader(file)}
        unknown = set(keys) - set(assignments)
        if unknown:
            raise ValueError(f"Source groups missing from split manifest: {sorted(unknown)[:5]}")
        if any(assignments[key] not in ("train", "val", "test") for key in keys):
            raise ValueError("Invalid split name in split manifest")
        splits = {split: [key for key in keys if assignments[key] == split]
                  for split in ("train", "val", "test")}
    augmentation = _augmentation(seed) if augmentations_per_image else None
    manifest_rows = []
    counts = {"train": 0, "val": 0, "test": 0}
    for split, split_keys in splits.items():
        for key in split_keys:
            stem = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
            candidate, image, classes, boxes = selected[key]
            _save(output, split, f"{stem}_lazy", image, classes, boxes)
            counts[split] += 1
            manifest_rows.append((key, split, "lazy", str(candidate.image_path)))
            if split != "train":
                continue
            if all_train_variants:
                variants = sorted(lazy[key], key=lambda item: (str(item.image_path), item.face_box or ()))
                for index, variant in enumerate(variants):
                    if variant == candidate:
                        continue
                    try:
                        variant_image, variant_classes, variant_boxes = _crop_lazy(variant)
                    except ValueError:
                        continue
                    _save(output, split, f"{stem}_lazy_variant{index + 1}",
                          variant_image, variant_classes, variant_boxes)
                    counts[split] += 1
                    manifest_rows.append((key, split, "lazy", str(variant.image_path)))
            if augmentation is not None:
                for index in range(augmentations_per_image):
                    augmented = augmentation(image=image, bboxes=boxes, class_labels=classes)
                    aug_boxes = [tuple(map(float, row)) for row in augmented["bboxes"]]
                    aug_classes = [int(value) for value in augmented["class_labels"]]
                    _save(output, split, f"{stem}_aug{index + 1}", augmented["image"], aug_classes, aug_boxes)
                    counts[split] += 1
            if key in yumi_candidates:
                yumi_candidate = max(yumi_candidates[key], key=lambda item: item.score)
                yumi_image, yumi_classes, yumi_boxes = _resize_yumi(yumi_candidate)
                _save(output, split, f"{stem}_yumi", yumi_image, yumi_classes, yumi_boxes)
                counts[split] += 1
                manifest_rows.append((key, split, "yumi", str(yumi_candidate.image_path)))

    output.mkdir(parents=True, exist_ok=True)
    with (output / "source_manifest.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(("source_group", "split", "source_dataset", "source_image"))
        writer.writerows(manifest_rows)
    (output / "data.yaml").write_text(
        yaml.safe_dump(
            {"path": output.resolve().as_posix(), "train": "images/train", "val": "images/val", "test": "images/test", "names": dict(enumerate(COLORS))},
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    (output / "stats.json").write_text(
        json.dumps({"source_groups": len(keys), "skipped_source_groups": len(lazy) - len(keys), "image_counts": counts, "seed": seed}, indent=2),
        encoding="utf-8",
    )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lazycube", type=Path, required=True)
    parser.add_argument("--yumi", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "datasets" / "roboflow_processed")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--augmentations-per-image", type=int, default=1)
    parser.add_argument("--split-manifest", type=Path, help="Preserve existing source-group split assignments")
    parser.add_argument("--all-train-variants", action="store_true",
                        help="Include every valid LazyCube variant from train source groups only")
    args = parser.parse_args()
    counts = import_datasets(
        args.lazycube, args.yumi, args.output,
        seed=args.seed, augmentations_per_image=args.augmentations_per_image,
        split_manifest=args.split_manifest,
        all_train_variants=args.all_train_variants,
    )
    print(f"Prepared YOLO images: {counts}")
    print(f"Dataset config: {args.output / 'data.yaml'}")


if __name__ == "__main__":
    main()
