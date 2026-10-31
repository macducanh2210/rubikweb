import sys
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

from app.core.errors import APIError
from app.services.detection import face_inference, inference
from app.services.detection.grid_detection import CellBox, DetectedGrid
from scripts.prepare_dataset import COLORS, prepare_dataset
from scripts.evaluate_personal_cube import evaluate as evaluate_personal_cube
from scripts import import_roboflow
from scripts.train import train


def _grid() -> DetectedGrid:
    return DetectedGrid(
        face_image=np.zeros((360, 360, 3), dtype=np.uint8),
        cells=[CellBox(col * 120, row * 120, 120, 120) for row in range(3) for col in range(3)],
        corners=np.zeros((4, 2), dtype=np.float32),
    )


def test_yolo_predictions_map_to_row_major_cells(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    checkpoint = tmp_path / "best.pt"
    checkpoint.write_bytes(b"fake")
    monkeypatch.setattr(inference, "MODEL_PATH", checkpoint)
    boxes = []
    for row in range(3):
        for col in range(3):
            boxes.append([col * 120 + 20, row * 120 + 20, col * 120 + 100, row * 120 + 100])
    augment_calls: list[bool] = []

    class FakeModel:
        def predict(self, **kwargs: object) -> list[SimpleNamespace]:
            assert kwargs["conf"] < 0.7
            augment_calls.append(bool(kwargs["augment"]))
            return [SimpleNamespace(
                names=dict(enumerate(COLORS)),
                boxes=SimpleNamespace(
                    xyxy=np.array(boxes[::-1]),
                    conf=np.array([0.91] * 8 + [0.72]),
                    cls=np.array([index % 6 for index in range(8, -1, -1)]),
                ),
            )]

    monkeypatch.setattr(inference, "_load_model", lambda *_: FakeModel())
    predictions = inference.predict_stickers(_grid().face_image)
    assert len(predictions) == 9
    assert predictions[0].bbox == tuple(boxes[8])
    assert predictions[0].color == COLORS[2]
    colors, confidence = inference.classify_grid(_grid())
    assert colors == [COLORS[index % 6] for index in range(9)]
    assert confidence == 0.72
    assert augment_calls == [False, True]


def test_yolo_missing_sticker(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        inference,
        "predict_stickers",
        lambda _, **__: [inference.StickerDetection((20, 20, 100, 100), "red", 0.9)],
    )
    with pytest.raises(ValueError, match="nine stickers"):
        inference.classify_grid(_grid())


def test_vivid_orange_corrects_yolo_yellow_and_calibrates_confidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    grid = _grid()
    hsv = np.full((360, 360, 3), (17, 245, 255), dtype=np.uint8)
    grid = DetectedGrid(cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR), grid.cells, grid.corners)
    detections = [
        inference.StickerDetection((cell.x + 20, cell.y + 20, cell.x + 100, cell.y + 100),
                                   "yellow", 0.65)
        for cell in grid.cells
    ]
    monkeypatch.setattr(inference, "predict_stickers", lambda _, **__: detections)
    colors, confidence = inference.classify_grid(grid)
    assert colors == ["orange"] * 9
    assert confidence == 0.75


def test_vivid_red_confidence_boost_requires_matching_yolo_class(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    grid = _grid()
    hsv = np.full((360, 360, 3), (1, 215, 255), dtype=np.uint8)
    grid = DetectedGrid(cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR), grid.cells, grid.corners)
    detections = [
        inference.StickerDetection((cell.x + 20, cell.y + 20, cell.x + 100, cell.y + 100),
                                   "red", 0.67)
        for cell in grid.cells
    ]
    monkeypatch.setattr(inference, "predict_stickers", lambda _, **__: detections)
    assert inference.classify_grid(grid) == (["red"] * 9, 0.75)

    mismatched = [
        inference.StickerDetection(item.bbox, "yellow", item.confidence) for item in detections
    ]
    monkeypatch.setattr(inference, "predict_stickers", lambda _, **__: mismatched)
    assert inference.classify_grid(grid) == (["yellow"] * 9, 0.67)


def test_yolo_bad_classes(monkeypatch: pytest.MonkeyPatch) -> None:
    checkpoint = Path(__file__).resolve()
    monkeypatch.setattr(inference, "MODEL_PATH", checkpoint)

    class BadModel:
        def predict(self, **_: object) -> list[SimpleNamespace]:
            return [SimpleNamespace(names={0: "unknown"}, boxes=None)]

    monkeypatch.setattr(inference, "_load_model", lambda *_: BadModel())
    with pytest.raises(APIError) as error:
        inference.predict_stickers(_grid().face_image)
    assert error.value.error_code == "INTERNAL_ERROR"


def test_face_yolo_crops_largest_face(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    checkpoint = tmp_path / "face_best.pt"
    checkpoint.write_bytes(b"fake")
    monkeypatch.setattr(face_inference, "MODEL_PATH", checkpoint)

    class FakeModel:
        def predict(self, **kwargs: object) -> list[SimpleNamespace]:
            assert kwargs["source"].shape == (400, 300, 3)
            return [SimpleNamespace(
                names={0: "face"},
                boxes=SimpleNamespace(
                    xyxy=np.array([[30, 30, 90, 90], [60, 100, 240, 300]]),
                    conf=np.array([0.95, 0.85]),
                    cls=np.array([0, 0]),
                ),
            )]

    monkeypatch.setattr(face_inference, "_load_model", lambda *_: FakeModel())
    grid = face_inference.locate_face(np.zeros((400, 300, 3), dtype=np.uint8))
    assert grid.face_image.shape == (360, 360, 3)
    assert len(grid.cells) == 9
    assert tuple(grid.corners[0]) == (53.0, 93.0)


def test_face_yolo_requires_checkpoint(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(face_inference, "MODEL_PATH", tmp_path / "missing.pt")
    with pytest.raises(APIError) as error:
        face_inference.locate_face(np.zeros((400, 300, 3), dtype=np.uint8))
    assert error.value.status_code == 500
    assert error.value.error_code == "INTERNAL_ERROR"


def test_prepare_dataset_splits_before_augmentation(tmp_path: Path) -> None:
    pytest.importorskip("albumentations")
    source = tmp_path / "raw"
    (source / "images").mkdir(parents=True)
    (source / "labels").mkdir()
    image = np.full((360, 360, 3), 127, dtype=np.uint8)
    success, encoded = cv2.imencode(".png", image)
    assert success
    for index in range(20):
        (source / "images" / f"face{index}.png").write_bytes(encoded.tobytes())
        lines = []
        for row in range(3):
            for col in range(3):
                class_id = (row * 3 + col) % 6
                lines.append(f"{class_id} {(col + 0.5) / 3:.6f} {(row + 0.5) / 3:.6f} 0.2 0.2")
        (source / "labels" / f"face{index}.txt").write_text("\n".join(lines), encoding="utf-8")

    output = tmp_path / "processed"
    counts = prepare_dataset(source, output, augmentations_per_image=2, seed=42)
    assert counts == {"train": 14, "val": 3, "test": 3}
    assert len(list((output / "images" / "train").glob("*.png"))) == 42
    assert len(list((output / "images" / "val").glob("*.png"))) == 3
    assert len(list((output / "images" / "test").glob("*.png"))) == 3
    train_names = {path.stem.split("_aug")[0] for path in (output / "images" / "train").glob("*.png")}
    val_names = {path.stem for path in (output / "images" / "val").glob("*.png")}
    test_names = {path.stem for path in (output / "images" / "test").glob("*.png")}
    assert train_names.isdisjoint(val_names | test_names)
    assert val_names.isdisjoint(test_names)
    assert "white" in (output / "data.yaml").read_text(encoding="utf-8")


def test_prepare_dataset_rejects_unlabelled_input(tmp_path: Path) -> None:
    source = tmp_path / "raw"
    (source / "images").mkdir(parents=True)
    (source / "labels").mkdir()
    for index in range(7):
        (source / "images" / f"face{index}.png").write_bytes(b"not an image")
    with pytest.raises(ValueError, match="Thiếu nhãn"):
        prepare_dataset(source, tmp_path / "processed", augmentations_per_image=0)


def test_all_source_variants_only_extend_train_split(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidates = {
        f"source{index}": [
            import_roboflow.Candidate(f"source{index}", tmp_path / f"{index}_{version}.jpg",
                                       (0.5, 0.5, 0.7, 0.7), (), 2 - version)
            for version in range(2)
        ]
        for index in range(7)
    }
    monkeypatch.setattr(import_roboflow, "_lazy_candidates", lambda _: candidates)
    monkeypatch.setattr(import_roboflow, "_yumi_candidates", lambda _: {})
    boxes = [((col + 0.5) / 3, (row + 0.5) / 3, 0.2, 0.2)
             for row in range(3) for col in range(3)]
    monkeypatch.setattr(
        import_roboflow, "_crop_lazy",
        lambda _: (np.zeros((360, 360, 3), dtype=np.uint8), [0] * 9, boxes),
    )
    manifest = tmp_path / "split.csv"
    manifest.write_text(
        "source_group,split\n" + "".join(
            f"source{index},{'val' if index == 5 else 'test' if index == 6 else 'train'}\n"
            for index in range(7)
        ), encoding="utf-8",
    )
    output = tmp_path / "processed"
    counts = import_roboflow.import_datasets(
        tmp_path, tmp_path, output, split_manifest=manifest,
        augmentations_per_image=0, all_train_variants=True,
    )
    assert counts == {"train": 10, "val": 1, "test": 1}
    for split in ("val", "test"):
        assert len(list((output / "images" / split).glob("*.png"))) == 1


def test_train_publishes_best_checkpoint_and_disables_hsv(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data = tmp_path / "data.yaml"
    data.write_text("names: {0: white}", encoding="utf-8")
    best = tmp_path / "run" / "weights" / "best.pt"
    best.parent.mkdir(parents=True)
    best.write_bytes(b"trained model")
    calls: list[dict[str, object]] = []

    class FakeYOLO:
        def __init__(self, weights: str) -> None:
            assert weights == "yolov8n.pt"
            self.trainer = SimpleNamespace(best=best)

        def train(self, **kwargs: object) -> None:
            calls.append(kwargs)

    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=FakeYOLO))
    output = tmp_path / "models" / "best.pt"
    assert train(data, output, epochs=2, batch=1) == output
    assert output.read_bytes() == b"trained model"
    assert calls[0]["hsv_h"] == calls[0]["hsv_s"] == calls[0]["hsv_v"] == 0.0


def test_personal_cube_regression_when_local_photos_exist() -> None:
    root = Path(__file__).resolve().parents[1]
    source = root / "datasets" / "personal_cube"
    color_model = root / "models" / "best.pt"
    face_model = root / "models" / "face_best.pt"
    if not all(path.is_file() for path in (
        source / "expected.json", color_model, face_model,
    )):
        pytest.skip("Local personal-cube photos/checkpoints are unavailable")
    result = evaluate_personal_cube(source, color_model, face_model)
    assert result["images"] == 6
    assert result["exact_faces"] == 6
    assert result["accepted_exact_faces"] == 6
