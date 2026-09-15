"""Outbound notification channels: email, SMS, WhatsApp, push.

Every channel is a small provider class with `send(destination, title, body) -> provider_ref`.
`enqueue()` writes one NotificationDelivery row per enabled channel (outbox pattern);
`process_queue()` — called by the background worker or a cron — sends them with retries.
"""
import base64
import json
import logging
import smtplib
from datetime import timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
from sqlalchemy.orm import Session

from .. import config
from ..models import DeviceToken, Notification, NotificationDelivery, User, utcnow

log = logging.getLogger("mysupplier.channels")


# ------------------------------------------------------------------ providers
class ConsoleProvider:
    name = "console"

    def __init__(self, channel: str):
        self.channel = channel

    def send(self, destination: str, title: str, body: str) -> str:
        log.info("[%s → %s] %s — %s", self.channel, destination, title, body)
        return f"console-{utcnow().timestamp():.0f}"


class SMTPEmail:
    name = "smtp"

    def send(self, destination: str, title: str, body: str) -> str:
        msg = MIMEMultipart("alternative")
        msg["Subject"], msg["From"], msg["To"] = title, config.SMTP_FROM, destination
        msg.attach(MIMEText(body, "plain", "utf-8"))
        html = f"<div dir='auto' style='font-family:sans-serif'><h3>{title}</h3><p>{body}</p><p style='color:#888'>{config.PLATFORM_NAME} · {config.WEB_BASE_URL}</p></div>"
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as s:
            if config.SMTP_TLS:
                s.starttls()
            if config.SMTP_USER:
                s.login(config.SMTP_USER, config.SMTP_PASSWORD)
            s.sendmail(config.SMTP_FROM, [destination], msg.as_string())
        return "smtp-ok"


class UnifonicSMS:
    """Unifonic REST API (Saudi Arabia)."""
    name = "unifonic"

    def send(self, destination: str, title: str, body: str) -> str:
        r = httpx.post("https://el.cloud.unifonic.com/rest/SMS/messages", timeout=20, data={
            "AppSid": config.UNIFONIC_APP_SID, "SenderID": config.UNIFONIC_SENDER_ID,
            "Recipient": destination.lstrip("+"), "Body": f"{title}\n{body}".strip()})
        r.raise_for_status()
        data = r.json()
        if not data.get("success", True) in (True, "true"):
            raise RuntimeError(data.get("message", "unifonic error"))
        return str(data.get("data", {}).get("MessageID", "unifonic-ok"))


class TwilioSMS:
    name = "twilio"

    def __init__(self, whatsapp: bool = False):
        self.whatsapp = whatsapp

    def send(self, destination: str, title: str, body: str) -> str:
        frm = config.TWILIO_WHATSAPP_FROM if self.whatsapp else config.TWILIO_FROM
        to = f"whatsapp:{destination}" if self.whatsapp else destination
        r = httpx.post(f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_ACCOUNT_SID}/Messages.json",
                       auth=(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN), timeout=20,
                       data={"From": frm, "To": to, "Body": f"{title}\n{body}".strip()})
        r.raise_for_status()
        return r.json().get("sid", "twilio-ok")


class MetaWhatsApp:
    """WhatsApp Cloud API (Meta). Uses a plain text message; switch to templates for outbound outside the 24h window."""
    name = "meta"

    def send(self, destination: str, title: str, body: str) -> str:
        r = httpx.post(f"https://graph.facebook.com/v19.0/{config.META_WA_PHONE_ID}/messages", timeout=20,
                       headers={"Authorization": f"Bearer {config.META_WA_TOKEN}"},
                       json={"messaging_product": "whatsapp", "to": destination.lstrip("+"), "type": "text",
                             "text": {"body": f"*{title}*\n{body}".strip()}})
        r.raise_for_status()
        return r.json().get("messages", [{}])[0].get("id", "meta-ok")


class ExpoPush:
    """Expo push service — works for iOS and Android builds made with Expo/EAS."""
    name = "expo"

    def send(self, destination: str, title: str, body: str, data: dict | None = None) -> str:
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if config.EXPO_ACCESS_TOKEN:
            headers["Authorization"] = f"Bearer {config.EXPO_ACCESS_TOKEN}"
        r = httpx.post("https://exp.host/--/api/v2/push/send", timeout=20, headers=headers,
                       json=[{"to": destination, "title": title, "body": body, "data": data or {}, "sound": "default"}])
        r.raise_for_status()
        ticket = r.json().get("data", [{}])[0]
        if ticket.get("status") == "error":
            raise RuntimeError(ticket.get("message", "expo error"))
        return ticket.get("id", "expo-ok")


def provider_for(channel: str):
    if channel == "email":
        return SMTPEmail() if config.EMAIL_PROVIDER == "smtp" else ConsoleProvider("email")
    if channel == "sms":
        return {"unifonic": UnifonicSMS, "twilio": TwilioSMS}.get(config.SMS_PROVIDER, lambda: ConsoleProvider("sms"))()
    if channel == "whatsapp":
        if config.WHATSAPP_PROVIDER == "twilio":
            return TwilioSMS(whatsapp=True)
        if config.WHATSAPP_PROVIDER == "meta":
            return MetaWhatsApp()
        return ConsoleProvider("whatsapp")
    if channel == "push":
        return ExpoPush() if config.PUSH_PROVIDER == "expo" else ConsoleProvider("push")
    raise ValueError(channel)


def send_direct(channel: str, destination: str, title: str, body: str) -> str:
    """Synchronous send outside the outbox (used for OTP codes)."""
    return provider_for(channel).send(destination, title, body)


# ------------------------------------------------------------------ outbox
def enqueue(db: Session, notification: Notification, user: User) -> list[NotificationDelivery]:
    """Create delivery rows according to the user's preferences. Caller commits."""
    rows: list[NotificationDelivery] = []
    if user.notify_email and user.email:
        rows.append(NotificationDelivery(notification_id=notification.id, user_id=user.id, channel="email", destination=user.email))
    if user.notify_sms and user.phone:
        rows.append(NotificationDelivery(notification_id=notification.id, user_id=user.id, channel="sms", destination=user.phone))
    if user.notify_whatsapp and user.phone:
        rows.append(NotificationDelivery(notification_id=notification.id, user_id=user.id, channel="whatsapp", destination=user.phone))
    if user.notify_push:
        for d in db.query(DeviceToken).filter(DeviceToken.user_id == user.id).all():
            rows.append(NotificationDelivery(notification_id=notification.id, user_id=user.id, channel="push", destination=d.token))
    for r in rows:
        db.add(r)
    return rows


def process_queue(db: Session, limit: int = 100) -> dict:
    """Send queued deliveries whose next_attempt_at has passed. Returns counters."""
    now = utcnow()
    rows = (db.query(NotificationDelivery).filter(NotificationDelivery.status == "queued", NotificationDelivery.next_attempt_at <= now)
            .order_by(NotificationDelivery.id).limit(limit).all())
    sent = failed = retried = 0
    for d in rows:
        n = db.get(Notification, d.notification_id)
        if not n:
            d.status, d.error = "failed", "notification missing"
            failed += 1
            continue
        d.attempts += 1
        try:
            prov = provider_for(d.channel)
            d.provider = prov.name
            if d.channel == "push":
                d.provider_ref = prov.send(d.destination, n.title, n.body, {"ref_type": n.ref_type, "ref_id": n.ref_id}) if isinstance(prov, ExpoPush) else prov.send(d.destination, n.title, n.body)
            else:
                d.provider_ref = prov.send(d.destination, n.title, n.body)
            d.status, d.sent_at, d.error = "sent", utcnow(), ""
            sent += 1
        except Exception as exc:  # noqa: BLE001 — record and retry
            d.error = str(exc)[:400]
            if d.attempts >= config.NOTIFY_MAX_ATTEMPTS:
                d.status = "failed"
                failed += 1
            else:
                d.next_attempt_at = utcnow() + timedelta(seconds=30 * (2 ** (d.attempts - 1)))
                retried += 1
    db.commit()
    return {"sent": sent, "failed": failed, "retried": retried, "picked": len(rows)}


def digest_json(obj) -> str:
    return base64.b64encode(json.dumps(obj, ensure_ascii=False).encode()).decode()
