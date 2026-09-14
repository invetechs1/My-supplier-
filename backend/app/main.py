"""My Supplier (مورّدي) — API entrypoint."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import CORS_ORIGINS, PLATFORM_NAME, PLATFORM_NAME_AR
from .db import Base, SessionLocal, engine
from .routers import admin, auth, catalog, market, notifications, orders, rfq, suppliers
from .seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title=f"{PLATFORM_NAME} API", version="1.0.0", lifespan=lifespan,
              description="Building materials price comparison, RFQ and supplier bidding platform.")

app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

API_PREFIX = "/api/v1"
for r in (auth, catalog, market, suppliers, rfq, orders, notifications, admin):
    app.include_router(r.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health", tags=["meta"])
def health():
    return {"status": "ok", "platform": PLATFORM_NAME, "platform_ar": PLATFORM_NAME_AR}


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
