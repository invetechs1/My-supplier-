from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuditLog, Supplier, User, utcnow
from .. import config
from ..schemas import (LoginIn, NotificationPrefsIn, OTPRequestIn, OTPVerifyIn, PasswordChangeIn, PasswordResetIn, RegisterIn,
                       TokenOut, UserOut, UserUpdateIn)
from ..security import create_token, get_current_user, hash_password, verify_password
from ..services import otp, settings as platform_settings

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(user: User) -> UserOut:
    data = UserOut.model_validate(user)
    data.supplier_id = user.supplier.id if user.supplier else None
    return data


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "Email already registered")
    if body.role == "supplier" and not platform_settings.get(db, "supplier_registration_open"):
        raise HTTPException(403, "Supplier registration is currently closed")
    if body.role == "buyer" and not platform_settings.get(db, "buyer_registration_open"):
        raise HTTPException(403, "Registration is currently closed")
    verified_dest = otp.check_token(body.otp_token, "register") if body.otp_token else ""
    if config.OTP_REQUIRED and not verified_dest:
        raise HTTPException(400, "Phone or email verification is required — request an OTP first")
    phone = body.phone
    if verified_dest and not verified_dest.startswith("+") and verified_dest != email:
        raise HTTPException(400, "Verification token does not match this email")
    if verified_dest.startswith("+"):
        phone = verified_dest
    user = User(email=email, phone=phone, password_hash=hash_password(body.password), full_name=body.full_name,
                role=body.role, company_name=body.company_name, city=body.city, locale=body.locale,
                phone_verified=verified_dest.startswith("+"), email_verified=verified_dest == email)
    db.add(user)
    db.flush()
    if body.role == "supplier":
        db.add(Supplier(user_id=user.id, name=body.company_name or body.full_name, cr_number=body.cr_number,
                        city=body.city, phone=body.phone, category_ids=body.category_ids,
                        verified=bool(platform_settings.get(db, "auto_verify_suppliers"))))
    db.add(AuditLog(actor_id=user.id, action="register", entity="user", entity_id=user.id, detail={"role": body.role}))
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_token(user), user=user_out(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Account is disabled")
    user.last_login_at = utcnow()
    db.commit()
    return TokenOut(access_token=create_token(user), user=user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/change-password", status_code=204)
def change_password(body: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    db.commit()


# ------------------------------------------------------------------ OTP
@router.post("/otp/request")
def otp_request(body: OTPRequestIn, db: Session = Depends(get_db)):
    """Send a one-time code by SMS/WhatsApp/email. For purpose=reset the destination must belong to a user."""
    if body.purpose in ("reset", "login"):
        dest, _ = otp.normalize_destination(body.destination)
        exists = db.query(User).filter((User.email == dest) | (User.phone == dest)).first()
        if not exists:
            raise HTTPException(404, "No account for this phone/email")
    return otp.request_code(db, body.destination, body.purpose, body.channel)


@router.post("/otp/verify")
def otp_verify(body: OTPVerifyIn, db: Session = Depends(get_db)):
    """Verify a code → short-lived verification token. purpose=login also returns an access token."""
    result = otp.verify_code(db, body.destination, body.code, body.purpose)
    if body.purpose == "login":
        user = db.query(User).filter((User.email == result["destination"]) | (User.phone == result["destination"])).first()
        if not user or not user.is_active:
            raise HTTPException(404, "No active account for this phone/email")
        user.last_login_at = utcnow()
        if result["destination"].startswith("+"):
            user.phone_verified = True
        else:
            user.email_verified = True
        db.commit()
        result["access_token"], result["token_type"], result["user"] = create_token(user), "bearer", user_out(user).model_dump()
    return result


@router.post("/password/reset", status_code=204)
def password_reset(body: PasswordResetIn, db: Session = Depends(get_db)):
    dest = otp.check_token(body.verification_token, "reset")
    user = db.query(User).filter((User.email == dest) | (User.phone == dest)).first()
    if not user:
        raise HTTPException(404, "Account not found")
    user.password_hash = hash_password(body.new_password)
    db.add(AuditLog(actor_id=user.id, action="password.reset", entity="user", entity_id=user.id))
    db.commit()


@router.post("/verify-contact", response_model=UserOut)
def verify_contact(verification_token: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Attach a verified phone/email (purpose=verify) to the logged-in account."""
    dest = otp.check_token(verification_token, "verify")
    if dest.startswith("+"):
        user.phone, user.phone_verified = dest, True
    elif dest == user.email:
        user.email_verified = True
    else:
        raise HTTPException(400, "Verified email does not match the account email")
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.patch("/me/notifications", response_model=UserOut)
def update_prefs(body: NotificationPrefsIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user_out(user)
