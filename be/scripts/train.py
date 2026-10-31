"""Train YOLOv8 on sticker colours or Rubik faces and publish a checkpoint."""

import argparse
import os
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def train(
    data: Path,
    output: Path,
    *,
    epochs: int = 100,
    imgsz: int = 384,
    batch: int = 16,
    device: str | None = None,
    run_name: str = "rubik_colors",
    weights: str = "yolov8n.pt",
    allow_hsv: bool = False,
    optimizer: str | None = None,
    lr0: float | None = None,
) -> Path:
    if not data.is_file():
        raise FileNotFoundError(f"Chưa có data.yaml: {data}; chạy prepare_dataset.py trước")
    if epochs < 1 or imgsz < 32 or batch < 1:
        raise ValueError("epochs, imgsz hoặc batch không hợp lệ")
    if lr0 is not None and lr0 <= 0:
        raise ValueError("lr0 must be positive")
    try:
        default_config_dir = PROJECT_ROOT / ".ultralytics"
        if "YOLO_CONFIG_DIR" not in os.environ:
            (default_config_dir / "Ultralytics").mkdir(parents=True, exist_ok=True)
            os.environ["YOLO_CONFIG_DIR"] = str(default_config_dir)
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError("Cần cài ultralytics từ requirements.txt") from exc
    model = YOLO(weights)
    train_options = dict(
        data=str(data.resolve()),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=device,
        project=str((PROJECT_ROOT / "runs" / "detect").resolve()),
        name=run_name,
        save=True,
    )
    if not allow_hsv:
        # Colour classes must not be shifted by Ultralytics' HSV augmentation.
        train_options.update(hsv_h=0.0, hsv_s=0.0, hsv_v=0.0)
    if optimizer is not None:
        train_options["optimizer"] = optimizer
    if lr0 is not None:
        train_options["lr0"] = lr0
    model.train(**train_options)
    best = Path(model.trainer.best)
    if not best.is_file():
        raise FileNotFoundError(f"Huấn luyện không tạo best.pt: {best}")
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, output)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=PROJECT_ROOT / "datasets" / "processed" / "data.yaml")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "models" / "best.pt")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=384)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default=None, help="For example: cpu or 0 (GPU)")
    parser.add_argument("--run-name", default="rubik_colors")
    parser.add_argument("--weights", default="yolov8n.pt", help="Starting checkpoint")
    parser.add_argument("--allow-hsv", action="store_true", help="Use only for face localization, not colour labels")
    parser.add_argument("--optimizer", help="Optimizer override, for example AdamW")
    parser.add_argument("--lr0", type=float, help="Initial learning rate override")
    args = parser.parse_args()
    print(f"Model saved: {train(args.data, args.output, epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, device=args.device, run_name=args.run_name, weights=args.weights, allow_hsv=args.allow_hsv, optimizer=args.optimizer, lr0=args.lr0)}")


if __name__ == "__main__":
    main()
