"""Runtime configuration. Every value can be overridden with an environment variable."""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("MYSUPPLIER_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

PLATFORM_NAME = os.environ.get("PLATFORM_NAME", "My Supplier")
PLATFORM_NAME_AR = os.environ.get("PLATFORM_NAME_AR", "مورّدي")

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
