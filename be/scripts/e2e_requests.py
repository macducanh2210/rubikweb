"""Exercise the HTTP API against a running backend and its configured database.

This script creates a uniquely named test account and soft-deletes it after
the checks, leaving history records available for database inspection.
"""

import argparse
from datetime import datetime, timedelta, timezone
from itertools import product
import json
from pathlib import Path
import secrets
import sys

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.detection.cube_state_builder import _is_solvable

FACE_ORDER = ("F", "R", "B", "L", "U", "D")
SOLVED_COLORS = {
    "U": "white", "R": "red", "F": "green",
    "D": "yellow", "L": "orange", "B": "blue",
}


def _rotate_colors(colors: list[str]) -> list[str]:
    return [colors[(2 - col) * 3 + row] for row in range(3) for col in range(3)]


def _find_valid_face_rotations(
    detected: dict[str, list[str]],
) -> tuple[dict[str, list[str]], dict[str, int]] | None:
    variants: dict[str, list[list[str]]] = {}
    for face, colors in detected.items():
        turns = [colors]
        for _ in range(3):
            turns.append(_rotate_colors(turns[-1]))
        variants[face] = turns
    for indices in product(range(4), repeat=6):
        rotations = dict(zip(FACE_ORDER, indices, strict=True))
        state = {face: variants[face][rotations[face]] for face in FACE_ORDER}
        if _is_solvable(state):
            return state, rotations
    return None


def _report(step: str, response: requests.Response, expected: int, **extra: object) -> dict:
    try:
        body = response.json()
    except ValueError:
        body = {}
    print(json.dumps({
        "step": step,
        "http_status": response.status_code,
        "expected": expected,
        "success": body.get("success"),
        "error_code": body.get("error_code"),
        **extra,
    }, ensure_ascii=False))
    if response.status_code != expected or body.get("success") is not True:
        raise RuntimeError(f"{step} failed: {response.status_code} {body}")
    return body["data"]


def _images(args: argparse.Namespace) -> dict[str, Path]:
    if args.personal_cube:
        names = sorted((args.image_dir / "images").glob("*.jpg"))
        if len(names) != 6:
            raise FileNotFoundError("Expected six personal-cube JPG photos")
        return dict(zip(("L", "D", "F", "U", "B", "R"), names, strict=True))
    images = {face: args.image_dir / f"{face}.png" for face in FACE_ORDER}
    missing = [str(path) for path in images.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Missing test images: {missing}")
    return images


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--image-dir", type=Path, default=Path("test_images"))
    parser.add_argument("--personal-cube", action="store_true")
    parser.add_argument(
        "--keep-account",
        action="store_true",
        help="Leave the generated account active for follow-up API inspection.",
    )
    parser.add_argument(
        "--rotate-to-valid",
        action="store_true",
        help="On raw finalize failure, rotate only the detected 3x3 face grids to find a physically valid cube.",
    )
    parser.add_argument(
        "--manual-solved",
        action="store_true",
        help="If raw finalize fails, submit a manually corrected solved cube; only for solved-cube test photos.",
    )
    args = parser.parse_args()
    image_paths = _images(args)
    base_url = args.base_url.rstrip("/")
    session = requests.Session()
    nonce = secrets.token_hex(6)
    username = f"e2e_{nonce}"
    email = f"{username}@example.com"
    password = secrets.token_urlsafe(16)

    health = session.get(f"{base_url}/health", timeout=10)
    print(json.dumps({"step": "health", "http_status": health.status_code, "body": health.json()}))
    if health.status_code != 200 or health.json() != {"status": "ok"}:
        raise RuntimeError("Backend health check failed")

    _report(
        "register",
        session.post(f"{base_url}/auth/register", json={
            "username": username,
            "email": email,
            "password": password,
            "display_name": "E2E Rubik Test",
        }, timeout=30),
        201,
        username=username,
    )
    logged_in = _report(
        "login",
        session.post(f"{base_url}/auth/login", json={
            "identifier": username,
            "password": password,
        }, timeout=30),
        200,
    )
    session.headers["Authorization"] = f"Bearer {logged_in['access_token']}"

    face_inputs = []
    detected_colors: dict[str, list[str]] = {}
    for face in FACE_ORDER:
        path = image_paths[face]
        content_type = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        with path.open("rb") as image_file:
            response = session.post(
                f"{base_url}/detect/single-face",
                data={"face": face},
                files={"image": (path.name, image_file, content_type)},
                timeout=180,
            )
        result = _report(
            f"detect {face}", response, 200,
            colors=response.json().get("data", {}).get("colors"),
        )
        detected_colors[face] = result["colors"]
        face_inputs.append({"face": face, "face_id": result["face_id"], "colors": None})

    finalize_response = session.post(
        f"{base_url}/detect/finalize", json={"faces": face_inputs}, timeout=30
    )
    manual_correction: str | None = None
    if finalize_response.status_code != 200:
        print(json.dumps({
            "step": "finalize_raw",
            "http_status": finalize_response.status_code,
            "error_code": finalize_response.json().get("error_code"),
        }))
    if finalize_response.status_code != 200 and args.rotate_to_valid:
        found = _find_valid_face_rotations(detected_colors)
        if found is not None:
            corrected_state, rotations = found
            corrected = [
                {**item, "colors": corrected_state[item["face"]]}
                for item in face_inputs
            ]
            finalize_response = session.post(
                f"{base_url}/detect/finalize", json={"faces": corrected}, timeout=30
            )
            manual_correction = "rotated_detected_colors"
            print(json.dumps({"step": "face_rotations_clockwise", "turns": rotations}))
    if finalize_response.status_code != 200 and args.manual_solved:
        corrected = [
            {**item, "colors": [SOLVED_COLORS[item["face"]]] * 9}
            for item in face_inputs
        ]
        finalize_response = session.post(
            f"{base_url}/detect/finalize", json={"faces": corrected}, timeout=30
        )
        manual_correction = "solved_color_override"
    finalized = _report(
        "finalize", finalize_response, 200, manual_correction=manual_correction
    )

    solved = _report(
        "solve",
        session.post(f"{base_url}/solve", json={
            "rubik_state_id": finalized["rubik_state_id"],
        }, timeout=30),
        200,
    )
    print(json.dumps({"step": "solution_summary", "steps": solved["total_steps"]}))

    end_time = datetime.now(timezone.utc)
    started_at = end_time - timedelta(seconds=95)
    saved = _report(
        "history_create",
        session.post(f"{base_url}/history", json={
            "solution_id": solved["solution_id"],
            "start_time": started_at.isoformat(),
            "end_time": end_time.isoformat(),
            "status": "completed",
        }, timeout=30),
        201,
    )
    created_at = datetime.fromisoformat(saved["created_at"].replace("Z", "+00:00"))
    if abs((datetime.now(timezone.utc) - created_at).total_seconds()) > 60:
        raise RuntimeError("History created_at is not current UTC time")
    if saved["duration"] != 95:
        raise RuntimeError("History duration was not computed as 95 seconds")
    listed = _report(
        "history_list",
        session.get(f"{base_url}/history", params={"page": 1, "limit": 20}, timeout=30),
        200,
    )
    if not any(item["id"] == saved["id"] for item in listed["items"]):
        raise RuntimeError("Saved history is missing from GET /history")
    detail = _report(
        "history_detail",
        session.get(f"{base_url}/history/{saved['id']}", timeout=30),
        200,
    )
    if len(detail["rubik_state"]["face_images"]) != 6:
        raise RuntimeError("History detail does not include all six face images")
    print(json.dumps({
        "step": "history_summary",
        "duration": detail["duration"],
        "face_images": len(detail["rubik_state"]["face_images"]),
    }))
    stats = _report(
        "statistics",
        session.get(f"{base_url}/statistics", timeout=30),
        200,
    )
    if stats["total_solves"] < 1 or not stats["progress"]:
        raise RuntimeError("Completed solve is missing from statistics")
    print(json.dumps({
        "step": "statistics_summary",
        "total_solves": stats["total_solves"],
        "best_time": stats["best_time"],
        "progress_count": len(stats["progress"]),
        "test_username": username,
    }))
    if not args.keep_account:
        _report(
            "cleanup_soft_delete",
            session.delete(
                f"{base_url}/users/me",
                json={"password": password},
                timeout=30,
            ),
            200,
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, requests.RequestException, RuntimeError, ValueError) as exc:
        print(json.dumps({"step": "failed", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
