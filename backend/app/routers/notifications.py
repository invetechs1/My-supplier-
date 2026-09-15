from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import DeviceToken, Notification, NotificationDelivery, User, utcnow
from ..schemas import DeliveryOut, DeviceIn, NotificationOut
from ..security import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(unread_only: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    return q.order_by(Notification.created_at.desc()).limit(100).all()


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"count": db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read.is_(False)).count()}


@router.post("/read-all", status_code=204)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read.is_(False)).update({"is_read": True})
    db.commit()


@router.post("/{notification_id}/read", status_code=204)
def read_one(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n and n.user_id == user.id:
        n.is_read = True
        db.commit()


@router.post("/devices", status_code=201)
def register_device(body: DeviceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Register an Expo/FCM/APNs push token for the logged-in user (idempotent per token)."""
    d = db.query(DeviceToken).filter(DeviceToken.token == body.token).first()
    if d:
        d.user_id, d.platform, d.device_name, d.last_seen_at = user.id, body.platform, body.device_name, utcnow()
    else:
        d = DeviceToken(user_id=user.id, token=body.token, platform=body.platform, device_name=body.device_name)
        db.add(d)
    db.commit()
    return {"id": d.id, "token": d.token, "platform": d.platform}


@router.delete("/devices/{token}", status_code=204)
def remove_device(token: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(DeviceToken).filter(DeviceToken.token == token, DeviceToken.user_id == user.id).delete()
    db.commit()


@router.get("/deliveries", response_model=list[DeliveryOut])
def my_deliveries(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (db.query(NotificationDelivery).filter(NotificationDelivery.user_id == user.id)
            .order_by(NotificationDelivery.id.desc()).limit(100).all())
