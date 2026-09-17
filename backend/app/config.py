"""Runtime configuration. Every value can be overridden with an environment variable."""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("MYSUPPLIER_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

PLATFORM_NAME = os.environ.get("PLATFORM_NAME", "My Supplier")
PLATFORM_NAME_AR = os.environ.get("PLATFORM_NAME_AR", "مورّدي")
PLATFORM_TAGLINE = os.environ.get("PLATFORM_TAGLINE", "Build for Less")
PLATFORM_TAGLINE_AR = os.environ.get("PLATFORM_TAGLINE_AR", "ابنِ بأقل تكلفة")

# SQLite by default; set DATABASE_URL=postgresql+psycopg://user:pass@host/db for production.
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DATA_DIR / 'mysupplier.db'}")


def _jwt_secret() -> str:
    env = os.environ.get("JWT_SECRET", "").strip()
    if env:
        return env
    secret_file = DATA_DIR / "jwt.secret"
    if secret_file.exists():
        return secret_file.read_text().strip()
    value = secrets.token_hex(32)
    secret_file.write_text(value)
    return value


JWT_SECRET = _jwt_secret()
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "168"))

VAT_RATE = float(os.environ.get("VAT_RATE", "0.15"))
CURRENCY = "SAR"

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@mysupplier.sa")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@2026")
SEED_DEMO_DATA = os.environ.get("SEED_DEMO_DATA", "1") == "1"

# Offers older than this are flagged as stale in admin price alerts.
STALE_OFFER_DAYS = int(os.environ.get("STALE_OFFER_DAYS", "30"))

# ---------------------------------------------------------------------------
# Payments (escrow: buyer pays the platform, supplier is paid out after delivery)
# ---------------------------------------------------------------------------
PAYMENT_PROVIDER = os.environ.get("PAYMENT_PROVIDER", "mock")  # mock | moyasar
MOYASAR_SECRET_KEY = os.environ.get("MOYASAR_SECRET_KEY", "")
MOYASAR_PUBLISHABLE_KEY = os.environ.get("MOYASAR_PUBLISHABLE_KEY", "")
MOYASAR_WEBHOOK_SECRET = os.environ.get("MOYASAR_WEBHOOK_SECRET", "")
MOYASAR_API_BASE = os.environ.get("MOYASAR_API_BASE", "https://api.moyasar.com/v1")
PLATFORM_FEE_PCT = float(os.environ.get("PLATFORM_FEE_PCT", "2.5"))
PLATFORM_VAT_NUMBER = os.environ.get("PLATFORM_VAT_NUMBER", "300000000000003")
PLATFORM_BANK_INSTRUCTIONS = os.environ.get("PLATFORM_BANK_INSTRUCTIONS",
                                            "Bank: Al Rajhi Bank — IBAN: SA00 0000 0000 0000 0000 0000 — Beneficiary: My Supplier Co.")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
WEB_BASE_URL = os.environ.get("WEB_BASE_URL", PUBLIC_BASE_URL).rstrip("/")

# ---------------------------------------------------------------------------
# OTP (SMS / email one-time codes)
# ---------------------------------------------------------------------------
OTP_REQUIRED = os.environ.get("OTP_REQUIRED", "0") == "1"        # require verified phone/email to register
OTP_TTL_MINUTES = int(os.environ.get("OTP_TTL_MINUTES", "5"))
OTP_MAX_ATTEMPTS = int(os.environ.get("OTP_MAX_ATTEMPTS", "5"))
OTP_MAX_REQUESTS_PER_10MIN = int(os.environ.get("OTP_MAX_REQUESTS_PER_10MIN", "3"))
# When the SMS/email provider is "console" the code is returned in the API response so dev/test flows work end to end.
OTP_DEBUG_RETURN_CODE = os.environ.get("OTP_DEBUG_RETURN_CODE", "auto")  # auto | 1 | 0

# ---------------------------------------------------------------------------
# Notification channels
# ---------------------------------------------------------------------------
SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "console")          # console | unifonic | twilio
UNIFONIC_APP_SID = os.environ.get("UNIFONIC_APP_SID", "")
UNIFONIC_SENDER_ID = os.environ.get("UNIFONIC_SENDER_ID", "MySupplier")
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_FROM", "")
WHATSAPP_PROVIDER = os.environ.get("WHATSAPP_PROVIDER", "console")  # console | twilio | meta
TWILIO_WHATSAPP_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "")
META_WA_PHONE_ID = os.environ.get("META_WA_PHONE_ID", "")
META_WA_TOKEN = os.environ.get("META_WA_TOKEN", "")
EMAIL_PROVIDER = os.environ.get("EMAIL_PROVIDER", "console")      # console | smtp
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "no-reply@mysupplier.sa")
SMTP_TLS = os.environ.get("SMTP_TLS", "1") == "1"
PUSH_PROVIDER = os.environ.get("PUSH_PROVIDER", "expo")           # expo | console
EXPO_ACCESS_TOKEN = os.environ.get("EXPO_ACCESS_TOKEN", "")
NOTIFY_MAX_ATTEMPTS = int(os.environ.get("NOTIFY_MAX_ATTEMPTS", "3"))

# ---------------------------------------------------------------------------
# Background jobs & rate limiting
# ---------------------------------------------------------------------------
JOBS_ENABLED = os.environ.get("JOBS_ENABLED", "1") == "1"
JOBS_TICK_SECONDS = int(os.environ.get("JOBS_TICK_SECONDS", "5"))
FEED_FETCH_INTERVAL_HOURS = int(os.environ.get("FEED_FETCH_INTERVAL_HOURS", "24"))
RATE_LIMIT_AUTH_PER_MINUTE = int(os.environ.get("RATE_LIMIT_AUTH_PER_MINUTE", "30"))
RATE_LIMIT_OTP_PER_MINUTE = int(os.environ.get("RATE_LIMIT_OTP_PER_MINUTE", "6"))
AUTO_CREATE_TABLES = os.environ.get("AUTO_CREATE_TABLES", "1") == "1"  # set 0 in production and use alembic

# ---------------------------------------------------------------------------
# File storage (logos, product images, supplier documents) and monitoring
# ---------------------------------------------------------------------------
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local")  # local | s3
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
S3_BUCKET = os.environ.get("S3_BUCKET", "")
S3_REGION = os.environ.get("S3_REGION", "me-south-1")
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")          # for OCI / Wasabi / MinIO compatible stores
S3_PUBLIC_BASE = os.environ.get("S3_PUBLIC_BASE", "")    # CDN/base URL for public objects; default = endpoint/bucket
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "8"))
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
