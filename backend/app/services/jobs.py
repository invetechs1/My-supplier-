"""Background jobs: notification outbox, feed fetching, RFQ expiry, price alerts, stale payments.

Runs as a daemon thread inside the API process (JOBS_ENABLED=1) and can also be run from cron:
    python -m app.jobs            # run every job once
    python -m app.jobs outbox     # run one job by name
"""
import logging
import threading
import time
from datetime import timedelta

from sqlalchemy.orm import Session

from .. import config
from ..db import SessionLocal
from ..models import RFQ, JobRun, PriceAlert, PriceSource, Product, utcnow
from . import channels, ingestion, payments, pricing
from .notify import notify

log = logging.getLogger("mysupplier.jobs")
_last_run: dict[str, float] = {}


def job_outbox(db: Session) -> dict:
    return channels.process_queue(db)


def job_close_expired_rfqs(db: Session) -> dict:
    rows = db.query(RFQ).filter(RFQ.status == "open", RFQ.closes_at.isnot(None), RFQ.closes_at < utcnow()).all()
    for r in rows:
        r.status = "closed"
        live = [b for b in r.bids if b.status == "submitted"]
        notify(db, r.buyer_id, f"انتهت مهلة طلب التسعير «{r.title}»", f"وصلك {len(live)} عرض — راجعها ورسِّ الطلب", "rfq", "rfq", r.id)
    db.commit()
    return {"closed": len(rows)}


def job_price_alerts(db: Session) -> dict:
    """Notify buyers when the best price reaches their target (or drops 3%+ below the baseline for open alerts)."""
    fired = 0
    alerts = db.query(PriceAlert).filter(PriceAlert.is_active.is_(True)).all()
    for a in alerts:
        s = pricing.summarize(db, a.product_id, a.city or None)
        best = s.get("min_price")
        if best is None:
            continue
        if a.baseline_price is None:
            a.baseline_price = best
            continue
        hit = (a.target_price is not None and best <= a.target_price) or (a.target_price is None and best <= a.baseline_price * 0.97)
        recently = a.last_notified_at and a.last_notified_at > utcnow() - timedelta(days=1)
        if hit and not recently:
            p = db.get(Product, a.product_id)
            notify(db, a.user_id, f"انخفض سعر {p.name_ar if p else ''} 📉", f"أفضل سعر الآن {best:,.2f} ر.س" + (f" في {a.city}" if a.city else ""), "price_alert", "product", a.product_id)
            a.last_notified_at = utcnow()
            a.baseline_price = best
            fired += 1
        elif best < (a.baseline_price or best):
            a.baseline_price = best
    db.commit()
    return {"checked": len(alerts), "fired": fired}


def job_fetch_feeds(db: Session) -> dict:
    cutoff = utcnow() - timedelta(hours=config.FEED_FETCH_INTERVAL_HOURS)
    sources = db.query(PriceSource).filter(PriceSource.is_active.is_(True), PriceSource.url != "", PriceSource.kind != "manual").all()
    done = 0
    for s in sources:
        if s.last_fetched_at and s.last_fetched_at > cutoff:
            continue
        ingestion.fetch_source(db, s)
        done += 1
    return {"fetched": done}


def job_expire_payments(db: Session) -> dict:
    return {"expired": payments.expire_stale(db)}


JOBS = {
    "outbox": (job_outbox, 0),                 # every tick
    "close_expired_rfqs": (job_close_expired_rfqs, 300),
    "price_alerts": (job_price_alerts, 900),
    "fetch_feeds": (job_fetch_feeds, 3600),
    "expire_payments": (job_expire_payments, 3600),
}


def run_job(name: str, db: Session | None = None, record: bool = True) -> dict:
    fn, _ = JOBS[name]
    own = db is None
    db = db or SessionLocal()
    run = JobRun(name=name) if record else None
    try:
        result = fn(db)
        if run:
            run.status, run.detail, run.finished_at = "ok", result, utcnow()
        return result
    except Exception as exc:  # noqa: BLE001
        log.exception("job %s failed", name)
        db.rollback()
        if run:
            run.status, run.detail, run.finished_at = "error", {"error": str(exc)[:400]}, utcnow()
        return {"error": str(exc)}
    finally:
        if run and name != "outbox":  # don't flood job_runs with outbox ticks
            db.add(run)
            db.commit()
        if own:
            db.close()


def tick() -> None:
    now = time.time()
    for name, (_, interval) in JOBS.items():
        if now - _last_run.get(name, 0) >= interval:
            _last_run[name] = now
            run_job(name)


def start_background_worker() -> threading.Thread:
    def loop():
        while True:
            try:
                tick()
            except Exception:  # noqa: BLE001
                log.exception("job tick failed")
            time.sleep(config.JOBS_TICK_SECONDS)
    t = threading.Thread(target=loop, name="mysupplier-jobs", daemon=True)
    t.start()
    return t


if __name__ == "__main__":  # pragma: no cover
    import sys
    logging.basicConfig(level=logging.INFO)
    names = sys.argv[1:] or list(JOBS)
    for n in names:
        print(n, run_job(n))
