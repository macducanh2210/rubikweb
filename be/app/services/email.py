import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_otp(recipient: str, otp_code: str, purpose: str) -> None:
    smtp_values = [settings.smtp_host, settings.smtp_user, settings.smtp_password]
    if not any(smtp_values):
        logger.warning("Development %s OTP for %s: %s", purpose, recipient, otp_code)
        return
    if not all(smtp_values):
        raise RuntimeError("SMTP configuration is incomplete")

    message = EmailMessage()
    message["Subject"] = f"Mã OTP {purpose}"
    message["From"] = settings.smtp_user
    message["To"] = recipient
    message.set_content(f"Mã OTP {purpose} của bạn là {otp_code}. Mã có hiệu lực 5 phút.")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


def send_password_reset_otp(recipient: str, otp_code: str) -> None:
    _send_otp(recipient, otp_code, "đặt lại mật khẩu")


def send_registration_otp(recipient: str, otp_code: str) -> None:
    _send_otp(recipient, otp_code, "xác nhận đăng ký")
