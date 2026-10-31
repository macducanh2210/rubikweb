"""Build supervised YOLO colour crops from corrected personal Rubik photos.

The existing YOLO models locate each face/sticker; expected.json supplies the
human-checked colour labels. Only the generated training images are augmented.
Public validation/test photos remain unchanged and separate from this source.
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import yaml

from app.services.detection.face_inference import locate_face
from app.services.detection.inference import predict_stickers
from scripts.prepare_dataset import COLORS, _augmentation, _write_labels

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def prepare(
    source: Path,
    public_data: Path,
    output: Path,
    *,
    augmentations_per_image: int = 20,
    seed: int = 42,
) -> int:
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output directory is not empty: {output}")
    if augmentations_per_image < 0:
        raise ValueError("augmentations_per_image must be non-negative")
    if not (public_data / "images" / "train").is_dir():
        raise FileNotFoundError(f"Public train split is missing: {public_data}")
    expected = json.loads((source / "expected.json").read_text(encoding="utf-8"))
    augmentation = _augmentation(seed) if augmentations_per_image else None
    image_dir = output / "images" / "train"
    label_dir = output / "labels" / "train"
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    saved = 0
    for name, colors in sorted(expected.items()):
        if len(colors) != 9 or any(color not in COLORS for color in colors):
            raise ValueError(f"Expected exactly nine valid colours for {name}")
        path = source / "images" / name
        image = cv2.imdecode(np.frombuffer(path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Cannot decode {path}")
        grid = locate_face(image)
        detections = predict_stickers(grid.face_image)
        boxes = []
        for cell in grid.cells:
            matches = [
                detection for detection in detections
                if cell.x <= (detection.bbox[0] + detection.bbox[2]) / 2 < cell.x + cell.width
                and cell.y <= (detection.bbox[1] + detection.bbox[3]) / 2 < cell.y + cell.height
            ]
            if not matches:
                raise ValueError(f"A sticker is missing from {name}")
            x0, y0, x1, y1 = max(matches, key=lambda item: item.confidence).bbox
            width = grid.face_image.shape[1]
            height = grid.face_image.shape[0]
            boxes.append(((x0 + x1) / (2 * width), (y0 + y1) / (2 * height),
                          (x1 - x0) / width, (y1 - y0) / height))
        classes = [COLORS.index(color) for color in colors]
        stem = Path(name).stem
        if not cv2.imwrite(str(image_dir / f"{stem}_orig.png"), grid.face_image):
            raise ValueError(f"Cannot save cropped face from {name}")
        _write_labels(label_dir / f"{stem}_orig.txt", classes, boxes)
        saved += 1
        if augmentation is not None:
            for index in range(augmentations_per_image):
                transformed = augmentation(image=grid.face_image, bboxes=boxes, class_labels=classes)
                aug_boxes = [tuple(map(float, box)) for box in transformed["bboxes"]]
                aug_classes = [int(value) for value in transformed["class_labels"]]
                if len(aug_boxes) != 9:
                    raise ValueError(f"Augmentation lost a sticker in {name}")
                aug_stem = f"{stem}_aug{index + 1:02d}"
                if not cv2.imwrite(str(image_dir / f"{aug_stem}.png"), transformed["image"]):
                    raise ValueError(f"Cannot save augmented face from {name}")
                _write_labels(label_dir / f"{aug_stem}.txt", aug_classes, aug_boxes)
                saved += 1
    (output / "data.yaml").write_text(
        yaml.safe_dump({
            "path": output.resolve().as_posix(),
            "train": [
                (public_data / "images" / "train").resolve().as_posix(),
                "images/train",
            ],
            "val": (public_data / "images" / "val").resolve().as_posix(),
            "test": (public_data / "images" / "test").resolve().as_posix(),
            "names": dict(enumerate(COLORS)),
        }, sort_keys=False),
        encoding="utf-8",
    )
    return saved


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=PROJECT_ROOT / "datasets" / "personal_cube")
    parser.add_argument("--public-data", type=Path, default=PROJECT_ROOT / "datasets" / "roboflow_clean_fixed")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "datasets" / "personal_finetune")
    parser.add_argument("--augmentations-per-image", type=int, default=20)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    count = prepare(args.source, args.public_data, args.output,
                    augmentations_per_image=args.augmentations_per_image, seed=args.seed)
    print(f"Prepared {count} personal-cube training images: {args.output / 'data.yaml'}")


if __name__ == "__main__":
    main()
