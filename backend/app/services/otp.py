"""One-time codes for phone/email verification, passwordless login and password reset."""
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .. import config
from ..models import OTPCode, utcnow
from . import channels

PURPOSES = ("register", "login", "reset", "verify")


def normalize_destination(dest: str) -> tuple[str, str]:
    """Return (normalized destination, channel guess). Saudi numbers are normalised to +9665XXXXXXXX."""
    d = dest.strip()
    if "@" in d:
        return d.lower(), "email"
    digits = re.sub(r"\D", "", d)
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("05") and len(digits) == 10:
        digits = "966" + digits[1:]
    elif digits.startswith("5") and len(digits) == 9:
        digits = "966" + digits
    if len(digits) < 9:
        raise HTTPException(400, "Invalid phone number or email")
    return "+" + digits, "sms"


def _hash(code: str, destination: str) -> str:
    return hmac.new(config.JWT_SECRET.encode(), f"{destination}:{code}".encode(), hashlib.sha256).hexdigest()


def _debug_codes_enabled(channel: str) -> bool:
    if config.OTP_DEBUG_RETURN_CODE == "1":
        return True
    if config.OTP_DEBUG_RETURN_CODE == "0":
        return False
    provider = {"sms": config.SMS_PROVIDER, "whatsapp": config.WHATSAPP_PROVIDER, "email": config.EMAIL_PROVIDER}.get(channel, "console")
    return provider == "console"


def request_code(db: Session, destination: str, purpose: str = "register", channel: str | None = None) -> dict:
    if purpose not in PURPOSES:
        raise HTTPException(400, "Unknown purpose")
    dest, guessed = normalize_destination(destination)
    channel = channel or guessed
    if channel == "email" and guessed != "email":
        raise HTTPException(400, "Email channel needs an email address")
    if channel in ("sms", "whatsapp") and guessed != "sms":
        raise HTTPException(400, "SMS/WhatsApp channel needs a phone number")
    recent = db.query(OTPCode).filter(OTPCode.destination == dest, OTPCode.created_at >= utcnow() - timedelta(minutes=10)).count()
    if recent >= config.OTP_MAX_REQUESTS_PER_10MIN:
        raise HTTPException(429, "Too many codes requested — try again in a few minutes")
    db.query(OTPCode).filter(OTPCode.destination == dest, OTPCode.purpose == purpose, OTPCode.consumed.is_(False)).update({"consumed": True})
    code = f"{secrets.randbelow(10**6):06d}"
    row = OTPCode(destination=dest, channel=channel, purpose=purpose, code_hash=_hash(code, dest),
                  expires_at=utcnow() + timedelta(minutes=config.OTP_TTL_MINUTES))
    db.add(row)
    db.commit()
    title = f"{config.PLATFORM_NAME_AR} — رمز التحقق"
    body = f"رمز التحقق الخاص بك: {code}\nصالح لمدة {config.OTP_TTL_MINUTES} دقائق. لا تشاركه مع أحد.\nYour verification code is {code}."
    try:
        channels.send_direct(channel, dest, title, body)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Could not send the code: {exc}")
    out = {"destination": dest, "channel": channel, "expires_in": config.OTP_TTL_MINUTES * 60}
    if _debug_codes_enabled(channel):
        out["debug_code"] = code
    return out


def verify_code(db: Session, destination: str, code: str, purpose: str = "register") -> dict:
    dest, _ = normalize_destination(destination)
    row = (db.query(OTPCode).filter(OTPCode.destination == dest, OTPCode.purpose == purpose, OTPCode.consumed.is_(False))
           .order_by(OTPCode.created_at.desc()).first())
    if not row or row.expires_at < utcnow():
        raise HTTPException(400, "Code expired — request a new one")
    if row.attempts >= config.OTP_MAX_ATTEMPTS:
        row.consumed = True
        db.commit()
        raise HTTPException(400, "Too many attempts — request a new code")
    row.attempts += 1
    if not hmac.compare_digest(row.code_hash, _hash(code.strip(), dest)):
        db.commit()
        raise HTTPException(400, "Incorrect code")
    row.consumed = True
    db.commit()
    now = datetime.now(timezone.utc)
    token = jwt.encode({"otp": dest, "purpose": purpose, "iat": now, "exp": now + timedelta(minutes=15)}, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)
    return {"verification_token": token, "destination": dest}


def check_token(token: str, purpose: str, destination: str | None = None) -> str:
    """Validate a verification token and return the verified destination."""
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(400, "Invalid or expired verification token")
    if payload.get("purpose") != purpose:
        raise HTTPException(400, "Verification token was issued for another purpose")
    dest = payload.get("otp", "")
    if destination:
        want, _ = normalize_destination(destination)
        if want != dest:
            raise HTTPException(400, "Verification token does not match this phone/email")
    return dest
