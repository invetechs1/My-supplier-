# MySupplier – Architecture

```
┌──────────────┐   ┌──────────────┐   ┌───────────────────┐
│  Web (Next)  │   │ Mobile (Expo)│   │ Admin (in Web)    │
│ buyers,      │   │ iOS/Android  │   │ ops, verification │
│ suppliers    │   │              │   │ price imports     │
└──────┬───────┘   └──────┬───────┘   └────────┬──────────┘
       │  HTTPS / JSON     │                    │
       └───────────┬───────┴────────────────────┘
                   ▼
        ┌─────────────────────┐        ┌────────────────────┐
        │  API (Express/TS)   │──────▶ │ PostgreSQL (Prisma)│
        │  /api/v1            │        └────────────────────┘
        │  auth · catalog     │
        │  pricing · RFQ/bids │        ┌────────────────────┐
        │  orders · admin     │──────▶ │ Daily snapshot job │
        └─────────────────────┘        │ (price history)    │
                                       └────────────────────┘
```

## Domain model
* **Company** – a supplier or contractor (CR / VAT numbers, city, verification, rating).
* **User** – belongs to a company; roles `BUYER`, `SUPPLIER`, `ADMIN`.
* **Category → Material** – the canonical catalogue (SKU, EN/AR names, unit, brand, specs).
* **PriceListing** – one price per (material, company, city). `source` is `SUPPLIER`
  (self-published), `MARKET` (imported from public indices / catalogues) or `IMPORTED`.
  Every read aggregates active listings into min / avg / median / max.
* **PriceHistory** – daily aggregate per material; feeds charts and the 30-day price index.
* **Rfq → RfqItem** – buyer request for quotation with a bidding deadline.
* **Bid → BidItem** – one bid per supplier per RFQ (re-posting updates it). Ranked by total, then delivery.
* **Order** – created when a buyer accepts a bid; status machine
  `PENDING → CONFIRMED → IN_TRANSIT → DELIVERED` (`CANCELLED` from pending/confirmed).
* **Notification** – in-app inbox (`NEW_RFQ`, `NEW_BID`, `BID_ACCEPTED`, …). Push/email/SMS adapters plug in here.

## Price aggregation from "all other suppliers"
1. Registered suppliers publish/refresh listings via the dashboard, mobile app, or bulk API.
2. Admin/ETL imports external reference prices (`POST /admin/prices/import`, keyed by `sourceName`).
3. Every material page shows all sources side by side; the summary and the category price index
   are computed live, and a daily job snapshots them into `PriceHistory`.
4. Listings expire via `validUntil`, so stale prices drop out of the averages automatically.

## BOQ research engine (`apps/api/src/services/boq.ts`)
1. **Parse** – `parseBoqText` accepts CSV (`description, qty, unit`), natural language
   (`25 ton rebar 16mm`, `Hollow block 20cm 8000 pcs`, `tile 60x60 x 1800`) and Arabic lines;
   units are normalised (`tons`, `طن` → `ton`; `sqm`, `م2` → `m2`; `nos`, `قطعة` → `piece`).
2. **Match** – `matchLine` tokenises both the query and every catalogue material (EN + AR names,
   brand, category, specs) through a synonym map (`حديد`/`steel`/`reinforcement` → `rebar`,
   `opc`/`portland` → `ordinary`, …), then scores word overlap, coverage and size/grade numbers
   (`16mm`, `C30`, `50kg`, `3/4"`). A number mismatch (12 mm vs 16 mm) is penalised heavily;
   an SKU mention is an exact hit. Top candidates are returned with a 0–1 confidence so the UI can
   flag weak matches and offer alternatives; the client can pin a `materialId` and re-run.
3. **Price** – all active listings for the matched materials (optionally filtered by city and
   verified suppliers) are loaded in one query, supplier and market-reference sources alike.
4. **Optimise** – `optimise` computes the cheapest offer per line (mixed basket), the average and
   highest totals, savings, and a per-supplier breakdown (lines covered, coverage %, total, mean
   lead time). "Best single supplier" = most coverage, then lowest total.
5. **Act** – `/boq/to-rfq` converts the reviewed lines into an RFQ and notifies matching suppliers.

## Storefront, cart and checkout
* `enrichMaterials` (services/shop.ts) turns listings into storefront fields: `bestOffer` (cheapest
  purchasable supplier offer), `offerCount`, `supplierCount`, `inStock`, `isDeal` (≥5 % below the
  average of all offers). Market-reference listings are displayed but never purchasable.
* Cart is server-side per user (`Cart`/`CartItem`, keyed by listing). Adds and updates re-validate
  min quantity and stock against the live offer.
* Checkout splits the cart by supplier and creates one `DIRECT` order per supplier inside a
  transaction: `OrderItem`s snapshot name/unit/price, stock is decremented, VAT 15 % and a delivery
  fee (same city vs other city) are applied, and suppliers are notified. Payment method is recorded
  and `paymentStatus` is updated by the supplier/admin (gateway integration is the next step).
* Product images: `GET /images/materials/:sku.svg` renders a deterministic SVG so every product has
  a visual until suppliers upload photos (`imageUrl`).

## Catalogue growth (collecting construction products from everywhere)
`importCatalog` (services/catalogImport.ts) is the single ingestion path:
* **Suppliers** – `POST /supplier/catalog/import` creates materials (source `SUPPLIER`) or matches
  existing SKUs/names and upserts the supplier's offer with stock.
* **Feeds** – admins register URLs (`Feed` model, JSON or CSV); `runFeed` fetches, parses, creates
  materials (source `FEED`) and MARKET listings keyed by feed name. A daily job runs all enabled
  feeds before the price-history snapshot. Inline imports use the same row format.
* Scrapers or partner ETL jobs can call the same endpoints, so onboarding a new price source is
  configuration, not code.

## AI price collection (`services/ai.ts`, `services/imports.ts`, `routes/imports.ts`, `routes/outreach.ts`)
```
PDF / Excel / photo / text ──┐
quotation from a buyer ──────┼──► extractPrices ──► matchLine (catalogue) ──► PriceImport + rows (REVIEW)
supplier web page (feed) ────┘        │                                            │
                                      │ Claude structured output                    ▼ uploader / admin reviews
                                      │ (heuristic parser when no API key)   approve · change match · edit price
                                                                                    │
                                                                                    ▼ publish
                                        SUPPLIER listing (own price list) · QUOTATION listing (buyer quotation)
                                        MARKET listing (web page / admin) · new Material when unmatched
```
* `extractWithAi` sends the document to Claude (`claude-opus-5`, structured output with a strict JSON
  schema validated again with zod). PDFs and images go as native document/image blocks; spreadsheets
  are converted to CSV text first. Prices shown incl. VAT are normalised to excl. VAT.
* Without `ANTHROPIC_API_KEY` the heuristic parser handles text/CSV/Excel (last numeric cell = price,
  unit-word cell = unit, extra numeric cells = quantity); PDFs and photos return a clear error.
* Each row gets `materialId` + `confidence` (0–1) + up to 3 alternatives from the BOQ matcher; rows
  under 0.5 are flagged `createMaterial` so publishing can create a new catalogue item.
* Attribution: supplier imports → the supplier's SUPPLIER listings; buyer quotations → `QUOTATION`
  listings attributed to the quoting company (matched by name); web pages / admin → MARKET listings.
* Outreach: `GET /admin/outreach` ranks suppliers by price staleness; requests create single-use
  14-day magic links (`/update-prices/<token>`) delivered by email, WhatsApp (wa.me link) or copy.
  A weekly job (`OUTREACH_AUTO=true`) emails stale suppliers automatically.

## Supplier portal (multi-tenant)
* **Tenancy** – every supplier record hangs off `Company`; all `/supplier/*` endpoints resolve the
  caller's `companyId` from the JWT and never accept a company id from the client. Users carry a
  `companyRole` (`OWNER`, `MANAGER`, `SALES`, `WAREHOUSE`) enforced by `requireCompanyRole` on top of
  the platform role; the last active owner cannot be demoted.
* **Team** – invitations are single-use, hashed tokens (7 days) delivered by email; accepting one
  creates the user inside the company or attaches an existing account.
* **Inventory** – `StockMovement` is the ledger (`IN`, `OUT`, `ADJUST`, `RESERVE`, `RELEASE`) and
  `PriceListing.stock` the running balance. Checkout writes `OUT` per item; cancellations write
  `RELEASE`; the inventory view adds reservations from orders not yet dispatched. A daily job
  notifies warehouse/owner users of items at or below the company threshold.
* **Orders** – `OrderEvent` is the timeline (created, status, payment, message, review) and
  `OrderMessage` the buyer–supplier thread. Delivery notes and tax invoices are server-rendered HTML.
* **Finance** – commission is `PlatformSetting.commissionPct` unless the company has an override;
  statements are computed from non-cancelled orders; payouts group paid + delivered orders not yet
  paid out, per company and period, and are marked paid by the admin with a bank reference.
* **Trust** – documents (CR, VAT, licence) upload to `UPLOAD_DIR` (swap for object storage via
  `UPLOAD_BASE_URL`), admins approve documents and set the verification status; reviews are one per
  delivered order and roll up into the company rating.

## Bidding flow
`Buyer creates RFQ` → suppliers in the delivery city or that stock the requested materials are
notified → suppliers bid per line item → buyer sees ranked bids → `accept` (transaction: bid
ACCEPTED, others REJECTED, RFQ AWARDED, Order created) → supplier confirms / ships / delivers.

## Security
JWT bearer auth, bcrypt passwords, role guards per route, company scoping for supplier data,
zod validation on every write, helmet, rate limiting, soft-deleted materials keep history intact.

## Scaling path
* Stateless API → run N replicas behind a load balancer; Postgres with read replicas.
* Move the snapshot job and notifications to a queue worker (BullMQ/Redis) when volume grows.
* Add OpenSearch for catalogue search once the catalogue exceeds ~100k SKUs.
* Object storage (S3-compatible) for material images, CR documents, mill certificates.
