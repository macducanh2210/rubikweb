"""Facelet-level 3x3 Rubik cube with standard URFDLB move notation."""

from collections import Counter
from collections.abc import Iterable

FACE_ORDER = "URFDLB"
SOLVED_FACELETS = "".join(face * 9 for face in FACE_ORDER)
_AXIS_LAYER = {"R": (0, 1), "L": (0, -1), "U": (1, 1),
               "D": (1, -1), "F": (2, 1), "B": (2, -1)}
_NORMAL = {"U": (0, 1, 0), "R": (1, 0, 0), "F": (0, 0, 1),
           "D": (0, -1, 0), "L": (-1, 0, 0), "B": (0, 0, -1)}


def _position(face: str, row: int, col: int) -> tuple[int, int, int]:
    if face == "U":
        return col - 1, 1, row - 1
    if face == "R":
        return 1, 1 - row, 1 - col
    if face == "F":
        return col - 1, 1 - row, 1
    if face == "D":
        return col - 1, -1, 1 - row
    if face == "L":
        return -1, 1 - row, col - 1
    return 1 - col, 1 - row, -1


_FACELETS = tuple(
    (_position(face, row, col), _NORMAL[face])
    for face in FACE_ORDER for row in range(3) for col in range(3)
)
_INDEX = {facelet: index for index, facelet in enumerate(_FACELETS)}


def _rotate(vector: tuple[int, int, int], axis: int, quarter: int) -> tuple[int, int, int]:
    x, y, z = vector
    if axis == 0:
        return (x, -quarter * z, quarter * y)
    if axis == 1:
        return (quarter * z, y, -quarter * x)
    return (-quarter * y, quarter * x, z)


def _clockwise_permutation(face: str) -> tuple[int, ...]:
    axis, layer = _AXIS_LAYER[face]
    permutation = list(range(54))
    for source, (position, normal) in enumerate(_FACELETS):
        if position[axis] == layer:
            destination = _INDEX[
                (_rotate(position, axis, -layer), _rotate(normal, axis, -layer))
            ]
            permutation[source] = destination
    return tuple(permutation)


_PERMUTATIONS = {face: _clockwise_permutation(face) for face in FACE_ORDER}


class RubikCube:
    def __init__(self, facelets: str = SOLVED_FACELETS) -> None:
        if len(facelets) != 54 or Counter(facelets) != Counter(SOLVED_FACELETS):
            raise ValueError("Cube must contain 54 URFDLB facelets, nine of each")
        self._facelets = list(facelets)

    def apply_move(self, move: str) -> "RubikCube":
        if len(move) not in (1, 2) or move[0] not in FACE_ORDER or move[1:] not in ("", "'", "2"):
            raise ValueError(f"Unsupported Rubik move: {move!r}")
        turns = 2 if move.endswith("2") else 3 if move.endswith("'") else 1
        permutation = _PERMUTATIONS[move[0]]
        for _ in range(turns):
            updated = self._facelets.copy()
            for source, destination in enumerate(permutation):
                updated[destination] = self._facelets[source]
            self._facelets = updated
        return self

    def apply_moves(self, moves: Iterable[str] | str) -> "RubikCube":
        for move in moves.split() if isinstance(moves, str) else moves:
            self.apply_move(move)
        return self

    def to_facelets(self) -> str:
        return "".join(self._facelets)

    def is_solved(self) -> bool:
        return self.to_facelets() == SOLVED_FACELETS
