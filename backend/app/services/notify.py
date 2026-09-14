"""In-app notifications (extensible to email/SMS/push via hooks)."""
from sqlalchemy.orm import Session

from ..models import Notification

_hooks: list = []


def register_hook(fn):
    """Register fn(user_id, title, body, kind, ref_type, ref_id) — e.g. push/email/WhatsApp senders."""
    _hooks.append(fn)


def notify(db: Session, user_id: int, title: str, body: str = "", kind: str = "info",
           ref_type: str = "", ref_id: int | None = None) -> Notification:
    n = Notification(user_id=user_id, title=title, body=body, kind=kind, ref_type=ref_type, ref_id=ref_id)
    db.add(n)
    for hook in _hooks:
        try:
            hook(user_id, title, body, kind, ref_type, ref_id)
        except Exception:  # never break the request because a channel failed
            pass
    return n
