"""Compare a colour checkpoint with manually checked personal-cube photos."""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from app.services.detection.face_inference import locate_face
from app.services.detection.inference import classify_grid

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def evaluate(source: Path, color_model: Path, face_model: Path,
             *, color_augment: bool = True) -> dict[str, object]:
    expected = json.loads((source / "expected.json").read_text(encoding="utf-8"))
    results = []
    exact = accepted = accepted_exact = 0
    for name, colors in sorted(expected.items()):
        path = source / "images" / name
        image = cv2.imdecode(np.frombuffer(path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Cannot decode {path}")
        try:
            grid = locate_face(image, model_path=face_model)
            predicted, confidence = classify_grid(grid, model_path=color_model,
                                                   augment=color_augment)
        except ValueError:
            results.append({"image": name, "error": "CUBE_NOT_DETECTED"})
            continue
        is_exact = predicted == colors
        is_accepted = confidence >= 0.7
        exact += is_exact
        accepted += is_accepted
        accepted_exact += is_exact and is_accepted
        results.append({
            "image": name,
            "expected": colors,
            "predicted": predicted,
            "confidence_score": confidence,
            "exact": is_exact,
            "api_accepts": is_accepted,
        })
    return {
        "images": len(expected),
        "exact_faces": exact,
        "api_accepts": accepted,
        "accepted_exact_faces": accepted_exact,
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=PROJECT_ROOT / "datasets" / "personal_cube")
    parser.add_argument("--face-model", type=Path, default=PROJECT_ROOT / "models" / "face_best.pt")
    parser.add_argument("--color-model", type=Path, default=PROJECT_ROOT / "models" / "best.pt")
    parser.add_argument("--color-augment", action=argparse.BooleanOptionalAction,
                        default=True)
    args = parser.parse_args()
    print(json.dumps(evaluate(args.source, args.color_model, args.face_model,
                              color_augment=args.color_augment), indent=2))


if __name__ == "__main__":
    main()
