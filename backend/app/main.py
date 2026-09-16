"""My Supplier (مورّدي) — API entrypoint."""
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .config import CORS_ORIGINS, PLATFORM_NAME, PLATFORM_NAME_AR
from .db import Base, SessionLocal, engine
from .routers import admin, auth, catalog, market, notifications, orders, payments, rfq, suppliers
from .seed import seed
from .services import jobs

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if config.AUTO_CREATE_TABLES:
        Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    if config.JOBS_ENABLED:
        jobs.start_background_worker()
    yield


app = FastAPI(title=f"{PLATFORM_NAME} — {config.PLATFORM_TAGLINE}", version="1.1.0", lifespan=lifespan,
              description="Build for Less: building materials price comparison, RFQ and supplier bidding platform.")

app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

API_PREFIX = "/api/v1"
for r in (auth, catalog, market, suppliers, rfq, orders, payments, notifications, admin):
    app.include_router(r.router, prefix=API_PREFIX)


# ------------------------------------------------------------------ rate limiting (per client IP, in-memory)
_hits: dict[tuple[str, str], deque] = defaultdict(deque)
_LIMITS = ((f"{API_PREFIX}/auth/otp", config.RATE_LIMIT_OTP_PER_MINUTE), (f"{API_PREFIX}/auth", config.RATE_LIMIT_AUTH_PER_MINUTE))


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    path = request.url.path
    for prefix, limit in _LIMITS:
        if path.startswith(prefix) and request.method == "POST":
            ip = (request.headers.get("X-Forwarded-For") or (request.client.host if request.client else "?")).split(",")[0].strip()
            key, now = (ip, prefix), time.time()
            q = _hits[key]
            while q and q[0] < now - 60:
                q.popleft()
            if len(q) >= limit:
                return JSONResponse({"detail": "Too many requests — slow down"}, status_code=429, headers={"Retry-After": "60"})
            q.append(now)
            break
    return await call_next(request)


@app.get(f"{API_PREFIX}/health", tags=["meta"])
def health():
    return {"status": "ok", "platform": PLATFORM_NAME, "platform_ar": PLATFORM_NAME_AR, "tagline": config.PLATFORM_TAGLINE, "tagline_ar": config.PLATFORM_TAGLINE_AR}


# Serve the built web app (web/dist) when present, so one container can host API + site.
WEB_DIST = Path(__file__).resolve().parent.parent.parent / "web" / "dist"
if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = WEB_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(WEB_DIST / "index.html")
