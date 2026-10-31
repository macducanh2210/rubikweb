"""Solve a JSON batch of URFDLB facelet strings with the backend's Kociemba library."""

import json
import sys
from pathlib import Path

import kociemba

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "be"))
from app.services.solver import to_kociemba_facelets


def main() -> None:
    cases = json.load(sys.stdin)
    solutions = []
    for number, case in enumerate(cases, start=1):
        actual_facelets = to_kociemba_facelets(case["state"])
        if actual_facelets != case["facelets"]:
            raise ValueError(f"Case {number}: backend facelet conversion differs")
        solutions.append(kociemba.solve(actual_facelets))
    json.dump(solutions, sys.stdout)


if __name__ == "__main__":
    main()
