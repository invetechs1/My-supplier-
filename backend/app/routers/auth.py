from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuditLog, Supplier, User, utcnow
from ..schemas import LoginIn, PasswordChangeIn, RegisterIn, TokenOut, UserOut, UserUpdateIn
from ..security import create_token, get_current_user, hash_password, verify_password

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
    user = User(email=email, phone=body.phone, password_hash=hash_password(body.password), full_name=body.full_name,
                role=body.role, company_name=body.company_name, city=body.city, locale=body.locale)
    db.add(user)
    db.flush()
    if body.role == "supplier":
        db.add(Supplier(user_id=user.id, name=body.company_name or body.full_name, cr_number=body.cr_number,
                        city=body.city, phone=body.phone, category_ids=body.category_ids))
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
