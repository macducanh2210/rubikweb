from copy import deepcopy
import csv
import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.rubik import RubikFace, RubikState, rubik_state_faces
from app.services import detect as detect_service
from app.services.detection.cube_state_builder import FaceResult, build_cube_state
from app.services.detection.grid_detection import detect_grid
from app.services.detection.preprocessing import preprocess_image

SAMPLE_DIR = Path(__file__).resolve().parents[1] / "test_images"
FACE_COLORS = {
    "U": "white",
    "D": "yellow",
    "F": "green",
    "B": "blue",
    "L": "orange",
    "R": "red",
}


def test_real_yolo_endpoint_when_local_assets_exist(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Local integration smoke test; skip on checkouts without trained assets."""
    root = Path(__file__).resolve().parents[1]
    manifest = root / "datasets" / "roboflow_clean_fixed" / "source_manifest.csv"
    if not all(path.is_file() for path in (
        manifest, root / "models" / "best.pt", root / "models" / "face_best.pt"
    )):
        pytest.skip("Local Roboflow exports/checkpoints are unavailable")
    with manifest.open(encoding="utf-8", newline="") as file:
        image_paths = [Path(row["source_image"]) for row in csv.DictReader(file)
                       if row["split"] == "test" and row["source_dataset"] == "lazy"]
    image_paths = [path for path in image_paths if path.is_file()]
    if not image_paths:
        pytest.skip("Original LazyCube test photos are unavailable")
    monkeypatch.setattr(detect_service, "FACE_UPLOAD_DIR", tmp_path)
    auth = _register(client, "real_image_owner")
    last_response = None
    for image_path in image_paths[:5]:
        last_response = client.post(
            "/detect/single-face",
            headers=_headers(auth),
            data={"face": "F"},
            files={"image": (image_path.name, image_path.read_bytes(), "image/jpeg")},
        )
        if last_response.status_code == 200:
            break
    assert last_response is not None and last_response.status_code == 200, (
        last_response.text if last_response is not None else "No test photos"
    )
    body = last_response.json()
    assert set(body["data"]) == {"face_id", "face", "image_url", "colors", "confidence_score"}
    assert len(body["data"]["colors"]) == 9
    assert body["data"]["confidence_score"] >= 0.7


def test_personal_cube_six_photos_through_api_when_available(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = Path(__file__).resolve().parents[1]
    source = root / "datasets" / "personal_cube"
    labels = source / "expected.json"
    if not all(path.is_file() for path in (
        labels, root / "models" / "best.pt", root / "models" / "face_best.pt"
    )):
        pytest.skip("Local personal-cube photos/checkpoints are unavailable")
    expected: dict[str, list[str]] = json.loads(labels.read_text(encoding="utf-8"))
    if any(not (source / "images" / name).is_file() for name in expected):
        pytest.skip("Personal-cube photos are unavailable")
    monkeypatch.setattr(detect_service, "FACE_UPLOAD_DIR", tmp_path)
    auth = _register(client, "personal_cube_owner")
    for name, face in zip(sorted(expected), ("L", "D", "F", "U", "B", "R"), strict=True):
        response = client.post(
            "/detect/single-face",
            headers=_headers(auth),
            data={"face": face},
            files={"image": (name, (source / "images" / name).read_bytes(), "image/jpeg")},
        )
        assert response.status_code == 200, (name, response.text)
        data = response.json()["data"]
        assert data["colors"] == expected[name], name
        assert data["confidence_score"] >= 0.7, name


def _register(client: TestClient, username: str) -> dict[str, Any]:
    email = f"{username}@example.com"
    assert client.post("/auth/register/send-otp", json={"email": email}).status_code == 200
    response = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": email,
            "password": "password123",
            "display_name": username,
            "otp_code": client.registration_codes[email],
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def _headers(auth: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth['access_token']}"}


def _assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == code
    assert body["message"]


@pytest.fixture()
def face_rows(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    auth = _register(client, "detect_owner")
    faces = []
    with session_factory() as db:
        for face, color in FACE_COLORS.items():
            row = RubikFace(
                user_id=auth["user"]["id"],
                face=face,
                image_url=f"http://testserver/uploads/faces/{face}.png",
                colors=[color] * 9,
                confidence_score=0.9,
            )
            db.add(row)
            db.flush()
            faces.append({"face": face, "face_id": row.id, "colors": None})
        db.commit()
    return auth, faces


def test_single_face_detects_sample_and_saves_image(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(detect_service, "FACE_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(detect_service, "locate_face", lambda image: detect_grid(preprocess_image(image)))
    monkeypatch.setattr(detect_service, "classify_grid", lambda _: (["green"] * 9, 0.96))
    auth = _register(client, "image_owner")
    image = (SAMPLE_DIR / "F.png").read_bytes()
    response = client.post(
        "/detect/single-face",
        headers=_headers(auth),
        data={"face": "F"},
        files={"image": ("F.png", image, "image/png")},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True
    assert set(body["data"]) == {
        "face_id", "face", "image_url", "colors", "confidence_score"
    }
    assert body["data"]["face"] == "F"
    assert body["data"]["colors"] == ["green"] * 9
    assert body["data"]["confidence_score"] >= 0.7
    assert (tmp_path / f"{body['data']['face_id']}.png").read_bytes() == image


def test_single_face_requires_trained_model(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services.detection import inference

    auth = _register(client, "no_model_owner")
    monkeypatch.setattr(detect_service, "locate_face", lambda image: detect_grid(preprocess_image(image)))
    monkeypatch.setattr(inference, "MODEL_PATH", tmp_path / "missing.pt")
    response = client.post(
        "/detect/single-face",
        headers=_headers(auth),
        data={"face": "F"},
        files={"image": ("F.png", (SAMPLE_DIR / "F.png").read_bytes(), "image/png")},
    )
    _assert_error(response, 500, "INTERNAL_ERROR")
    assert set(response.json()) == {"success", "error_code", "message"}


def test_single_face_contract_errors(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    auth = _register(client, "image_errors")
    monkeypatch.setattr(detect_service, "locate_face", lambda image: detect_grid(preprocess_image(image)))
    headers = _headers(auth)
    sample = (SAMPLE_DIR / "F.png").read_bytes()
    invalid_face = client.post(
        "/detect/single-face",
        headers=headers,
        data={"face": "X"},
        files={"image": ("F.png", sample, "image/png")},
    )
    _assert_error(invalid_face, 400, "INVALID_FACE")

    invalid_type = client.post(
        "/detect/single-face",
        headers=headers,
        data={"face": "F"},
        files={"image": ("F.gif", b"GIF89a", "image/gif")},
    )
    _assert_error(invalid_type, 400, "INVALID_FILE_TYPE")

    oversized = client.post(
        "/detect/single-face",
        headers=headers,
        data={"face": "F"},
        files={"image": ("big.png", b"\x89PNG\r\n\x1a\n" + b"0" * (5 * 1024 * 1024), "image/png")},
    )
    _assert_error(oversized, 400, "FILE_TOO_LARGE")

    no_cube = client.post(
        "/detect/single-face",
        headers=headers,
        data={"face": "F"},
        files={"image": ("bad.png", b"\x89PNG\r\n\x1a\ncorrupt", "image/png")},
    )
    _assert_error(no_cube, 400, "CUBE_NOT_DETECTED")

    monkeypatch.setattr(
        detect_service,
        "classify_grid",
        lambda _: (["green"] * 9, 0.52),
    )
    low_confidence = client.post(
        "/detect/single-face",
        headers=headers,
        data={"face": "F"},
        files={"image": ("F.png", sample, "image/png")},
    )
    _assert_error(low_confidence, 400, "LOW_CONFIDENCE")
    assert low_confidence.json()["details"] == {"confidence_score": 0.52}


def test_finalize_solved_state_and_source_links(
    client: TestClient,
    face_rows: tuple[dict[str, Any], list[dict[str, Any]]],
    session_factory: sessionmaker[Session],
) -> None:
    auth, faces = face_rows
    response = client.post(
        "/detect/finalize",
        headers=_headers(auth),
        json={"faces": faces, "ignored": "contract ignores extra fields"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"success", "data"}
    assert set(body["data"]) == {"rubik_state_id", "cube_state", "confidence_score"}
    assert body["data"]["cube_state"] == {
        face: [color] * 9 for face, color in FACE_COLORS.items()
    }
    assert body["data"]["confidence_score"] == 0.9
    with session_factory() as db:
        state = db.get(RubikState, body["data"]["rubik_state_id"])
        assert state is not None
        assert state.user_id == auth["user"]["id"]
        assert db.scalar(select(func.count()).select_from(rubik_state_faces)) == 6


def test_finalize_rejects_missing_duplicate_and_mismatched_faces(
    client: TestClient,
    face_rows: tuple[dict[str, Any], list[dict[str, Any]]],
) -> None:
    auth, faces = face_rows
    headers = _headers(auth)
    missing = client.post("/detect/finalize", headers=headers, json={"faces": faces[:5]})
    _assert_error(missing, 400, "MISSING_FACE")

    duplicate_face = deepcopy(faces)
    duplicate_face[1]["face"] = "U"
    response = client.post("/detect/finalize", headers=headers, json={"faces": duplicate_face})
    _assert_error(response, 400, "DUPLICATE_FACE")

    duplicate_id = deepcopy(faces)
    duplicate_id[1]["face_id"] = duplicate_id[0]["face_id"]
    response = client.post("/detect/finalize", headers=headers, json={"faces": duplicate_id})
    _assert_error(response, 400, "DUPLICATE_FACE")

    mismatch = deepcopy(faces)
    mismatch[0]["face_id"], mismatch[1]["face_id"] = (
        mismatch[1]["face_id"], mismatch[0]["face_id"]
    )
    response = client.post("/detect/finalize", headers=headers, json={"faces": mismatch})
    _assert_error(response, 400, "FACE_MISMATCH")


def test_finalize_enforces_face_ownership(
    client: TestClient,
    face_rows: tuple[dict[str, Any], list[dict[str, Any]]],
) -> None:
    _, faces = face_rows
    other = _register(client, "other_owner")
    response = client.post(
        "/detect/finalize", headers=_headers(other), json={"faces": faces}
    )
    _assert_error(response, 404, "FACE_NOT_FOUND")


def test_finalize_validates_override_count_and_physical_state(
    client: TestClient,
    face_rows: tuple[dict[str, Any], list[dict[str, Any]]],
) -> None:
    auth, faces = face_rows
    headers = _headers(auth)
    invalid_array = deepcopy(faces)
    invalid_array[0]["colors"] = ["white"] * 8
    response = client.post("/detect/finalize", headers=headers, json={"faces": invalid_array})
    _assert_error(response, 400, "INVALID_COLOR_ARRAY")

    invalid_color = deepcopy(faces)
    invalid_color[0]["colors"] = ["white"] * 8 + [42]
    response = client.post("/detect/finalize", headers=headers, json={"faces": invalid_color})
    _assert_error(response, 400, "INVALID_COLOR_ARRAY")

    invalid_count = deepcopy(faces)
    invalid_count[0]["colors"] = ["yellow"] + ["white"] * 8
    response = client.post("/detect/finalize", headers=headers, json={"faces": invalid_count})
    _assert_error(response, 400, "INVALID_CUBE_STATE")
    assert response.json()["details"] == {
        "invalid_colors": {"white": 8, "yellow": 10}
    }

    impossible = deepcopy(faces)
    impossible[2]["colors"] = ["green"] * 9
    impossible[5]["colors"] = ["red"] * 9
    impossible[2]["colors"][1] = "red"
    impossible[5]["colors"][1] = "green"
    response = client.post("/detect/finalize", headers=headers, json={"faces": impossible})
    _assert_error(response, 400, "UNSOLVABLE_STATE")


def test_manual_override_has_confidence_one(
    client: TestClient,
    face_rows: tuple[dict[str, Any], list[dict[str, Any]]],
) -> None:
    auth, faces = face_rows
    request = deepcopy(faces)
    request[0]["colors"] = ["white"] * 9
    response = client.post(
        "/detect/finalize", headers=_headers(auth), json={"faces": request}
    )
    assert response.status_code == 200
    assert response.json()["data"]["confidence_score"] == pytest.approx(
        (1.0 + 5 * 0.9) / 6, abs=1e-4
    )


def test_builder_detects_unphysical_edge_swap() -> None:
    state = {face: [color] * 9 for face, color in FACE_COLORS.items()}
    state["F"][1], state["R"][1] = state["R"][1], state["F"][1]
    faces = [
        FaceResult(face, index, colors, 1.0)
        for index, (face, colors) in enumerate(state.items(), start=1)
    ]
    with pytest.raises(Exception) as exc_info:
        build_cube_state(faces)
    assert getattr(exc_info.value, "error_code", None) == "UNSOLVABLE_STATE"
