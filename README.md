# MySupplier – Build for less

Saudi building-materials price platform.

**Live prices for every construction item across the Kingdom, from every supplier, in one place –
plus an RFQ / bidding marketplace where registered suppliers compete for your order.**

| App | Path | Stack |
|---|---|---|
| REST API | `apps/api` | Node 20, Express, TypeScript, Prisma, PostgreSQL |
| Website + dashboards (buyer, supplier, admin) | `apps/web` | Next.js 14, Tailwind, EN/AR |
| iOS & Android app | `apps/mobile` | Expo SDK 51, expo-router |
| Shared types | `packages/shared` | TypeScript |

Docs: [API contract](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · **[Go-live runbook](deploy/GO-LIVE.md)**

## What it does
* **Construction-only e-commerce (Amazon-style)** – `/shop` storefront with categories, deals,
  featured and new products; product pages with a buy box for the best offer and an "other
  sellers" table showing every supplier's live price, stock, lead time and city; cart, VAT
  (15%) and delivery fees, split checkout that creates one order per supplier, payment method
  (cash on delivery, bank transfer, card placeholder) and order tracking. Reference prices from
  market sources are shown next to real offers but are not purchasable.
* **Multi-tenant supplier portal** – every supplier company gets its own workspace: analytics
  dashboard (revenue and order trends, win rate, price competitiveness against the market, top
  products), storefront profile with logo and public page, team members with roles (owner,
  manager, sales, warehouse) and email invitations, branches, inventory with stock movements,
  reservations and low-stock alerts, order timeline and buyer–supplier messaging, printable
  delivery notes, reviews with replies, finance statements with platform commission, payouts, and
  verification documents reviewed by the admin.
* **AI price collection** – suppliers upload a price list as PDF, Excel, photo or pasted text;
  contractors upload quotations they received; admins point a feed at a supplier web page.
  Claude reads the document, every line is matched to the catalogue with a confidence score and
  alternatives, and a review queue lets the uploader fix matches before publishing. Published
  quotations appear as "quoted" prices next to supplier offers. Suppliers with stale prices get a
  weekly email or WhatsApp link to update prices in two minutes without logging in.
* **Catalogue growth engine** – suppliers add their own products and stock ("Sell on
  MySupplier", single form or CSV), and admins register external feeds (JSON or CSV URLs) that
  are imported daily, so the catalogue keeps collecting construction products from every source.
* **BOQ research (the "don't drive around" feature)** – anyone, even a guest, pastes or uploads a
  bill of quantities in English or Arabic ("Rebar 16mm, 25, ton", "1200 bags OPC cement 50kg",
  "حديد تسليح 12 مم 15 طن"). The engine matches every line to a catalogue material (with confidence and
  alternatives), pulls every supplier's price for it, and answers: the best price and supplier
  per line, the cheapest mixed basket, the best single supplier that can cover the whole BOQ,
  savings versus the market average, and a per-supplier breakdown. One click turns the BOQ into an
  RFQ so registered suppliers bid on it. Available on web (`/boq`) and mobile.
* **Price discovery** – search 120+ seeded products across 22 categories (cement, rebar, blocks, aggregates, tiles,
  paints, MEP, insulation, timber, gypsum, doors/windows, tools, PPE, hardware, HVAC, sanitary,
  lighting, scaffolding, roofing, chemicals, precast). Each material shows the lowest,
  average, median and highest price, every supplier's listing, imported market reference prices,
  a 120-day price chart, and a category-level price index with 30-day change.
* **Compare** up to 10 items side by side, filter by city.
* **RFQ & bidding** – buyers post a request with line items and a deadline; suppliers in that
  city (or who stock the items) are notified, bid per line, and the buyer awards the best bid.
  Awarding creates an order with a delivery status timeline.
* **Supplier tools** – price-list manager with bulk upload, open-RFQ marketplace, bids, orders.
* **Admin** – platform KPIs, user/role management, supplier verification, catalogue CRUD, and
  bulk import of market prices from external sources.

## Quick start (local)
```bash
pnpm install
docker compose up -d db                       # PostgreSQL 16 (or use your own DATABASE_URL)
cp apps/api/.env.example apps/api/.env
pnpm --filter @mysupplier/api prisma:generate
pnpm --filter @mysupplier/api prisma:migrate:dev
pnpm db:seed                                  # demo data + accounts below
pnpm dev:api                                  # http://localhost:4000/api/v1
pnpm dev:web                                  # http://localhost:3000
pnpm dev:mobile                               # Expo dev server (scan QR with Expo Go)
```
Or everything in containers: `docker compose up --build` (API on :4000, web on :3000).

### Demo accounts
| Role | Email | Password |
|---|---|---|
| Admin | admin@mysupplier.sa | Admin123! |
| Buyer (contractor) | buyer@mysupplier.sa | Buyer123! |
| Supplier | supplier@mysupplier.sa | Supplier123! |

## Tests & checks
```bash
pnpm --filter @mysupplier/api test        # unit tests (pricing engine)
pnpm --filter @mysupplier/api typecheck
pnpm --filter @mysupplier/web typecheck && pnpm --filter @mysupplier/web build
pnpm --filter @mysupplier/mobile typecheck
```
CI (`.github/workflows/ci.yml`) runs migrations + seed against a real Postgres, then builds all apps.

## Production deployment
`deploy/` contains a single-server production stack: Caddy (automatic HTTPS), the web and API
containers, PostgreSQL with nightly backups, deploy/backup/restore scripts and a step-by-step
[go-live runbook](deploy/GO-LIVE.md) covering domain, payments (Moyasar), email, app-store
submission and the launch checklist.

```bash
cd deploy && cp .env.production.example .env   # fill in domains, secrets, SMTP, Moyasar, legal entity
docker compose -f docker-compose.prod.yml up -d --build
```

Production features: Mada/Visa/Apple Pay via Moyasar, ZATCA phase-1 tax invoices with QR, push
notifications (Expo) and transactional email, password reset, account deletion, health endpoint,
sitemap, security headers and rate limiting.

## Environment
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | api | PostgreSQL connection string |
| `JWT_SECRET` | api | Token signing secret (change in production) |
| `CORS_ORIGIN` | api | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_URL` | web | API base URL |
| `EXPO_PUBLIC_API_URL` | mobile | API base URL (Android emulator: `http://10.0.2.2:4000/api/v1`) |
