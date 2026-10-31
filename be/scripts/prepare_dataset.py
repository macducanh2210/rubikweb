"""Split labelled, rectified Rubik faces and augment only the training split.

Input layout: raw/images/<name>.jpg|png and raw/labels/<name>.txt.
Each label is ``class_id x_center y_center width height`` in YOLO coordinates.
"""

import argparse
import os
import random
import shutil
from pathlib import Path

import cv2
import numpy as np

COLORS = ("white", "yellow", "red", "orange", "blue", "green")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _image(path: Path) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Không đọc được ảnh: {path}")
    height, width = image.shape[:2]
    if min(height, width) < 180 or abs(height - width) > 2:
        raise ValueError(f"Ảnh phải là mặt vuông đã cắt/chỉnh phối cảnh: {path}")
    return image


def _labels(path: Path) -> tuple[list[int], list[tuple[float, float, float, float]]]:
    classes: list[int] = []
    boxes: list[tuple[float, float, float, float]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        parts = line.split()
        if len(parts) != 5:
            raise ValueError(f"Nhãn YOLO không hợp lệ: {path}:{line_number}")
        try:
            class_id = int(parts[0])
            x, y, width, height = (float(value) for value in parts[1:])
        except ValueError as exc:
            raise ValueError(f"Nhãn YOLO không hợp lệ: {path}:{line_number}") from exc
        if not 0 <= class_id < len(COLORS) or not (
            0 < width <= 1
            and 0 < height <= 1
            and width / 2 <= x <= 1 - width / 2
            and height / 2 <= y <= 1 - height / 2
        ):
            raise ValueError(f"Tọa độ hoặc class_id không hợp lệ: {path}:{line_number}")
        classes.append(class_id)
        boxes.append((x, y, width, height))
    if len(boxes) != 9:
        raise ValueError(f"Mỗi ảnh phải có đúng 9 ô được gán nhãn: {path}")
    grid_positions = {(min(int(y * 3), 2), min(int(x * 3), 2)) for x, y, _, _ in boxes}
    if len(grid_positions) != 9:
        raise ValueError(f"Mỗi ô lưới 3x3 phải có đúng một nhãn: {path}")
    return classes, boxes


def _write_labels(
    path: Path,
    classes: list[int],
    boxes: list[tuple[float, float, float, float]],
) -> None:
    path.write_text(
        "".join(
            f"{class_id} " + " ".join(f"{value:.6f}" for value in box) + "\n"
            for class_id, box in zip(classes, boxes, strict=True)
        ),
        encoding="utf-8",
    )


def _augmentation(seed: int):
    try:
        os.environ.setdefault("NO_ALBUMENTATIONS_UPDATE", "1")
        import albumentations as A
    except ImportError as exc:
        raise RuntimeError("Cần cài albumentations từ requirements.txt") from exc
    # Avoid hue/saturation shifts: those could silently change the colour label.
    return A.Compose(
        [
            A.HorizontalFlip(p=0.5),
            A.VerticalFlip(p=0.5),
            A.RandomRotate90(p=0.5),
            A.RandomBrightnessContrast(brightness_limit=0.08, contrast_limit=0.08, p=0.7),
            A.GaussianBlur(blur_limit=(3, 3), p=0.2),
        ],
        bbox_params=A.BboxParams(format="yolo", label_fields=["class_labels"]),
        seed=seed,
    )


def prepare_dataset(
    source: Path,
    output: Path,
    *,
    augmentations_per_image: int = 2,
    seed: int = 42,
) -> dict[str, int]:
    if augmentations_per_image < 0:
        raise ValueError("augmentations_per_image không được âm")
    images_dir = source / "images"
    labels_dir = source / "labels"
    if not images_dir.is_dir() or not labels_dir.is_dir():
        raise ValueError("Cần thư mục raw/images và raw/labels")
    image_paths = sorted(path for path in images_dir.iterdir() if path.suffix.lower() in IMAGE_EXTENSIONS)
    if len(image_paths) < 7:
        raise ValueError("Cần ít nhất 7 ảnh đã gán nhãn để chia train/val/test")
    if len({path.stem for path in image_paths}) != len(image_paths):
        raise ValueError("Tên ảnh phải duy nhất, kể cả khi phần mở rộng khác nhau")
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Thư mục đầu ra không rỗng: {output}")

    records = []
    for image_path in image_paths:
        label_path = labels_dir / f"{image_path.stem}.txt"
        if not label_path.is_file():
            raise ValueError(f"Thiếu nhãn cho ảnh: {image_path}")
        image = _image(image_path)
        classes, boxes = _labels(label_path)
        records.append((image_path, label_path, image, classes, boxes))

    random.Random(seed).shuffle(records)
    n = len(records)
    n_train = round(n * 0.70)
    n_val = max(1, round(n * 0.15))
    if n_train + n_val >= n:
        n_train = n - n_val - 1
    splits = {
        "train": records[:n_train],
        "val": records[n_train:n_train + n_val],
        "test": records[n_train + n_val:],
    }
    train_classes = {class_id for _, _, _, classes, _ in splits["train"] for class_id in classes}
    if train_classes != set(range(len(COLORS))):
        missing = [COLORS[index] for index in set(range(len(COLORS))) - train_classes]
        raise ValueError(f"Tập train thiếu màu: {', '.join(missing)}; cần thêm ảnh đa dạng")

    transform = _augmentation(seed) if augmentations_per_image else None
    for split, items in splits.items():
        image_output = output / "images" / split
        label_output = output / "labels" / split
        image_output.mkdir(parents=True, exist_ok=True)
        label_output.mkdir(parents=True, exist_ok=True)
        for image_path, label_path, image, classes, boxes in items:
            shutil.copy2(image_path, image_output / image_path.name)
            shutil.copy2(label_path, label_output / label_path.name)
            if split != "train" or transform is None:
                continue
            for index in range(augmentations_per_image):
                transformed = transform(image=image, bboxes=boxes, class_labels=classes)
                aug_boxes = [tuple(map(float, box)) for box in transformed["bboxes"]]
                aug_classes = [int(class_id) for class_id in transformed["class_labels"]]
                if len(aug_boxes) != 9:
                    raise ValueError("Augmentation làm mất nhãn của một ô")
                stem = f"{image_path.stem}_aug{index + 1}"
                success, encoded = cv2.imencode(".png", transformed["image"])
                if not success:
                    raise ValueError(f"Không mã hóa được ảnh: {image_path}")
                (image_output / f"{stem}.png").write_bytes(encoded.tobytes())
                _write_labels(label_output / f"{stem}.txt", aug_classes, aug_boxes)

    yaml_lines = [
        f'path: "{output.resolve().as_posix()}"',
        "train: images/train",
        "val: images/val",
        "test: images/test",
        "names:",
    ]
    yaml_lines.extend(f"  {index}: {color}" for index, color in enumerate(COLORS))
    (output / "data.yaml").write_text("\n".join(yaml_lines) + "\n", encoding="utf-8")
    return {split: len(items) for split, items in splits.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=PROJECT_ROOT / "datasets" / "raw")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "datasets" / "processed")
    parser.add_argument("--augmentations-per-image", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    counts = prepare_dataset(
        args.source,
        args.output,
        augmentations_per_image=args.augmentations_per_image,
        seed=args.seed,
    )
    print(f"Original images: train={counts['train']}, val={counts['val']}, test={counts['test']}")
    print(f"Created: {args.output / 'data.yaml'}")


if __name__ == "__main__":
    main()
