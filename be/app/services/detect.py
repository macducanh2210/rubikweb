"""Detection endpoint orchestration and persistence."""

from collections import Counter
from pathlib import Path
from uuid import uuid4

import cv2
import numpy as np
from fastapi import UploadFile
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.models.rubik import RubikFace, RubikState, rubik_state_faces
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.rubik import FinalizeData, FinalizeRequest, ManualCubeRequest, SingleFaceData
from app.services.detection.cube_state_builder import COLORS, FACES, FaceResult, build_cube_state
from app.services.detection.face_inference import locate_face
from app.services.detection.inference import classify_grid

FACE_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "faces"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png"}


def _image_bytes(image: UploadFile) -> tuple[bytes, str]:
    mime_type = (image.content_type or "").lower()
    extension = IMAGE_EXTENSIONS.get(mime_type)
    if extension is None:
        raise APIError(400, "INVALID_FILE_TYPE", "Ảnh phải là file JPG hoặc PNG")
    content = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise APIError(400, "FILE_TOO_LARGE", "Ảnh không được vượt quá 5MB")
    if not content:
        raise APIError(400, "INVALID_FILE_TYPE", "File ảnh rỗng")
    is_jpeg = content.startswith(b"\xff\xd8\xff")
    is_png = content.startswith(b"\x89PNG\r\n\x1a\n")
    if not ((extension == "jpg" and is_jpeg) or (extension == "png" and is_png)):
        raise APIError(400, "INVALID_FILE_TYPE", "Nội dung ảnh không khớp định dạng")
    return content, extension


def single_face(
    face: str,
    image: UploadFile,
    current_user: User,
    base_url: str,
    db: Session,
) -> SuccessResponse[SingleFaceData]:
    if face not in FACES:
        raise APIError(400, "INVALID_FACE", "Mặt phải là U, D, F, B, L hoặc R")

    content, extension = _image_bytes(image)
    decoded = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise APIError(400, "CUBE_NOT_DETECTED", "Không đọc được ảnh khối Rubik")
    try:
        grid = locate_face(decoded)
        colors, confidence = classify_grid(grid)
    except (ValueError, cv2.error):
        raise APIError(400, "CUBE_NOT_DETECTED", "Không phát hiện được mặt Rubik") from None
    if confidence < 0.7:
        raise APIError(
            400,
            "LOW_CONFIDENCE",
            "Độ tin cậy nhận diện màu quá thấp",
            {"confidence_score": confidence},
        )

    face_record = RubikFace(
        user_id=current_user.id,
        face=face,
        image_url="",
        colors=colors,
        confidence_score=confidence,
    )
    db.add(face_record)
    stored_path: Path | None = None
    temporary_path: Path | None = None
    try:
        db.flush()
        FACE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        stored_path = FACE_UPLOAD_DIR / f"{face_record.id}.{extension}"
        temporary_path = FACE_UPLOAD_DIR / f".{face_record.id}-{uuid4().hex}.tmp"
        temporary_path.write_bytes(content)
        temporary_path.replace(stored_path)
        face_record.image_url = f"{base_url.rstrip('/')}/uploads/faces/{stored_path.name}"
        db.commit()
    except Exception:
        db.rollback()
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        if stored_path is not None:
            stored_path.unlink(missing_ok=True)
        raise

    return SuccessResponse(
        data=SingleFaceData(
            face_id=face_record.id,
            face=face,
            image_url=face_record.image_url,
            colors=colors,
            confidence_score=confidence,
        )
    )


def finalize(
    request: FinalizeRequest,
    current_user: User,
    db: Session,
) -> SuccessResponse[FinalizeData]:
    declared_names = [item.face for item in request.faces]
    face_ids = [item.face_id for item in request.faces]
    if len(set(declared_names)) != len(declared_names) or len(set(face_ids)) != len(face_ids):
        raise APIError(400, "DUPLICATE_FACE", "Danh sách chứa mặt hoặc face_id trùng")
    if len(request.faces) != 6 or set(declared_names) != set(FACES):
        raise APIError(400, "MISSING_FACE", "Cần đủ sáu mặt U, D, F, B, L, R")

    stored_faces = db.scalars(
        select(RubikFace).where(
            RubikFace.id.in_(face_ids),
            RubikFace.user_id == current_user.id,
        )
    ).all()
    by_id = {item.id: item for item in stored_faces}
    if len(by_id) != 6:
        raise APIError(404, "FACE_NOT_FOUND", "Không tìm thấy mặt Rubik")

    faces: list[FaceResult] = []
    for item in request.faces:
        stored = by_id[item.face_id]
        if stored.face != item.face:
            raise APIError(400, "FACE_MISMATCH", "Tên mặt không khớp face_id đã lưu")
        faces.append(
            FaceResult(
                face=item.face,
                face_id=item.face_id,
                colors=item.colors if item.colors is not None else stored.colors,
                confidence_score=stored.confidence_score,
                overridden=item.colors is not None,
            )
        )

    cube_state, confidence = build_cube_state(faces)
    state = RubikState(
        user_id=current_user.id,
        cube_state=cube_state,
        confidence_score=confidence,
    )
    db.add(state)
    db.flush()
    db.execute(
        insert(rubik_state_faces),
        [
            {"rubik_state_id": state.id, "rubik_face_id": item.face_id, "face": item.face}
            for item in faces
        ],
    )
    db.commit()
    return SuccessResponse(
        data=FinalizeData(
            rubik_state_id=state.id,
            cube_state=cube_state,
            confidence_score=confidence,
        )
    )


def manual(
    request: ManualCubeRequest, current_user: User, db: Session
) -> SuccessResponse[FinalizeData]:
    cube_state = request.cube_state
    if set(cube_state) != set(FACES):
        raise APIError(400, "MISSING_FACE", "Cần đúng sáu mặt U, D, F, B, L, R")
    if any(len(colors) != 9 or any(color not in COLORS for color in colors) for colors in cube_state.values()):
        raise APIError(400, "INVALID_COLOR_ARRAY", "Mỗi mặt phải có đúng 9 màu hợp lệ")
    # Manual input gives a precise error for duplicate centers, unlike an
    # impossible permutation of otherwise distinct-center facelets.
    counts = Counter(color for colors in cube_state.values() for color in colors)
    invalid_counts = {color: counts[color] for color in COLORS if counts[color] != 9}
    if invalid_counts:
        raise APIError(400, "INVALID_CUBE_STATE", "Mỗi màu phải xuất hiện đúng 9 lần trên 54 ô", {"invalid_colors": invalid_counts})
    if len({cube_state[face][4] for face in FACES}) != 6:
        raise APIError(400, "INVALID_CUBE_STATE", "Tâm sáu mặt phải có sáu màu khác nhau")
    validated_state, confidence = build_cube_state([
        FaceResult(face=face, face_id=index + 1, colors=cube_state[face], confidence_score=1.0, overridden=True)
        for index, face in enumerate(FACES)
    ])
    state = RubikState(user_id=current_user.id, cube_state=validated_state, confidence_score=confidence)
    db.add(state)
    db.commit()
    db.refresh(state)
    return SuccessResponse(data=FinalizeData(
        rubik_state_id=state.id, cube_state=validated_state, confidence_score=confidence
    ))
