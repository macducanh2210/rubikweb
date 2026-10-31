"""Assemble scanned faces and verify a physically possible 3x3 cube."""

from collections import Counter
from dataclasses import dataclass

from app.core.errors import APIError

FACES = ("U", "D", "F", "B", "L", "R")
COLORS = ("white", "yellow", "red", "orange", "blue", "green")
FACELET_ORDER = ("U", "R", "F", "D", "L", "B")

# Standard URFDLB facelet positions for all eight corners and twelve edges.
CORNER_FACELETS = (
    (8, 9, 20), (6, 18, 38), (0, 36, 47), (2, 45, 11),
    (29, 26, 15), (27, 44, 24), (33, 53, 42), (35, 17, 51),
)
CORNER_COLORS = ("URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB")
EDGE_FACELETS = (
    (5, 10), (7, 19), (3, 37), (1, 46),
    (32, 16), (28, 25), (30, 43), (34, 52),
    (23, 12), (21, 41), (50, 39), (48, 14),
)
EDGE_COLORS = ("UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR")


@dataclass(frozen=True)
class FaceResult:
    face: str
    face_id: int
    colors: list[str]
    confidence_score: float
    overridden: bool = False


def _invalid_color_array() -> APIError:
    return APIError(400, "INVALID_COLOR_ARRAY", "Mỗi mặt phải có đúng 9 màu hợp lệ")


def _permutation_parity(permutation: list[int]) -> int:
    return sum(
        permutation[i] > permutation[j]
        for i in range(len(permutation))
        for j in range(i + 1, len(permutation))
    ) % 2


def _is_solvable(cube_state: dict[str, list[str]]) -> bool:
    centers = {face: cube_state[face][4] for face in FACES}
    if len(set(centers.values())) != 6:
        return False
    color_to_face = {color: face for face, color in centers.items()}
    facelets = "".join(
        color_to_face[color] for face in FACELET_ORDER for color in cube_state[face]
    )

    corners: list[int] = []
    corner_orientation = 0
    for facelet_indices in CORNER_FACELETS:
        stickers = [facelets[index] for index in facelet_indices]
        orientation = next(
            (index for index, sticker in enumerate(stickers) if sticker in "UD"),
            None,
        )
        if orientation is None:
            return False
        rotated = stickers[orientation:] + stickers[:orientation]
        corner = next(
            (index for index, colors in enumerate(CORNER_COLORS) if list(colors) == rotated),
            None,
        )
        if corner is None:
            return False
        corners.append(corner)
        corner_orientation += orientation

    edges: list[int] = []
    edge_orientation = 0
    for facelet_indices in EDGE_FACELETS:
        stickers = [facelets[index] for index in facelet_indices]
        match = next(
            (
                (index, orientation)
                for index, colors in enumerate(EDGE_COLORS)
                for orientation in (0, 1)
                if stickers == (list(colors) if orientation == 0 else list(colors[::-1]))
            ),
            None,
        )
        if match is None:
            return False
        edge, orientation = match
        edges.append(edge)
        edge_orientation += orientation

    return (
        len(set(corners)) == 8
        and len(set(edges)) == 12
        and corner_orientation % 3 == 0
        and edge_orientation % 2 == 0
        and _permutation_parity(corners) == _permutation_parity(edges)
    )


def build_cube_state(
    faces: list[FaceResult],
) -> tuple[dict[str, list[str]], float]:
    face_names = [item.face for item in faces]
    face_ids = [item.face_id for item in faces]
    if len(face_names) != len(set(face_names)) or len(face_ids) != len(set(face_ids)):
        raise APIError(400, "DUPLICATE_FACE", "Danh sách chứa mặt hoặc face_id trùng")
    if len(faces) != 6 or set(face_names) != set(FACES):
        raise APIError(400, "MISSING_FACE", "Cần đủ sáu mặt U, D, F, B, L, R")
    if any(
        len(item.colors) != 9 or any(color not in COLORS for color in item.colors)
        for item in faces
    ):
        raise _invalid_color_array()

    cube_state = {face: next(item.colors for item in faces if item.face == face) for face in FACES}
    counts = Counter(color for colors in cube_state.values() for color in colors)
    invalid_counts = {color: counts[color] for color in COLORS if counts[color] != 9}
    if invalid_counts:
        raise APIError(
            400,
            "INVALID_CUBE_STATE",
            "Mỗi màu phải xuất hiện đúng 9 lần trên 54 ô",
            {"invalid_colors": invalid_counts},
        )
    if not _is_solvable(cube_state):
        raise APIError(400, "UNSOLVABLE_STATE", "Trạng thái khối Rubik không thể giải")

    confidence = sum(
        1.0 if item.overridden else item.confidence_score for item in faces
    ) / 6
    return cube_state, round(confidence, 4)
