"""Timed practice attempts and the two self-reported leaderboards."""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.practice import PracticeAttempt
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.practice import (
    PracticeAttemptData,
    PracticeAttemptListData,
    PracticeAttemptRequest,
    PracticeLeaderboardData,
    PracticeLeaderboardEntry,
)


def average_of_five(times: list[int]) -> int:
    """Drop one best and one worst, then round the remaining mean to 0.01 s."""
    if len(times) != 5:
        raise ValueError("Ao5 cần đúng 5 lượt")
    middle_total = sum(times) - min(times) - max(times)
    return (middle_total + 1) // 3


def _attempt_data(attempt: PracticeAttempt, ao5_cs: int | None) -> PracticeAttemptData:
    return PracticeAttemptData(
        id=attempt.id,
        scramble=attempt.scramble,
        duration_cs=attempt.duration_cs,
        ao5_cs=ao5_cs,
        created_at=attempt.created_at,
    )


def create_attempt(
    request: PracticeAttemptRequest, current_user: User, db: Session
) -> SuccessResponse[PracticeAttemptData]:
    attempt = PracticeAttempt(
        user_id=current_user.id,
        scramble=request.scramble,
        duration_cs=request.duration_cs,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    last_five = db.scalars(
        select(PracticeAttempt)
        .where(PracticeAttempt.user_id == current_user.id)
        .order_by(PracticeAttempt.id.desc())
        .limit(5)
    ).all()
    ao5_cs = average_of_five([row.duration_cs for row in last_five]) if len(last_five) == 5 else None
    return SuccessResponse(data=_attempt_data(attempt, ao5_cs))


def list_attempts(
    page: int, limit: int, current_user: User, db: Session
) -> SuccessResponse[PracticeAttemptListData]:
    attempts = list(db.scalars(
        select(PracticeAttempt)
        .where(PracticeAttempt.user_id == current_user.id)
        .order_by(PracticeAttempt.id.asc())
    ).all())
    ao5_by_id: dict[int, int] = {}
    for index in range(4, len(attempts)):
        ao5_by_id[attempts[index].id] = average_of_five(
            [attempt.duration_cs for attempt in attempts[index - 4:index + 1]]
        )
    newest_first = list(reversed(attempts))
    selected = newest_first[(page - 1) * limit:page * limit]
    return SuccessResponse(data=PracticeAttemptListData(
        items=[_attempt_data(attempt, ao5_by_id.get(attempt.id)) for attempt in selected],
        total=len(attempts),
        page=page,
        limit=limit,
        best_single_cs=min((attempt.duration_cs for attempt in attempts), default=None),
        current_ao5_cs=ao5_by_id.get(attempts[-1].id) if attempts else None,
        best_ao5_cs=min(ao5_by_id.values(), default=None),
    ))


def get_leaderboard(limit: int, db: Session) -> SuccessResponse[PracticeLeaderboardData]:
    rows = db.execute(
        select(PracticeAttempt, User)
        .join(User, PracticeAttempt.user_id == User.id)
        .where(User.status == "active")
        .order_by(PracticeAttempt.user_id.asc(), PracticeAttempt.id.asc())
    ).all()
    grouped: dict[int, list[tuple[PracticeAttempt, User]]] = defaultdict(list)
    for attempt, user in rows:
        grouped[user.id].append((attempt, user))

    summary: list[tuple[User, int, int | None, int]] = []
    for entries in grouped.values():
        user = entries[0][1]
        times = [attempt.duration_cs for attempt, _ in entries]
        ao5_values = [average_of_five(times[index - 4:index + 1]) for index in range(4, len(times))]
        summary.append((user, min(times), min(ao5_values, default=None), len(times)))

    def entry(rank: int, row: tuple[User, int, int | None, int], duration_cs: int) -> PracticeLeaderboardEntry:
        user, _, _, total = row
        return PracticeLeaderboardEntry(
            rank=rank,
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            duration_cs=duration_cs,
            total_attempts=total,
        )

    single_rows = sorted(summary, key=lambda row: (row[1], row[2] if row[2] is not None else 10**12, row[0].id))[:limit]
    ao5_rows = sorted(
        (row for row in summary if row[2] is not None),
        key=lambda row: (row[2], row[1], row[0].id),
    )[:limit]
    return SuccessResponse(data=PracticeLeaderboardData(
        single=[entry(rank, row, row[1]) for rank, row in enumerate(single_rows, start=1)],
        ao5=[entry(rank, row, row[2]) for rank, row in enumerate(ao5_rows, start=1) if row[2] is not None],
    ))
