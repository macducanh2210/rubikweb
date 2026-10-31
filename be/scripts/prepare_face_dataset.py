"""Build a one-class Rubik-face YOLO dataset from LazyCube annotations.

It keeps every source photo in the same split as the six-colour dataset.
"""

import argparse
import csv
import json
import random
import shutil
from collections import defaultdict
from pathlib import Path

import yaml

from scripts.import_roboflow import _group, _image_for_label, _rows

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LAZY_NAMES = ("blue", "face", "green", "orange", "red", "white", "yellow")


def prepare_face_dataset(
    lazycube: Path,
    color_manifest: Path,
    output: Path,
    *,
    seed: int = 42,
) -> dict[str, int]:
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output directory is not empty: {output}")
    color_splits: dict[str, str] = {}
    with color_manifest.open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            color_splits[row["source_group"]] = row["split"]
    candidates: dict[str, list[tuple[float, Path, list[tuple[float, float, float, float]]]]] = defaultdict(list)
    for split in ("train", "valid", "test"):
        for label_path in (lazycube / split / "labels").glob("*.txt"):
            image_path = _image_for_label(label_path, lazycube / split / "images")
            rows = _rows(label_path, LAZY_NAMES)
            if image_path is None or rows is None:
                continue
            faces = [tuple(row[1:]) for row in rows if row[0] == 1]
            if not faces:
                continue
            score = sum(width * height for _, _, width, height in faces)
            candidates[_group(label_path)].append((score, image_path, faces))
    if len(candidates) < 7:
        raise ValueError("Not enough labelled Rubik-face images")
    additional = sorted(set(candidates) - set(color_splits))
    random.Random(seed).shuffle(additional)
    n_train = round(len(additional) * 0.70)
    n_val = round(len(additional) * 0.15)
    assignments = dict(color_splits)
    assignments.update({key: "train" for key in additional[:n_train]})
    assignments.update({key: "val" for key in additional[n_train:n_train + n_val]})
    assignments.update({key: "test" for key in additional[n_train + n_val:]})

    counts = {"train": 0, "val": 0, "test": 0}
    manifest_rows = []
    for group, options in sorted(candidates.items()):
        split = assignments[group]
        _, image_path, faces = max(options, key=lambda item: item[0])
        image_dir = output / "images" / split
        label_dir = output / "labels" / split
        image_dir.mkdir(parents=True, exist_ok=True)
        label_dir.mkdir(parents=True, exist_ok=True)
        stem = f"face_{counts[split]:04d}"
        shutil.copy2(image_path, image_dir / f"{stem}{image_path.suffix.lower()}")
        (label_dir / f"{stem}.txt").write_text(
            "".join("0 " + " ".join(f"{v:.6f}" for v in face) + "\n" for face in faces),
            encoding="utf-8",
        )
        manifest_rows.append((group, split, str(image_path)))
        counts[split] += 1

    output.mkdir(parents=True, exist_ok=True)
    with (output / "source_manifest.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(("source_group", "split", "source_image"))
        writer.writerows(manifest_rows)
    (output / "data.yaml").write_text(
        yaml.safe_dump(
            {"path": output.resolve().as_posix(), "train": "images/train", "val": "images/val", "test": "images/test", "names": {0: "face"}},
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    (output / "stats.json").write_text(json.dumps(counts, indent=2), encoding="utf-8")
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lazycube", type=Path, required=True)
    parser.add_argument(
        "--color-manifest", type=Path,
        default=PROJECT_ROOT / "datasets" / "roboflow_processed" / "source_manifest.csv",
    )
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "datasets" / "face_detector_processed")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    print(prepare_face_dataset(args.lazycube, args.color_manifest, args.output, seed=args.seed))


if __name__ == "__main__":
    main()
