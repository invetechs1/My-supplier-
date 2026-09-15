import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["MYSUPPLIER_DATA_DIR"] = _tmp
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 40
os.environ["JOBS_ENABLED"] = "0"
os.environ["PUSH_PROVIDER"] = "console"
os.environ["PAYMENT_PROVIDER"] = "mock"
os.environ["MOYASAR_WEBHOOK_SECRET"] = "whsec-test"
os.environ["RATE_LIMIT_AUTH_PER_MINUTE"] = "1000"
os.environ["RATE_LIMIT_OTP_PER_MINUTE"] = "1000"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def auth(client: TestClient, email: str, password: str = "Demo@2026") -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
