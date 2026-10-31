from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import re
import secrets

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.password_reset_otp import PasswordResetOTP
from app.models.registration_otp import RegistrationOTP
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import (
    AuthTokenData,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    LogoutRequest,
    OTPDispatchData,
    RefreshRequest,
    RegisterRequest,
    RegistrationOTPRequest,
    ResetPasswordRequest,
    ResetTokenData,
    TokenPairData,
    VerifyOTPRequest,
)
from app.schemas.common import MessageData, SuccessResponse
from app.schemas.user import UserTokenProfile
from app.services import email as email_service
from app.services.google_identity import verify_google_identity

USERNAME_PATTERN = re.compile(r"^[a-z0-9_]{3,30}$")
OTP_EXPIRE_SECONDS = 300
OTP_RESEND_SECONDS = 60
OTP_MAX_ATTEMPTS = 5


def _registration_otp_hash(email: str, code: str) -> str:
    return hmac.new(
        settings.jwt_secret.encode("utf-8"),
        f"registration:{email}:{code}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _validation_error(field: str) -> APIError:
    return APIError(
        400,
        "VALIDATION_ERROR",
        "Dữ liệu yêu cầu không hợp lệ",
        {"fields": {field: f"Thiếu trường {field}"}},
    )


def _require_non_empty(field: str, value: str) -> None:
    if not value or not value.strip():
        raise _validation_error(field)


def _normalize_email(email: str, *, register: bool = False) -> str:
    _require_non_empty("email", email)
    try:
        return validate_email(
            email.strip(),
            check_deliverability=False,
        ).normalized.lower()
    except EmailNotValidError:
        if register:
            raise APIError(400, "INVALID_EMAIL_FORMAT", "Email không đúng định dạng") from None
        raise APIError(
            400,
            "VALIDATION_ERROR",
            "Dữ liệu yêu cầu không hợp lệ",
            {"fields": {"email": "Giá trị email không hợp lệ"}},
        ) from None


def _validate_password(password: str, field: str = "password") -> None:
    _require_non_empty(field, password)
    if len(password) < 8:
        raise APIError(400, "WEAK_PASSWORD", "Mật khẩu phải có ít nhất 8 ký tự")


def _refresh_expiration(token: str) -> datetime:
    payload = decode_token(token)
    return datetime.fromtimestamp(int(payload["exp"]), tz=timezone.utc)


def _create_and_store_refresh_token(db: Session, user_id: int) -> str:
    token = create_refresh_token(user_id)
    db.add(
        RefreshToken(
            user_id=user_id,
            token=token,
            revoked=False,
            expires_at=_refresh_expiration(token),
        )
    )
    return token


def _auth_response(db: Session, user: User) -> SuccessResponse[AuthTokenData]:
    access_token = create_access_token(user.id)
    refresh_token = _create_and_store_refresh_token(db, user.id)
    return SuccessResponse(
        data=AuthTokenData(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user=UserTokenProfile.model_validate(user),
        )
    )


def send_registration_otp(
    request: RegistrationOTPRequest,
    db: Session,
) -> SuccessResponse[OTPDispatchData]:
    email = _normalize_email(request.email, register=True)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise APIError(409, "EMAIL_EXISTS", "Email đã tồn tại")

    now = _now()
    pending = db.scalar(
        select(RegistrationOTP)
        .where(RegistrationOTP.email == email)
        .with_for_update()
    )
    if pending is not None:
        created_at = _as_utc(pending.expires_at) - timedelta(seconds=OTP_EXPIRE_SECONDS)
        if now < created_at + timedelta(seconds=OTP_RESEND_SECONDS):
            raise APIError(429, "OTP_RATE_LIMITED", "Vui lòng chờ 60 giây trước khi gửi lại mã OTP")

    code = f"{secrets.randbelow(1_000_000):06d}"
    if pending is None:
        pending = RegistrationOTP(email=email, otp_hash="", attempts=0, expires_at=now)
        db.add(pending)
    pending.otp_hash = _registration_otp_hash(email, code)
    pending.attempts = 0
    pending.expires_at = now + timedelta(seconds=OTP_EXPIRE_SECONDS)
    try:
        db.flush()
        email_service.send_registration_otp(email, code)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(429, "OTP_RATE_LIMITED", "Vui lòng chờ trước khi gửi lại mã OTP") from None
    except Exception:
        db.rollback()
        raise APIError(500, "EMAIL_SEND_FAILED", "Không thể gửi email OTP") from None

    return SuccessResponse(
        data=OTPDispatchData(message="Đã gửi mã OTP tới email", expires_in=OTP_EXPIRE_SECONDS)
    )


def register(
    request: RegisterRequest,
    db: Session,
) -> SuccessResponse[AuthTokenData]:
    _require_non_empty("username", request.username)
    if not USERNAME_PATTERN.fullmatch(request.username):
        raise APIError(
            400,
            "INVALID_USERNAME_FORMAT",
            "Tên đăng nhập chỉ gồm chữ thường, số, dấu gạch dưới và dài 3-30 ký tự",
        )

    email = _normalize_email(request.email, register=True)
    _validate_password(request.password)
    _require_non_empty("display_name", request.display_name)
    display_name = request.display_name.strip()
    if len(display_name) > 50:
        raise APIError(
            400,
            "VALIDATION_ERROR",
            "Dữ liệu yêu cầu không hợp lệ",
            {"fields": {"display_name": "Tên hiển thị tối đa 50 ký tự"}},
        )

    if db.scalar(select(User.id).where(User.username == request.username)) is not None:
        raise APIError(409, "USERNAME_EXISTS", "Tên đăng nhập đã tồn tại")
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise APIError(409, "EMAIL_EXISTS", "Email đã tồn tại")

    _require_non_empty("otp_code", request.otp_code)
    if len(request.otp_code) != 6 or not request.otp_code.isdigit():
        raise APIError(400, "INVALID_OTP", "Mã OTP không hợp lệ")
    pending = db.scalar(
        select(RegistrationOTP)
        .where(RegistrationOTP.email == email)
        .with_for_update()
    )
    if pending is None:
        raise APIError(400, "INVALID_OTP", "Mã OTP không hợp lệ")
    if _as_utc(pending.expires_at) <= _now():
        raise APIError(400, "OTP_EXPIRED", "Mã OTP đã hết hạn")
    if pending.attempts >= OTP_MAX_ATTEMPTS:
        raise APIError(429, "OTP_MAX_ATTEMPTS", "Đã vượt quá số lần nhập OTP")
    if not secrets.compare_digest(
        pending.otp_hash, _registration_otp_hash(email, request.otp_code)
    ):
        pending.attempts += 1
        db.commit()
        if pending.attempts >= OTP_MAX_ATTEMPTS:
            raise APIError(429, "OTP_MAX_ATTEMPTS", "Đã vượt quá số lần nhập OTP")
        raise APIError(400, "INVALID_OTP", "Mã OTP không hợp lệ")

    user = User(
        username=request.username,
        email=email,
        password_hash=hash_password(request.password),
        display_name=display_name,
        role="user",
        status="active",
    )
    db.add(user)
    db.delete(pending)
    try:
        db.flush()
        response = _auth_response(db, user)
        db.commit()
        return response
    except IntegrityError:
        db.rollback()
        if db.scalar(select(User.id).where(User.username == request.username)) is not None:
            raise APIError(409, "USERNAME_EXISTS", "Tên đăng nhập đã tồn tại") from None
        if db.scalar(select(User.id).where(User.email == email)) is not None:
            raise APIError(409, "EMAIL_EXISTS", "Email đã tồn tại") from None
        raise


def login(request: LoginRequest, db: Session) -> SuccessResponse[AuthTokenData]:
    _require_non_empty("identifier", request.identifier)
    _require_non_empty("password", request.password)
    identifier = request.identifier.strip()
    user = db.scalar(
        select(User).where(
            or_(User.username == identifier, User.email == identifier.lower())
        )
    )
    if (
        user is None
        or user.status == "deleted"
        or not verify_password(request.password, user.password_hash)
    ):
        raise APIError(401, "INVALID_CREDENTIALS", "Thông tin đăng nhập không chính xác")
    if user.status == "locked":
        raise APIError(403, "ACCOUNT_LOCKED", "Tài khoản đã bị khóa")

    response = _auth_response(db, user)
    db.commit()
    return response


def _google_username(email: str, sub: str, db: Session) -> str:
    stem = re.sub(r"[^a-z0-9_]+", "_", email.split("@", 1)[0].lower()).strip("_")
    stem = (stem or "google")[:17]
    if len(stem) < 3:
        stem = f"google_{stem}"
    digest = hashlib.sha256(sub.encode("utf-8")).hexdigest()
    for length in (10, 12, 14):
        username = f"{stem[:29 - length]}_{digest[:length]}"
        if db.scalar(select(User.id).where(User.username == username)) is None:
            return username
    raise APIError(500, "INTERNAL_ERROR", "Không thể tạo tên đăng nhập")


def google_login(
    request: GoogleAuthRequest, db: Session
) -> SuccessResponse[AuthTokenData]:
    identity = verify_google_identity(request.id_token)
    user = db.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        if db.scalar(select(User.id).where(User.email == identity.email)) is not None:
            raise APIError(
                409, "GOOGLE_LINK_REQUIRED",
                "Email đã có tài khoản. Hãy đăng nhập bằng mật khẩu rồi liên kết Google trong Hồ sơ",
            )
        user = User(
            username=_google_username(identity.email, identity.sub, db),
            email=identity.email,
            password_hash=None,
            google_sub=identity.sub,
            display_name=identity.name,
            role="user",
            status="active",
        )
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise APIError(409, "GOOGLE_LINK_REQUIRED", "Email đã có tài khoản. Hãy đăng nhập bằng mật khẩu rồi liên kết Google trong Hồ sơ") from None
    elif user.status == "deleted":
        raise APIError(401, "INVALID_CREDENTIALS", "Thông tin đăng nhập không chính xác")
    elif user.status == "locked":
        raise APIError(403, "ACCOUNT_LOCKED", "Tài khoản đã bị khóa")

    response = _auth_response(db, user)
    db.commit()
    return response


def link_google(
    request: GoogleAuthRequest, current_user: User, db: Session
) -> SuccessResponse[MessageData]:
    identity = verify_google_identity(request.id_token)
    if current_user.google_sub == identity.sub:
        return SuccessResponse(data=MessageData(message="Đã liên kết tài khoản Google"))
    if current_user.google_sub is not None or identity.email != current_user.email:
        raise APIError(409, "GOOGLE_ACCOUNT_MISMATCH", "Tài khoản Google phải dùng cùng email với tài khoản hiện tại")
    if db.scalar(select(User.id).where(User.google_sub == identity.sub)) is not None:
        raise APIError(409, "GOOGLE_ACCOUNT_IN_USE", "Tài khoản Google đã liên kết với tài khoản khác")
    current_user.google_sub = identity.sub
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(409, "GOOGLE_ACCOUNT_IN_USE", "Tài khoản Google đã liên kết với tài khoản khác") from None
    return SuccessResponse(data=MessageData(message="Đã liên kết tài khoản Google"))


def _invalid_refresh_token() -> APIError:
    return APIError(401, "INVALID_REFRESH_TOKEN", "Refresh token không hợp lệ hoặc đã hết hạn")


def refresh(request: RefreshRequest, db: Session) -> SuccessResponse[TokenPairData]:
    _require_non_empty("refresh_token", request.refresh_token)
    try:
        payload = decode_token(request.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError("Wrong token type")
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise _invalid_refresh_token() from None

    stored_token = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token == request.refresh_token)
        .with_for_update()
    )
    if (
        stored_token is None
        or stored_token.revoked
        or stored_token.user_id != user_id
        or _as_utc(stored_token.expires_at) <= _now()
    ):
        raise _invalid_refresh_token()

    user = db.get(User, user_id)
    if user is None or user.status != "active":
        stored_token.revoked = True
        db.commit()
        raise _invalid_refresh_token()

    stored_token.revoked = True
    new_refresh_token = _create_and_store_refresh_token(db, user.id)
    access_token = create_access_token(user.id)
    db.commit()
    return SuccessResponse(
        data=TokenPairData(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
        )
    )


def logout(
    request: LogoutRequest,
    current_user: User,
    db: Session,
) -> SuccessResponse[MessageData]:
    _require_non_empty("refresh_token", request.refresh_token)
    stored_token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token == request.refresh_token,
            RefreshToken.user_id == current_user.id,
        )
    )
    if stored_token is not None and not stored_token.revoked:
        stored_token.revoked = True
        db.commit()
    return SuccessResponse(data=MessageData(message="Đăng xuất thành công"))


def forgot_password(
    request: ForgotPasswordRequest,
    db: Session,
) -> SuccessResponse[OTPDispatchData]:
    email = _normalize_email(request.email)
    user = db.scalar(
        select(User).where(User.email == email, User.status != "deleted")
    )
    if user is None:
        raise APIError(404, "EMAIL_NOT_FOUND", "Email chưa được đăng ký")

    now = _now()
    latest_otp = db.scalar(
        select(PasswordResetOTP)
        .where(PasswordResetOTP.user_id == user.id)
        .order_by(PasswordResetOTP.id.desc())
        .limit(1)
    )
    if latest_otp is not None:
        created_at = _as_utc(latest_otp.expires_at) - timedelta(
            seconds=OTP_EXPIRE_SECONDS
        )
        if now < created_at + timedelta(seconds=OTP_RESEND_SECONDS):
            raise APIError(
                429,
                "OTP_RATE_LIMITED",
                "Vui lòng chờ 60 giây trước khi gửi lại mã OTP",
            )

    db.execute(delete(PasswordResetOTP).where(PasswordResetOTP.user_id == user.id))
    otp_code = f"{secrets.randbelow(1_000_000):06d}"
    otp = PasswordResetOTP(
        user_id=user.id,
        otp_code=otp_code,
        attempts=0,
        expires_at=now + timedelta(seconds=OTP_EXPIRE_SECONDS),
        used=False,
    )
    db.add(otp)
    db.flush()
    try:
        email_service.send_password_reset_otp(user.email, otp_code)
        db.commit()
    except Exception:
        db.rollback()
        raise APIError(500, "EMAIL_SEND_FAILED", "Không thể gửi email OTP") from None

    return SuccessResponse(
        data=OTPDispatchData(
            message="Đã gửi mã OTP tới email",
            expires_in=OTP_EXPIRE_SECONDS,
        )
    )


def verify_otp(
    request: VerifyOTPRequest,
    db: Session,
) -> SuccessResponse[ResetTokenData]:
    email = _normalize_email(request.email)
    _require_non_empty("otp_code", request.otp_code)
    if len(request.otp_code) != 6 or not request.otp_code.isdigit():
        raise APIError(400, "INVALID_OTP", "Mã OTP không hợp lệ")

    user = db.scalar(
        select(User).where(User.email == email, User.status != "deleted")
    )
    if user is None:
        raise APIError(400, "INVALID_OTP", "Mã OTP không hợp lệ")

    otp = db.scalar(
        select(PasswordResetOTP)
        .where(
            PasswordResetOTP.user_id == user.id,
            PasswordResetOTP.used.is_(False),
        )
        .order_by(PasswordResetOTP.id.desc())
        .limit(1)
        .with_for_update()
    )
    if otp is None:
        raise APIError(400, "INVALID_OTP", "Mã OTP không hợp lệ")
    if _as_utc(otp.expires_at) <= _now():
        raise APIError(400, "OTP_EXPIRED", "Mã OTP đã hết hạn")
    if otp.attempts >= OTP_MAX_ATTEMPTS:
        raise APIError(429, "OTP_MAX_ATTEMPTS", "Đã vượt quá số lần nhập OTP")
    if not secrets.compare_digest(otp.otp_code, request.otp_code):
        otp.attempts += 1
        db.commit()
        if otp.attempts >= OTP_MAX_ATTEMPTS:
            raise APIError(429, "OTP_MAX_ATTEMPTS", "Đã vượt quá số lần nhập OTP")
        raise APIError(400, "INVALID_OTP", "Mã OTP không hợp lệ")

    otp.used = True
    # The reset token gets its own full five-minute validity window.
    otp.expires_at = _now() + timedelta(seconds=OTP_EXPIRE_SECONDS)
    reset_token = create_reset_token(user.id, otp.id)
    db.commit()
    return SuccessResponse(
        data=ResetTokenData(
            reset_token=reset_token,
            expires_in=OTP_EXPIRE_SECONDS,
        )
    )


def reset_password(
    request: ResetPasswordRequest,
    db: Session,
) -> SuccessResponse[MessageData]:
    _require_non_empty("reset_token", request.reset_token)
    _validate_password(request.new_password, "new_password")
    try:
        payload = decode_token(request.reset_token)
        if payload.get("type") != "reset":
            raise ValueError("Wrong token type")
        user_id = int(payload["sub"])
        otp_id = int(payload["otp_id"])
    except (KeyError, TypeError, ValueError):
        raise APIError(401, "INVALID_RESET_TOKEN", "Reset token không hợp lệ hoặc đã hết hạn") from None

    otp = db.get(PasswordResetOTP, otp_id)
    user = db.get(User, user_id)
    if (
        otp is None
        or not otp.used
        or otp.user_id != user_id
        or _as_utc(otp.expires_at) <= _now()
        or user is None
        or user.status == "deleted"
    ):
        raise APIError(401, "INVALID_RESET_TOKEN", "Reset token không hợp lệ hoặc đã hết hạn")

    user.password_hash = hash_password(request.new_password)
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    db.delete(otp)
    db.commit()
    return SuccessResponse(data=MessageData(message="Đặt lại mật khẩu thành công"))
