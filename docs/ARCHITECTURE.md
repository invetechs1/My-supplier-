# Architecture

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Web (Vite)  │   │ Mobile (Expo)│   │ Admin (web)  │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       └──────────── HTTPS / JSON ───────────┘
                          │  /api/v1  (JWT Bearer)
                 ┌────────▼────────┐
                 │ FastAPI backend │  routers → services → SQLAlchemy models
                 └────────┬────────┘
        ┌─────────────────┼──────────────────┐
  SQLite (dev)     PostgreSQL (prod)    External price feeds (CSV/JSON pull, uploads)
```

## Domain model
- **User** (buyer | supplier | admin) — a supplier user owns exactly one **Supplier** profile.
- **Supplier** — registered (can bid, receive orders, verified flag, plan) or *external* (`is_external=True`: reference-price source only, created automatically by feed ingestion).
- **Category** (two levels) → **Product** (canonical item: SKU, name ar/en, brand, unit, spec JSON).
- **Offer** — one row per (supplier, product, city): price, VAT flag, min qty, stock, validity, source. Every write appends to **PriceHistory**, which powers the 90-day chart, the 30-day change and the market index.
- **PriceSource** — an external feed definition (URL + kind + city, optional supplier) with fetch status.
- **RFQ** → **RFQItem**s (product or free text, qty, unit, target). Visibility public (matched by supplier categories) or invited (**RFQInvite**).
- **Bid** (one per supplier per RFQ; re-submitting replaces) → **BidItem**s. Totals = items + delivery fee, + 15% VAT.
- Award → **Order** (+ **OrderItem**s) with a fixed state machine `pending → confirmed → in_delivery → delivered` (cancel from pending/confirmed) → **Review** updates supplier rating.
- **Notification** (in-app; `services/notify.register_hook` to add push/email/WhatsApp), **PriceAlert**, **AuditLog**.

## Price aggregation (`services/pricing.py`)
- `active_offers_query`: excludes out-of-stock and expired offers; optional city filter.
- `summarize` / `bulk_summaries`: min / max / avg / median, supplier counts (registered vs external), last update, 30-day change (avg now vs the 7-day window ending 30 days ago).
- `market_index`: per top-level category movement; `trending`: largest absolute 30-day moves.
- Prices are normalised to **ex-VAT** for comparison regardless of how the supplier entered them.

## Security
- PBKDF2-SHA256 password hashes (200k iterations), HS256 JWT (7 days), role dependencies (`require_admin`, `require_supplier`, `require_buyer`).
- Suppliers never see competitor bids; buyers only their own RFQs/orders; admin router is fully guarded.
- CORS configurable; secrets via env (`JWT_SECRET` auto-generated into `data/jwt.secret` if unset).

## Scaling path
1. Switch `DATABASE_URL` to PostgreSQL (schema is portable; add Alembic migrations before the first production schema change).
2. Run `uvicorn --workers N` behind nginx; move uploads to S3-compatible storage.
3. Add Redis for notification fan-out and a scheduler (cron / Celery beat) that calls `ingestion.fetch_source` for every active `PriceSource` daily.
4. Full-text search (PostgreSQL `tsvector` or Meilisearch) once the catalog exceeds ~50k products.
5. Push notifications: register an Expo push token per device and forward through `notify.register_hook`.
