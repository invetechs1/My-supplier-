# MySupplier – Saudi building-materials price platform

**Live prices for every construction item across the Kingdom, from every supplier, in one place –
plus an RFQ / bidding marketplace where registered suppliers compete for your order.**

| App | Path | Stack |
|---|---|---|
| REST API | `apps/api` | Node 20, Express, TypeScript, Prisma, PostgreSQL |
| Website + dashboards (buyer, supplier, admin) | `apps/web` | Next.js 14, Tailwind, EN/AR |
| iOS & Android app | `apps/mobile` | Expo SDK 51, expo-router |
| Shared types | `packages/shared` | TypeScript |

Docs: [API contract](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md)

## What it does
* **Price discovery** – search 60+ seeded materials (cement, rebar, blocks, aggregates, tiles,
  paints, MEP, insulation, timber, gypsum, doors/windows). Each material shows the lowest,
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

## Environment
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | api | PostgreSQL connection string |
| `JWT_SECRET` | api | Token signing secret (change in production) |
| `CORS_ORIGIN` | api | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_URL` | web | API base URL |
| `EXPO_PUBLIC_API_URL` | mobile | API base URL (Android emulator: `http://10.0.2.2:4000/api/v1`) |
