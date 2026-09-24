"""Admin-editable platform settings stored in the database, falling back to config defaults."""
from sqlalchemy.orm import Session

from .. import config
from ..models import PlatformSetting

# key -> (default, type, description)
DEFAULTS = {
    "platform_name": (config.PLATFORM_NAME, "str", "Platform name (English)"),
    "platform_name_ar": (config.PLATFORM_NAME_AR, "str", "Platform name (Arabic)"),
    "tagline": (config.PLATFORM_TAGLINE, "str", "Slogan"),
    "platform_fee_pct": (str(config.PLATFORM_FEE_PCT), "float", "Platform fee % deducted from supplier payouts"),
    "vat_rate_pct": (str(round(config.VAT_RATE * 100, 2)), "float", "VAT % (display only; 15% in KSA)"),
    "platform_vat_number": (config.PLATFORM_VAT_NUMBER, "str", "Platform VAT number (invoices)"),
    "bank_instructions": (config.PLATFORM_BANK_INSTRUCTIONS, "text", "Bank transfer instructions shown to buyers"),
    "support_email": ("support@mysupplier.sa", "str", "Support email"),
    "support_phone": ("+966 5X XXX XXXX", "str", "Support phone / WhatsApp"),
    "home_banner_text": ("", "text", "Announcement banner on the home page (empty = hidden)"),
    "home_banner_link": ("", "str", "Banner link"),
    "min_order_amount": ("0", "float", "Minimum direct-order amount (SAR)"),
    "rfq_default_days": ("7", "int", "Default RFQ bidding window (days)"),
    "supplier_registration_open": ("1", "bool", "Allow new supplier registrations"),
    "buyer_registration_open": ("1", "bool", "Allow new buyer registrations"),
    "auto_verify_suppliers": ("0", "bool", "Verify suppliers automatically on registration"),
    "maintenance_message": ("", "text", "Maintenance notice shown on every page (empty = none)"),
}


def get_all(db: Session) -> dict:
    stored = {r.key: r.value for r in db.query(PlatformSetting).all()}
    return {k: stored.get(k, d[0]) for k, d in DEFAULTS.items()}


def get(db: Session, key: str):
    default, kind, _ = DEFAULTS[key]
    row = db.get(PlatformSetting, key)
    raw = row.value if row else default
    if kind == "float":
        try:
            return float(raw)
        except ValueError:
            return float(default)
    if kind == "int":
        try:
            return int(raw)
        except ValueError:
            return int(default)
    if kind == "bool":
        return str(raw).lower() in ("1", "true", "yes", "on")
    return raw


def set_many(db: Session, values: dict) -> dict:
    for k, v in values.items():
        if k not in DEFAULTS:
            continue
        row = db.get(PlatformSetting, k)
        if row:
            row.value = str(v)
        else:
            db.add(PlatformSetting(key=k, value=str(v)))
    db.commit()
    return get_all(db)


def public(db: Session) -> dict:
    """Settings that are safe to expose to the site/app."""
    s = get_all(db)
    return {k: s[k] for k in ("platform_name", "platform_name_ar", "tagline", "support_email", "support_phone", "home_banner_text",
                              "home_banner_link", "maintenance_message", "supplier_registration_open", "buyer_registration_open",
                              "platform_fee_pct", "min_order_amount")}
