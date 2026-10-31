"""Convert a scanned cube to Kociemba's facelet string and solve it."""

from collections import Counter
from functools import lru_cache
from typing import Any

try:
    import kociemba
except ImportError:  # Other API modules must remain usable before optional solver setup.
    kociemba = None

from app.core.errors import APIError
from app.services.cube_model import FACE_ORDER, SOLVED_FACELETS, RubikCube
from app.services.detection.cube_state_builder import COLORS, _is_solvable


def _unsolvable() -> APIError:
    return APIError(400, "UNSOLVABLE_STATE", "Trạng thái khối Rubik không thể giải")


def to_kociemba_facelets(cube_state: dict[str, Any]) -> str:
    if not isinstance(cube_state, dict) or set(cube_state) != set(FACE_ORDER):
        raise _unsolvable()
    if any(
        not isinstance(cube_state[face], list)
        or len(cube_state[face]) != 9
        or any(color not in COLORS for color in cube_state[face])
        for face in FACE_ORDER
    ):
        raise _unsolvable()
    counts = Counter(color for face in FACE_ORDER for color in cube_state[face])
    if any(counts[color] != 9 for color in COLORS):
        raise _unsolvable()
    centers = {face: cube_state[face][4] for face in FACE_ORDER}
    if len(set(centers.values())) != 6 or not _is_solvable(cube_state):
        raise _unsolvable()
    color_to_face = {color: face for face, color in centers.items()}
    return "".join(color_to_face[color] for face in FACE_ORDER for color in cube_state[face])


@lru_cache(maxsize=4096)
def _solve_facelets(facelets: str) -> tuple[str, ...]:
    if facelets == SOLVED_FACELETS:
        return ()
    if kociemba is None:
        raise APIError(500, "INTERNAL_ERROR", "Chưa cài đặt thư viện giải Rubik")
    try:
        moves = tuple(kociemba.solve(facelets).split())
    except ValueError as exc:
        raise _unsolvable() from exc
    try:
        if not RubikCube(facelets).apply_moves(moves).is_solved():
            raise ValueError("Kociemba returned a non-solving sequence")
    except ValueError as exc:
        raise APIError(500, "INTERNAL_ERROR", "Bộ giải trả về lời giải không hợp lệ") from exc
    return moves


def solve_cube_state(cube_state: dict[str, Any]) -> list[str]:
    return list(_solve_facelets(to_kociemba_facelets(cube_state)))
