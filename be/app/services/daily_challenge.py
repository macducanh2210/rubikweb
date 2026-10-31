"""Shared scrambles in Vietnam time, with one immutable result per day."""

from datetime import date, datetime, time, timedelta, timezone
from secrets import choice

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.models.daily_challenge import DailyChallenge, DailyChallengeAttempt
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.daily_challenge import (
    DailyAttemptData,
    DailyAttemptRequest,
    DailyChallengeData,
    DailyLeaderboardData,
    DailyLeaderboardEntry,
)

VIETNAM_TIMEZONE = timezone(timedelta(hours=7))
FACE_AXIS = {"U": "y", "D": "y", "R": "x", "L": "x", "F": "z", "B": "z"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def challenge_date(now: datetime) -> date:
    return now.astimezone(VIETNAM_TIMEZONE).date()


def day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=VIETNAM_TIMEZONE).astimezone(timezone.utc)
    return start, start + timedelta(days=1)


def generate_scramble() -> list[str]:
    moves: list[str] = []
    previous_axis: str | None = None
    for _ in range(20):
        face = choice([face for face, axis in FACE_AXIS.items() if axis != previous_axis])
        moves.append(face + choice(("", "'", "2")))
        previous_axis = FACE_AXIS[face]
    return moves


def _get_or_create_challenge(day: date, db: Session) -> DailyChallenge:
    existing = db.scalar(select(DailyChallenge).where(DailyChallenge.date == day))
    if existing is not None:
        return existing
    challenge = DailyChallenge(date=day, scramble=generate_scramble())
    db.add(challenge)
    try:
        db.commit()
    except IntegrityError:
        # Another worker may have created today's scramble since our SELECT.
        db.rollback()
        existing = db.scalar(select(DailyChallenge).where(DailyChallenge.date == day))
        if existing is None:
            raise
        return existing
    db.refresh(challenge)
    return challenge


def _attempt_data(attempt: DailyChallengeAttempt) -> DailyAttemptData:
    return DailyAttemptData(id=attempt.id, duration_cs=attempt.duration_cs, created_at=attempt.created_at)


def get_challenge(current_user: User, db: Session) -> SuccessResponse[DailyChallengeData]:
    now = utc_now()
    challenge = _get_or_create_challenge(challenge_date(now), db)
    starts_at, ends_at = day_bounds(challenge.date)
    attempt = db.scalar(select(DailyChallengeAttempt).where(
        DailyChallengeAttempt.challenge_id == challenge.id,
        DailyChallengeAttempt.user_id == current_user.id,
    ))
    return SuccessResponse(data=DailyChallengeData(
        id=challenge.id,
        date=challenge.date,
        scramble=challenge.scramble,
        starts_at=starts_at,
        ends_at=ends_at,
        server_time=now,
        my_attempt=_attempt_data(attempt) if attempt is not None else None,
    ))


def _saved_attempt(
    request: DailyAttemptRequest, user_id: int, db: Session
) -> DailyChallengeAttempt | None:
    attempt = db.scalar(select(DailyChallengeAttempt).where(
        DailyChallengeAttempt.user_id == user_id,
        DailyChallengeAttempt.client_attempt_id == str(request.client_attempt_id),
    ))
    if attempt is not None and (
        attempt.challenge_id != request.challenge_id or attempt.duration_cs != request.duration_cs
    ):
        raise APIError(409, "ATTEMPT_CONFLICT", "UUID của lượt thi đã được dùng với nội dung khác")
    return attempt


def _existing_official(challenge_id: int, user_id: int, db: Session) -> DailyChallengeAttempt | None:
    return db.scalar(select(DailyChallengeAttempt).where(
        DailyChallengeAttempt.challenge_id == challenge_id,
        DailyChallengeAttempt.user_id == user_id,
    ))


def create_attempt(
    request: DailyAttemptRequest, current_user: User, db: Session
) -> tuple[SuccessResponse[DailyAttemptData], bool]:
    # Idempotency is checked before expiry: a response lost just before midnight
    # can be retrieved afterwards without recording a second official attempt.
    saved = _saved_attempt(request, current_user.id, db)
    if saved is not None:
        return SuccessResponse(data=_attempt_data(saved)), False
    now = utc_now()
    challenge = db.get(DailyChallenge, request.challenge_id)
    if challenge is None:
        raise APIError(404, "DAILY_CHALLENGE_NOT_FOUND", "Không tìm thấy thử thách mỗi ngày")
    if challenge.date != challenge_date(now):
        raise APIError(400, "DAILY_CHALLENGE_EXPIRED", "Thử thách đã qua ngày; hãy mở thử thách hôm nay")
    if _existing_official(challenge.id, current_user.id, db) is not None:
        raise APIError(409, "DAILY_ATTEMPT_EXISTS", "Bạn đã có một lượt thi chính thức trong ngày này")
    attempt = DailyChallengeAttempt(
        challenge_id=challenge.id,
        user_id=current_user.id,
        duration_cs=request.duration_cs,
        client_attempt_id=str(request.client_attempt_id),
        created_at=now.astimezone(timezone.utc).replace(tzinfo=None),
    )
    db.add(attempt)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        saved = _saved_attempt(request, current_user.id, db)
        if saved is not None:
            return SuccessResponse(data=_attempt_data(saved)), False
        if _existing_official(request.challenge_id, current_user.id, db) is not None:
            raise APIError(409, "DAILY_ATTEMPT_EXISTS", "Bạn đã có một lượt thi chính thức trong ngày này") from None
        raise
    db.refresh(attempt)
    return SuccessResponse(data=_attempt_data(attempt)), True


def get_leaderboard(
    challenge_id: int | None, limit: int, current_user: User, db: Session
) -> SuccessResponse[DailyLeaderboardData]:
    challenge = (
        _get_or_create_challenge(challenge_date(utc_now()), db)
        if challenge_id is None else db.get(DailyChallenge, challenge_id)
    )
    if challenge is None:
        raise APIError(404, "DAILY_CHALLENGE_NOT_FOUND", "Không tìm thấy thử thách mỗi ngày")
    rows = db.execute(
        select(DailyChallengeAttempt, User)
        .join(User, DailyChallengeAttempt.user_id == User.id)
        .where(DailyChallengeAttempt.challenge_id == challenge.id, User.status == "active")
        .order_by(DailyChallengeAttempt.duration_cs.asc(), DailyChallengeAttempt.created_at.asc(), User.id.asc())
    ).all()
    my_rank = next((rank for rank, (_, user) in enumerate(rows, 1) if user.id == current_user.id), None)
    items = [DailyLeaderboardEntry(
        rank=rank,
        user_id=user.id,
        username=user.username,
        display_name=user.display_name,
        duration_cs=attempt.duration_cs,
        created_at=attempt.created_at,
    ) for rank, (attempt, user) in enumerate(rows[:limit], 1)]
    return SuccessResponse(data=DailyLeaderboardData(
        challenge_id=challenge.id,
        date=challenge.date,
        items=items,
        total_participants=len(rows),
        my_rank=my_rank,
    ))
