# MySupplier — System Inventory & Deployment Verification

**Purpose.** This document lists everything the MySupplier platform consists of, what must exist on the production server after a correct deployment, and how the developer proves that nothing was left out. Work through Part 3 and Part 4 in order and sign the checklist in Part 6. Reference build: branch `claude/building-materials-ecommerce-ktfxj3`, commit `f7b12dc` (29 Sep 2026).

**How to use it in 15 minutes.** (1) Confirm the deployed commit matches the reference (Part 3, step 1). (2) Run `deploy/scripts/verify-deployment.sh` against the live domains (Part 4.1): every FAIL is a missing piece. (3) Do the 10-minute manual walkthrough (Part 4.3). (4) Go through Part 5, the list of things that are most often forgotten. If all four are clean, the deployment is complete.

---

## Part 1 — The system at a glance

| Component | Technology | Runs as | Purpose |
|---|---|---|---|
| Reverse proxy | Caddy 2 | `caddy` container | HTTPS (Let's Encrypt), HSTS, routes `DOMAIN` → web, `API_DOMAIN` → api, `www` redirect |
| Web app | Next.js 15.5 (React 19), Tailwind | `web` container, port 3000 | Public site, shop, buyer dashboard, supplier portal, admin console (EN/AR) |
| API | Node 20, Express 4, Prisma 5, TypeScript | `api` container, port 4000 | REST API `/api/v1`, background jobs, uploads, generated images, printable documents |
| Database | PostgreSQL 16 (+ `pg_trgm`) | `db` container, volume `pgdata` | All data (55 tables) |
| Backups | pg_dump loop | `backup` container, `deploy/backups/` | Nightly dump, 14-day retention |
| Uploads | Local disk (or S3/CDN via `UPLOAD_BASE_URL`) | volume `uploads` | Logos, product photos (public), verification documents (private) |
| Mobile app | Expo SDK 51 / React Native | App Store / Play Store build (EAS) | Buyer and supplier features on iOS/Android |
| Shared types | TypeScript package | `packages/shared` | API contracts shared by web and mobile |

**Size of the system (generated from the code at the reference commit)**

| Measure | Count |
|---|---|
| API endpoints | 245 across 27 route modules |
| Web routes (pages) | 96 |
| Mobile screens | 42 |
| Database models | 55 |
| Database migrations | 12 (all must be applied) |
| Background jobs | 3 (daily price snapshot, hourly price alerts + recurring orders, webhook dispatcher every minute) |
| Automated tests | 104 API unit tests, API smoke script, Playwright browser e2e (10 checks), 178-page render sweep |
| Standard catalogue (seed) | 62 categories, 1,305 products, 185 category attributes, 39 demo suppliers, ~12,000 price listings |
| Languages | English and Arabic (RTL) on web and mobile |

**Repository layout**

```
apps/api        Express API, Prisma schema, migrations, seed, jobs, tests, scripts/smoke.sh
apps/web        Next.js app (src/app = routes, src/components, src/lib/i18n.ts)
apps/mobile     Expo app (app/ = screens, src/)
packages/shared TypeScript types
deploy/         docker-compose.prod.yml, Caddyfile, .env.production.example, GO-LIVE.md, scripts/
docs/           API.md, INTEGRATIONS.md, openapi.yaml, ARCHITECTURE.md, DEVELOPER-HANDOVER.pdf,
                LAUNCH-PLAN-AR.pdf, SUPPLIER-GUIDE-AR/EN.pdf, this document
.github/        CI: typecheck, unit tests, migrate + seed, builds, browser e2e
```

---

## Part 2 — Complete functional inventory

Everything below exists in the code and must work on the server. Use it as the definition of "complete".

### 2.1 Public site (no login)
- Home page with deals, featured products, new arrivals, category grid, brand strip, "how it works", supplier CTA; cookie consent; EN/AR toggle with RTL.
- **Shop**: category tree (62), product listing with facets (brand, city, price range, in-stock, rating, per-category attribute filters such as power, size, grade), sort, pagination, active-filter chips, search box with autocomplete suggestions (`/shop?q=`), brand pages (`/brands`, `/brands/[brand]`).
- **Product page**: gallery, specifications table, offers from every supplier in the chosen city with volume tiers and sale prices, delivery options, best-offer buy box, add to cart / buy now, wishlist, price alert, reviews with helpful votes, Q&A, frequently bought together, recently viewed, related products.
- **Materials & price index** (`/materials`, `/materials/[id]`): price statistics (min/avg/median/max), history charts, cheapest supplier, compare page (`/compare`).
- **Suppliers directory** (`/suppliers`, `/suppliers/[id]`): storefront with rating, verified badge, cities served, catalogue.
- **BOQ pricing** (`/boq`): paste or upload a bill of quantities (text/CSV/Excel), Arabic and English line parsing, cheapest total, best single supplier, per-line alternatives, export.
- Static/legal pages: about, help & FAQ, contact form (stored, visible in admin support), terms, privacy, refund & cancellation. `robots.txt`, `sitemap.xml`, web manifest, Open Graph image.
- Guest cart (local) that merges into the account on login.

### 2.2 Accounts & security
- Email/password registration (buyer or supplier with company), login, forgot/reset password, phone OTP login (Unifonic SMS), account page, `/join` invite acceptance for supplier team members.
- Roles: BUYER, SUPPLIER (company roles OWNER / MANAGER / SALES / WAREHOUSE), ADMIN.
- JWT sessions with token versioning (logout, password change, role change or deactivation revoke earlier tokens); 60-second path-bound download tokens for invoices, delivery notes, exports and private files; helmet, CSP on web and on API HTML pages, CORS allow-list, rate limits (auth, OTP, BOQ, per-user UGC), bcrypt, SSRF guard, upload magic-byte validation, audit log.

### 2.3 Buyer features (`/dashboard/**`, `/cart`, `/checkout`)
- Cart with per-supplier grouping, tier pricing hints, delivery city and carrier quotes, promo code; checkout with address book, PO number, notes, payment methods (cash on delivery, bank transfer, card via Moyasar, credit terms when approved), coupon, VAT 15% itemised; orders split per supplier.
- Orders list and detail: timeline, messages with the supplier, cancel while pending, reorder, printable tax invoice (ZATCA QR) and delivery note, e-invoice XML, payment status, shipment tracking.
- RFQs: create (manual lines or from BOQ), publish to suppliers in the city, receive bids, compare, award → order; quotations page.
- Returns/RMA: request on delivered orders, track approval → received → refund.
- Recurring orders (weekly/monthly with pause/resume/run now), buy again, project lists / wishlists (share, add all to cart), saved addresses, price alerts, notifications centre, credit terms status, ERP integrations page (API keys, webhooks) for buyer companies.

### 2.4 Supplier portal (`/supplier/**`)
- Dashboard: revenue, orders, pending confirmations, unpaid orders, open RFQs in my cities, win rate, low-stock items, unread messages, rating, product views, charts, getting-started checklist.
- **My products**: every offer as buyers see it, status tiles (active / cheapest in city / paused / out of stock / expired), inline edit of price, sale price with end date, stock, MOQ, lead time, validity, pause/resume, photo upload/remove, volume tiers, competitor comparison, 30-day sales, filters kept in the URL.
- Price list (add/edit/delete, duplicate-offer protection), **Sell on MySupplier** (create a new product + bulk CSV), **Import price list** with AI extraction from Excel/CSV/PDF/photo and review before publishing, magic-link price update pages for outreach.
- Marketplace of open RFQs, bids (submit, update, withdraw), awarded bids → orders.
- Orders: confirm → in transit → delivered, carrier and tracking, shipments, messages, delivery note, invoice, COD confirmation, refunds.
- Inventory: stock per listing and branch, reservations, movement ledger, low-stock threshold and alerts, import from PDF/Excel, CSV export.
- Returns handling, reviews & questions (reply/answer), company profile & storefront (logo, description, cities served), verification documents (CR, VAT), branches, team (invites, roles), finance (gross, commission, net, payouts, statement CSV, bank details), notifications, ERP & API page.

### 2.5 Admin console (`/admin/**`)
- Overview KPIs, reports (range, CSV), orders and order detail, payments, payouts, returns, credit-terms approvals, coupons, category attributes, product reviews and questions moderation, supplier reviews, support inbox (contact messages), announcements (targeted by role), audit log, users (role, activation), companies (verification, documents, commission override), categories (create/edit/delete), materials (create/edit/delete, specs), price imports, external price feeds (AI scraping), supplier outreach, shipping rate cards and carriers, platform settings (commission %, payout day, low-stock default), notifications.

### 2.6 Integrations & platform services
- **Payments**: Moyasar (Mada, Visa/Mastercard, Apple Pay) with intents, webhooks, refunds; bank transfer with instructions on the invoice; COD; credit terms.
- **Shipping**: rate-card quoting per city/weight/volume (works without keys); carrier adapters (Trukker, Trella, SMSA, Aramex, SPL) enabled by API keys; carrier webhooks with secret.
- **Invoicing**: ZATCA phase-1 simplified tax invoice with QR (TLV), delivery note, phase-2 XML groundwork.
- **Notifications**: in-app, email (SMTP), push (Expo devices), SMS (Unifonic OTP), announcements.
- **AI (Anthropic API)**: price-list extraction, BOQ line matching assistance, feed scraping; heuristic fallback when the key is missing or has no credit.
- **ERP integration** (`/api/v1/integrations/v1/*`): API keys with scopes, 600 req/min, bulk prices/stock, orders pull/push, RFQ bidding, webhooks (order.created, order.status_changed, return.requested, …) with retries; OpenAPI spec `docs/openapi.yaml`, guide `docs/INTEGRATIONS.md`.
- **Background jobs** (inside the api process, no cron needed): daily price-history snapshot, hourly price alerts and recurring-order runs, webhook dispatcher every minute.
- **Ops**: `/api/v1/health` (db status, version, uptime), Sentry (optional), morgan access logs with token redaction, nightly DB backup container, `deploy/scripts/backup.sh` and `restore.sh`.

### 2.7 Mobile app (Expo)
Login/register/forgot password, OTP, home, shop with search and facets, product page (offers, tiers, reviews, Q&A, wishlist, alerts), cart, checkout, payment (hosted Moyasar page), orders and order detail (invoice, delivery note, tracking, messages), RFQs (create, detail, bids), BOQ, lists, addresses, buy again, recurring orders, returns, alerts, notifications, account; supplier: dashboard, my products, price list, inventory (+ movements), company, team, finance; price-list imports. Screens listed in Appendix C.

---

## Part 3 — What must exist on the server after a correct deployment

### 3.1 Code version
The deployed code must be the reference commit or newer on the same branch. On the server:

```
cd <repo> && git fetch origin && git rev-parse --short HEAD && git status --short
git log --oneline -1 origin/claude/building-materials-ecommerce-ktfxj3
```
Both hashes must match (`f7b12dc` at the time of writing). If the server is behind, run `deploy/scripts/deploy.sh` (pulls, rebuilds, restarts). A partial deployment usually means an older commit: e.g. the supplier "My products" page, returns, credit terms, wishlists, the ERP API, the Arabic product page and the security hardening all arrived in the last 12 commits.

### 3.2 Containers and DNS
`docker compose -f deploy/docker-compose.prod.yml ps` must show five services **Up** (`caddy`, `db` (healthy), `api` (healthy), `web`, `backup`). DNS A records for `DOMAIN`, `API_DOMAIN` and `www.DOMAIN` point at the server; ports 80 and 443 open; Caddy has obtained certificates (`docker compose logs caddy | grep -i certificate`).

### 3.3 Environment variables (`deploy/.env`)
Copy from `deploy/.env.production.example`. The API refuses to start without the **required** ones; the **feature** ones switch capabilities on and off silently, which is the most common reason a deployment "feels incomplete".

| Variable | Required | What breaks when missing / wrong |
|---|---|---|
| `DOMAIN`, `API_DOMAIN` | Yes | Caddy routing, TLS, CORS, links in emails and invoices |
| `POSTGRES_USER/PASSWORD/DB` | Yes | Database; changing the password later requires updating the `db` volume too |
| `JWT_SECRET` (≥32 random chars) | Yes | All logins; rotating it logs everyone out |
| `JWT_EXPIRES_IN`, `APP_SCHEME` | Yes (defaults ok) | Session length; mobile deep links `mysupplier://` |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` | Yes (compose passes them as **build args**) | Baked into the web bundle at build time. Wrong value = web cannot reach the API. **Rebuild the web image after any change.** |
| `CORS_ORIGIN` (compose sets `https://DOMAIN`) | Yes | Browser calls blocked ("Cannot reach the MySupplier API") |
| `TRUST_PROXY=1` | Yes | Rate limiting keyed on the real client IP behind Caddy |
| `UPLOAD_DIR`, `UPLOAD_BASE_URL` | Yes / optional | Photos and documents; set the base URL only when files are served from S3/CDN |
| `SMTP_*`, `MAIL_FROM` | Feature | No emails (password reset, order notifications, invites) — they are logged instead |
| `MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY`, `MOYASAR_WEBHOOK_SECRET` | Feature | Card / Apple Pay option hidden at checkout (COD, bank transfer, credit still work) |
| `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID` | Feature | Phone OTP login does not send SMS (codes are logged) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Feature | AI price-list extraction falls back to heuristics; PDF/photo import reports an error; feed scraping off |
| `PLATFORM_LEGAL_NAME`, `PLATFORM_VAT_NUMBER`, `PLATFORM_ADDRESS`, `VAT_RATE`, `BANK_*` | Yes for invoices | Wrong legal entity / VAT number / IBAN printed on every tax invoice |
| `TRUKKER/TRELLA/SMSA/ARAMEX/SPL_API_KEY`, `CARRIER_WEBHOOK_SECRET` | Feature | Carrier booking and tracking webhooks; rate-card quotes still work |
| `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` | Optional | No error monitoring |
| `ZATCA_API_BASE`, `ZATCA_BINARY_TOKEN`, `ZATCA_SECRET` | Later | Phase-2 e-invoice reporting (after Fatoora onboarding) |
| `OUTREACH_AUTO`, `OUTREACH_STALE_DAYS` | Optional | Automatic supplier price-refresh reminders |

Never commit `deploy/.env`; rotate any key that was ever pasted into chat or a ticket.

### 3.4 Database
- All **12 migrations applied**: `docker compose exec api npx prisma migrate status` must print "Database schema is up to date". The api container runs `prisma migrate deploy` on every start; if it fails, the api never becomes healthy — read `docker compose logs api`.
- Extension `pg_trgm` installed (created by migration `pg_trgm_search`) — fuzzy search depends on it.
- **Catalogue present**: 62 categories and the standard products. Decide explicitly: run `deploy/scripts/seed-demo.sh` for a first launch / staging (creates the catalogue **and** demo accounts and demo suppliers), or load the production catalogue only. An empty shop means the seed was never run.
- Demo accounts (`admin@mysupplier.sa / Admin123!`, `buyer@…`, `supplier@…`, `warehouse@…`, `sales@<supplier>.sa`) **must be deleted or given new passwords** before the public launch; create the real admin account.
- Platform settings set in Admin → Settings: commission %, payout day, low-stock default. Shipping rate cards entered in Admin → Shipping.

### 3.5 Runtime checks inside the api container
```
docker compose -f deploy/docker-compose.prod.yml logs api | grep -E "listening|snapshot|price alerts|recurring|webhook"
```
The log must show "MySupplier API listening" and the three job start lines. `ls /app/apps/api/uploads` inside the container must be on the persistent volume (files survive `docker compose down && up`).

### 3.6 Web build
`docker compose logs web` must not show "does not work with output: standalone" errors; the image starts `node server.js` (standalone). The CSP header of the home page must contain the API domain (proof that `NEXT_PUBLIC_API_URL` was baked correctly).

### 3.7 Mobile
`apps/mobile/app.json` / EAS profile: `EXPO_PUBLIC_API_URL=https://API_DOMAIN/api/v1`, `EXPO_PUBLIC_WEB_URL=https://DOMAIN`, scheme `mysupplier`, bundle identifiers, icons, push credentials (FCM/APNs) configured in EAS; Apple Pay merchant + domain association file if card payments are enabled.

---

## Part 4 — Verification procedure

### 4.1 Automated external check (2 minutes)
From any machine with `curl` and `python3`:

```
WEB=https://mysupplier.sa API=https://api.mysupplier.sa \
ADMIN_EMAIL=<real admin> ADMIN_PASSWORD='<password>' \
bash deploy/scripts/verify-deployment.sh
```
It checks ~50 items: API health and database, catalogue counts, shop/search/brands/BOQ/carriers endpoints, auth enforcement (401s), ERP key rejection, CORS from the web origin, security headers and HSTS, every public web page and asset, that the web bundle points at the right API domain, www redirect, admin login, platform settings, reports, audit log, and that the demo admin password no longer works. **Expected result on a complete deployment: 0 FAIL.** Warnings are informational (e.g. no HTTPS on a staging box).

### 4.2 Server-side checks (5 minutes)
```
docker compose -f deploy/docker-compose.prod.yml ps                       # 5 services Up, db/api healthy
docker compose -f deploy/docker-compose.prod.yml exec api npx prisma migrate status
docker compose -f deploy/docker-compose.prod.yml exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
  "select (select count(*) from \"Category\") categories, (select count(*) from \"Material\") products, \
          (select count(*) from \"PriceListing\") listings, (select count(*) from \"User\" where role='ADMIN') admins;"
docker compose -f deploy/docker-compose.prod.yml logs --since 24h api | grep -ciE "error|unhandled"   # should be ~0
ls -la deploy/backups | tail -3                                                # a dump from the last 24 h
docker compose -f deploy/docker-compose.prod.yml exec caddy caddy list-certificates 2>/dev/null || docker compose logs caddy | tail -20
```

### 4.3 Manual walkthrough (10 minutes, one pass per role)
1. **Guest**: open the home page in EN and AR; search "cement"; open a product; add to cart; run a BOQ with three lines; open a supplier page; send the contact form.
2. **Buyer** (real test account): register with a company → verify the email arrives (if SMTP is set) → add an address → checkout with cash on delivery → open the order → download the invoice (QR present) → request a quotation (RFQ) → create a list and a price alert.
3. **Supplier** (real test account): register as supplier → upload CR/VAT documents → add a price to an existing product → "Sell a new product" → import a small Excel price list → see the offer in the shop as a guest → receive the buyer's order → confirm → mark delivered → print the delivery note → check Finance shows commission and net.
4. **Admin**: verify the supplier company (badge appears on its page) → approve credit for the buyer company → create a coupon and use it at checkout → hide a review → check Audit shows all of the above → export a report CSV.
5. **Mobile** (TestFlight/internal build): log in as the buyer, receive the push notification for an order status change, open the invoice from the app.

### 4.4 Integration checks (only where the feature is enabled)
- Moyasar: pay SAR 1 with a test card in test mode, confirm the webhook marks the order PAID, refund it from the supplier order page.
- SMTP: password-reset email arrives with a working link to `https://DOMAIN/reset-password`.
- Unifonic: OTP SMS arrives within 30 s.
- ERP: create an API key in Supplier → ERP & API, `curl -H "X-Api-Key: …" https://API_DOMAIN/api/v1/integrations/v1/ping` returns `ok:true`; add a webhook endpoint and send the test event.
- Carriers: request a quote at checkout for Riyadh → Jeddah; if keys are set, a booking creates a shipment with a tracking number.

---

## Part 5 — Most commonly forgotten items ("it feels incomplete")

1. **Old commit deployed.** Compare hashes (3.1). Newer features live only in the latest commits.
2. **Web built with the wrong API URL** (`NEXT_PUBLIC_API_URL` is a build arg, not a runtime variable). Symptom: "Cannot reach the MySupplier API". Fix: correct `.env`, `docker compose build web`, `up -d web`.
3. **CORS_ORIGIN mismatch** (http vs https, www vs apex). Symptom: login fails only in the browser while `curl` works.
4. **Seed never run** → empty shop, no categories, no attributes, no shipping rates. Or seed run in production and **demo accounts left active**.
5. **Migrations pending** → api restarts in a loop; check `prisma migrate status`.
6. **Uploads not on the volume** → logos and documents disappear after a redeploy.
7. **Feature keys empty**: no card payments, no emails, no SMS, no AI extraction — each is silent by design (see 3.3). Decide which are needed for launch and fill them.
8. **Invoice legal data left at placeholders** (`PLATFORM_VAT_NUMBER=300000000000003`, sample IBAN) → invalid tax invoices.
9. **Platform settings and rate cards** not entered (commission, payout day, shipping prices per city).
10. **TRUST_PROXY** left unset with an extra CDN/proxy hop → rate limits key on the wrong IP.
11. **Backups**: container running but `deploy/backups` never copied off the server (`deploy/scripts/backup.sh`).
12. **www and apex DNS** both pointed; certificate for both issued.
13. **Mobile build** pointing at localhost or staging; push credentials missing; Apple Pay domain file not served.
14. **Legal pages** still generic text; support email / phone not updated in Contact and the footer.
15. **`xlsx` dependency patch** from GO-LIVE §6b not applied (Excel import security advisory).
16. **Monitoring**: no Sentry DSN, nobody watching `docker compose logs`; no uptime check on `/api/v1/health`.
17. **JWT_SECRET / passwords copied from the example file.**
18. **Keys pasted in chats or tickets never rotated.**

---

## Part 6 — Sign-off checklist

| # | Check | Evidence | Done by | Date |
|---|---|---|---|---|
| 1 | Deployed commit = reference commit (`f7b12dc` or newer) | `git rev-parse --short HEAD` output | | |
| 2 | 5 containers Up, db and api healthy | `docker compose ps` output | | |
| 3 | `prisma migrate status` = up to date (12 migrations) | log line | | |
| 4 | `verify-deployment.sh` → 0 FAIL | script summary line | | |
| 5 | Catalogue counts (categories ≥ 62, products > 0) | SQL output | | |
| 6 | Demo accounts removed / passwords changed; real admin created | admin user list | | |
| 7 | `.env` complete: required + chosen feature keys; placeholders replaced | reviewed by | | |
| 8 | Legal/invoice data (name, VAT, address, IBAN) correct | test invoice PDF | | |
| 9 | Platform settings + shipping rate cards entered | admin screenshots | | |
| 10 | Manual walkthrough 4.3 passed for guest, buyer, supplier, admin | notes | | |
| 11 | Integration checks 4.4 for enabled features | notes | | |
| 12 | Uploads persist across `down/up`; backup dump exists and copied off-site | file listing | | |
| 13 | Mobile build points at production; push works | TestFlight/APK build id | | |
| 14 | Monitoring (Sentry or uptime check) active | dashboard link | | |
| 15 | Secrets rotated, `.env` not in git | `git status` | | |

---

## Appendix A — All API endpoints (245, base path `/api/v1`)

**Admin: users, companies, categories, materials** (`admin.ts`, 12 endpoints)

| Method | Path |
|---|---|
| GET | `/admin/stats` |
| GET | `/admin/users` |
| PATCH | `/admin/users/:id` |
| GET | `/admin/companies` |
| PATCH | `/admin/companies/:id/verify` |
| POST | `/admin/categories` |
| PATCH | `/admin/categories/:id` |
| DELETE | `/admin/categories/:id` |
| POST | `/admin/materials` |
| PATCH | `/admin/materials/:id` |
| DELETE | `/admin/materials/:id` |
| POST | `/admin/prices/import` |

**Admin back office: returns, credit, coupons, reviews, support, announcements, reports, audit** (`adminCommerce.ts`, 15 endpoints)

| Method | Path |
|---|---|
| GET | `/admin/coupons` |
| POST | `/admin/coupons` |
| PATCH | `/admin/coupons/:id` |
| DELETE | `/admin/coupons/:id` |
| GET | `/admin/reviews` |
| PATCH | `/admin/reviews/:id` |
| DELETE | `/admin/reviews/:id` |
| GET | `/admin/payments` |
| GET | `/admin/reports` |
| GET | `/admin/audit` |
| POST | `/admin/announcements` |
| GET | `/admin/announcements` |
| POST | `/contact` |
| GET | `/admin/contact` |
| PATCH | `/admin/contact/:id` |

**Authentication & account** (`auth.ts`, 12 endpoints)

| Method | Path |
|---|---|
| POST | `/register` |
| POST | `/login` |
| GET | `/me` |
| PATCH | `/me` |
| GET | `/invite/:token` |
| POST | `/accept-invite` |
| POST | `/forgot-password` |
| POST | `/reset-password` |
| POST | `/change-password` |
| DELETE | `/me` |
| POST | `/download-token` |
| POST | `/logout` |

**BOQ analysis** (`boq.ts`, 3 endpoints)

| Method | Path |
|---|---|
| POST | `/boq/parse` |
| POST | `/boq/analyze` |
| POST | `/boq/to-rfq` |

**Cart & checkout** (`cart.ts`, 6 endpoints)

| Method | Path |
|---|---|
| GET | `/cart` |
| POST | `/cart/items` |
| PATCH | `/cart/items/:id` |
| DELETE | `/cart/items/:id` |
| DELETE | `/cart` |
| POST | `/checkout` |

**Catalogue, materials, prices, categories** (`catalog.ts`, 12 endpoints)

| Method | Path |
|---|---|
| GET | `/health` |
| GET | `/sitemap.xml` |
| GET | `/stats` |
| GET | `/price-index` |
| GET | `/categories` |
| GET | `/materials` |
| GET | `/materials/:id` |
| GET | `/materials/:id/prices` |
| GET | `/prices/compare` |
| GET | `/suppliers` |
| GET | `/suppliers/:id/reviews` |
| GET | `/suppliers/:id` |

**B2B commerce: tiers, addresses, credit, returns, recurring, coupons** (`commerce.ts`, 18 endpoints)

| Method | Path |
|---|---|
| GET | `/addresses` |
| POST | `/addresses` |
| PATCH | `/addresses/:id` |
| DELETE | `/addresses/:id` |
| POST | `/addresses/:id/default` |
| GET | `/me/credit` |
| GET | `/admin/companies/:id/credit` |
| PATCH | `/admin/companies/:id/credit` |
| POST | `/orders/:id/reorder` |
| POST | `/orders/:id/returns` |
| GET | `/returns` |
| GET | `/returns/:id` |
| PATCH | `/returns/:id` |
| GET | `/recurring` |
| POST | `/recurring` |
| PATCH | `/recurring/:id` |
| DELETE | `/recurring/:id` |
| POST | `/recurring/:id/run-now` |

**Push devices** (`devices.ts`, 2 endpoints)

| Method | Path |
|---|---|
| POST | `/devices` |
| DELETE | `/devices/:token` |

**E-invoicing (ZATCA phase 2 groundwork)** (`einvoice.ts`, 3 endpoints)

| Method | Path |
|---|---|
| GET | `/orders/:id/einvoice` |
| GET | `/orders/:id/einvoice.xml` |
| POST | `/admin/einvoices/:id/report` |

**Admin feeds (external price sources)** (`feeds.ts`, 5 endpoints)

| Method | Path |
|---|---|
| GET | `/admin/feeds` |
| POST | `/admin/feeds` |
| POST | `/admin/feeds/:id/run` |
| POST | `/admin/feeds/import` |
| DELETE | `/admin/feeds/:id` |

**Price-list imports (AI)** (`imports.ts`, 8 endpoints)

| Method | Path |
|---|---|
| GET | `/ai/config` |
| POST | `/imports` |
| GET | `/imports` |
| GET | `/imports/:id` |
| PATCH | `/imports/:id/rows/:rowId` |
| POST | `/imports/:id/approve-all` |
| POST | `/imports/:id/publish` |
| POST | `/imports/:id/reject` |

**ERP integration: API keys, webhooks, /integrations/v1** (`integrations.ts`, 11 endpoints)

| Method | Path |
|---|---|
| GET | `/integrations/scopes` |
| GET | `/integrations/keys` |
| POST | `/integrations/keys` |
| POST | `/integrations/keys/:id/revoke` |
| GET | `/integrations/webhooks` |
| POST | `/integrations/webhooks` |
| PATCH | `/integrations/webhooks/:id` |
| DELETE | `/integrations/webhooks/:id` |
| POST | `/integrations/webhooks/:id/test` |
| GET | `/integrations/webhooks/:id/deliveries` |
| POST | `/integrations/deliveries/:id/retry` |

**Invoices (ZATCA phase 1)** (`invoice.ts`, 2 endpoints)

| Method | Path |
|---|---|
| GET | `/orders/:id/invoice` |
| GET | `/orders/:id/invoice.html` |

**Product discovery: attributes, reviews, Q&A, wishlists, alerts** (`marketplace.ts`, 34 endpoints)

| Method | Path |
|---|---|
| GET | `/categories/:slug/attributes` |
| GET | `/admin/categories/:id/attributes` |
| POST | `/admin/categories/:id/attributes` |
| PATCH | `/admin/attributes/:id` |
| DELETE | `/admin/attributes/:id` |
| GET | `/shop/products/:id/reviews` |
| POST | `/shop/products/:id/reviews` |
| PATCH | `/shop/reviews/:id` |
| POST | `/shop/reviews/:id/helpful` |
| POST | `/supplier/reviews/:id/reply` |
| GET | `/admin/product-reviews` |
| PATCH | `/admin/product-reviews/:id` |
| DELETE | `/admin/product-reviews/:id` |
| GET | `/shop/products/:id/questions` |
| POST | `/shop/products/:id/questions` |
| POST | `/shop/questions/:id/answer` |
| GET | `/admin/product-questions` |
| PATCH | `/admin/product-questions/:id` |
| DELETE | `/admin/product-questions/:id` |
| GET | `/shop/recently-viewed` |
| GET | `/shop/recommendations` |
| GET | `/wishlists` |
| GET | `/wishlists/contains` |
| POST | `/wishlists` |
| GET | `/wishlists/:id` |
| PATCH | `/wishlists/:id` |
| DELETE | `/wishlists/:id` |
| POST | `/wishlists/:id/items` |
| PATCH | `/wishlists/:id/items/:itemId` |
| DELETE | `/wishlists/:id/items/:itemId` |
| POST | `/wishlists/:id/add-to-cart` |
| GET | `/alerts` |
| POST | `/alerts` |
| DELETE | `/alerts/:id` |

**Notifications** (`notifications.ts`, 3 endpoints)

| Method | Path |
|---|---|
| GET | `/notifications` |
| POST | `/notifications/read-all` |
| POST | `/notifications/:id/read` |

**Ops** (`ops.ts`, 1 endpoints)

| Method | Path |
|---|---|
| POST | `/client-errors` |

**Order timeline, messages, delivery note** (`orderExtras.ts`, 6 endpoints)

| Method | Path |
|---|---|
| GET | `/orders/:id/events` |
| GET | `/orders/:id/messages` |
| POST | `/orders/:id/messages` |
| GET | `/orders/:id/delivery-note.html` |
| POST | `/orders/:id/review` |
| POST | `/reviews/:id/reply` |

**Orders** (`orders.ts`, 5 endpoints)

| Method | Path |
|---|---|
| GET | `/orders` |
| GET | `/orders/frequently-ordered` |
| GET | `/orders/:id` |
| PATCH | `/orders/:id/status` |
| PATCH | `/orders/:id/payment` |

**Phone OTP login** (`otp.ts`, 3 endpoints)

| Method | Path |
|---|---|
| POST | `/otp/request` |
| POST | `/otp/verify` |
| POST | `/phone/verify` |

**Supplier outreach & magic-link price updates** (`outreach.ts`, 4 endpoints)

| Method | Path |
|---|---|
| GET | `/admin/outreach` |
| POST | `/admin/outreach/requests` |
| GET | `/price-update/:token` |
| POST | `/price-update/:token` |

**Payments (Moyasar) & refunds** (`payments.ts`, 7 endpoints)

| Method | Path |
|---|---|
| GET | `/payments/config` |
| POST | `/payments/:orderId/intent` |
| POST | `/payments/:orderId/verify` |
| POST | `/payments/webhook/moyasar` |
| GET | `/payments/:orderId` |
| GET | `/payments/:orderId/page` |
| POST | `/payments/:orderId/refund` |

**RFQs, bids & awards** (`rfqs.ts`, 11 endpoints)

| Method | Path |
|---|---|
| POST | `/rfqs` |
| GET | `/rfqs` |
| GET | `/rfqs/:id` |
| POST | `/rfqs/:id/close` |
| POST | `/rfqs/:id/cancel` |
| GET | `/marketplace/rfqs` |
| POST | `/rfqs/:id/bids` |
| GET | `/bids` |
| POST | `/bids/:id/withdraw` |
| POST | `/bids/:id/accept` |
| POST | `/bids/:id/reject` |

**Shipping, carriers & tracking** (`shipping.ts`, 10 endpoints)

| Method | Path |
|---|---|
| GET | `/shipping/carriers` |
| POST | `/shipping/quote` |
| GET | `/orders/:id/shipments` |
| POST | `/orders/:id/shipments` |
| PATCH | `/shipments/:id` |
| POST | `/shipping/webhooks/:carrier` |
| GET | `/admin/shipping/rates` |
| POST | `/admin/shipping/rates` |
| PATCH | `/admin/shipping/rates/:id` |
| DELETE | `/admin/shipping/rates/:id` |

**Shop storefront & search** (`shop.ts`, 7 endpoints)

| Method | Path |
|---|---|
| GET | `/shop/home` |
| GET | `/shop/suggest` |
| GET | `/shop/brands` |
| GET | `/shop/brands/:brand` |
| GET | `/shop/products` |
| GET | `/shop/products/:id` |
| GET | `/images/materials/:sku` |

**Supplier portal: dashboard, company, team, branches, inventory, finance, platform settings** (`supplierPortal.ts`, 35 endpoints)

| Method | Path |
|---|---|
| GET | `/supplier/dashboard` |
| GET | `/supplier/company` |
| PATCH | `/supplier/company` |
| POST | `/supplier/company/logo` |
| GET | `/supplier/company/documents` |
| POST | `/supplier/company/documents` |
| GET | `/supplier/company/documents/:id/file` |
| GET | `/admin/companies/:id/documents/:docId/file` |
| DELETE | `/supplier/company/documents/:id` |
| GET | `/supplier/branches` |
| POST | `/supplier/branches` |
| PATCH | `/supplier/branches/:id` |
| DELETE | `/supplier/branches/:id` |
| GET | `/supplier/team` |
| POST | `/supplier/team/invite` |
| DELETE | `/supplier/team/invite/:id` |
| PATCH | `/supplier/team/:userId` |
| GET | `/supplier/inventory` |
| GET | `/supplier/inventory/export.csv` |
| GET | `/supplier/inventory/:listingId` |
| PATCH | `/supplier/inventory/:listingId` |
| POST | `/supplier/inventory/:listingId/movements` |
| GET | `/supplier/inventory/:listingId/movements` |
| GET | `/supplier/finance/summary` |
| GET | `/supplier/finance/statement` |
| GET | `/supplier/finance/statement.csv` |
| GET | `/supplier/payouts` |
| GET | `/admin/settings` |
| PATCH | `/admin/settings` |
| GET | `/admin/payouts` |
| POST | `/admin/payouts/generate` |
| PATCH | `/admin/payouts/:id` |
| GET | `/admin/companies/:id` |
| PATCH | `/admin/companies/:id/verification` |
| PATCH | `/admin/companies/:id/documents/:docId` |

**Supplier price list** (`supplierPrices.ts`, 7 endpoints)

| Method | Path |
|---|---|
| GET | `/supplier/prices` |
| POST | `/supplier/prices` |
| POST | `/supplier/prices/bulk` |
| DELETE | `/supplier/prices/:id` |
| PATCH | `/supplier/prices/:id` |
| PUT | `/supplier/prices/:id/tiers` |
| POST | `/supplier/catalog/import` |

**Supplier “My products”** (`supplierProducts.ts`, 3 endpoints)

| Method | Path |
|---|---|
| GET | `/supplier/products` |
| POST | `/supplier/prices/:id/image` |
| DELETE | `/supplier/prices/:id/image` |

## Appendix B — All web routes (96)

**Public** (22 routes)

`/about`, `/boq`, `/brands`, `/brands/[brand]`, `/compare`, `/contact`, `/forgot-password`, `/help`, `/join`, `/login`, `/materials`, `/materials/[id]`, `/`, `/privacy`, `/refund-policy`, `/register`, `/reset-password`, `/shop`, `/shop/products`, `/shop/products/[id]`, `/terms`, `/update-prices/[token]`

**Buyer (signed in)** (22 routes)

`/account`, `/cart`, `/checkout`, `/dashboard`, `/dashboard/addresses`, `/dashboard/alerts`, `/dashboard/buy-again`, `/dashboard/integrations`, `/dashboard/lists`, `/dashboard/notifications`, `/dashboard/orders`, `/dashboard/orders/[id]`, `/dashboard/quotations`, `/dashboard/quotations/[id]`, `/dashboard/recurring`, `/dashboard/returns`, `/dashboard/returns/[id]`, `/dashboard/rfqs`, `/dashboard/rfqs/[id]`, `/dashboard/rfqs/new`, `/pay/[orderId]`, `/payments/callback`

**Supplier portal** (24 routes)

`/supplier`, `/supplier/bids`, `/supplier/branches`, `/supplier/catalog`, `/supplier/company`, `/supplier/documents`, `/supplier/finance`, `/supplier/imports`, `/supplier/imports/[id]`, `/supplier/integrations`, `/supplier/inventory`, `/supplier/marketplace`, `/supplier/marketplace/[id]`, `/supplier/notifications`, `/supplier/orders`, `/supplier/orders/[id]`, `/supplier/prices`, `/supplier/products`, `/supplier/returns`, `/supplier/returns/[id]`, `/supplier/reviews`, `/supplier/team`, `/suppliers`, `/suppliers/[id]`

**Admin console** (28 routes)

`/admin`, `/admin/announcements`, `/admin/attributes`, `/admin/audit`, `/admin/categories`, `/admin/companies`, `/admin/companies/[id]`, `/admin/coupons`, `/admin/credit`, `/admin/feeds`, `/admin/imports`, `/admin/imports/[id]`, `/admin/materials`, `/admin/notifications`, `/admin/orders`, `/admin/orders/[id]`, `/admin/outreach`, `/admin/payments`, `/admin/payouts`, `/admin/product-reviews`, `/admin/reports`, `/admin/returns`, `/admin/returns/[id]`, `/admin/reviews`, `/admin/settings`, `/admin/shipping`, `/admin/support`, `/admin/users`

## Appendix C — Mobile screens (42)
`/(auth)/forgot-password`, `/(auth)/login`, `/(auth)/register`, `/(tabs)/index`, `/(tabs)/orders`, `/(tabs)/profile`, `/(tabs)/rfqs`, `/(tabs)/search`, `/(tabs)/shop`, `/+not-found`, `/account`, `/addresses`, `/alerts`, `/boq`, `/buy-again`, `/cart`, `/checkout`, `/imports/[id]`, `/imports/index`, `/imports/new`, `/lists/[id]`, `/lists/index`, `/material/[id]`, `/notifications`, `/order/[id]`, `/payment`, `/recurring/index`, `/recurring/new`, `/returns/[id]`, `/returns/index`, `/rfq/[id]`, `/rfq/new`, `/shop/product/[id]`, `/shop/search`, `/supplier/company`, `/supplier/dashboard`, `/supplier/finance`, `/supplier/inventory`, `/supplier/inventory/[listingId]`, `/supplier/prices`, `/supplier/products`, `/supplier/team`

## Appendix D — Database models (55)
`User`, `Company`, `Category`, `Material`, `PriceListing`, `PriceHistory`, `Rfq`, `RfqItem`, `Bid`, `BidItem`, `Order`, `OrderItem`, `Cart`, `CartItem`, `Feed`, `Notification`, `Counter`, `Payment`, `Device`, `PasswordResetToken`, `PriceImport`, `PriceImportRow`, `PriceUpdateRequest`, `CompanyInvite`, `CompanyDocument`, `Branch`, `StockMovement`, `OrderEvent`, `OrderMessage`, `Review`, `Payout`, `PlatformSetting`, `OtpCode`, `Shipment`, `ShipmentEvent`, `ShippingRate`, `EInvoiceRecord`, `Coupon`, `AuditLog`, `ContactMessage`, `CategoryAttribute`, `ProductReview`, `ReviewVote`, `ProductQuestion`, `Wishlist`, `WishlistItem`, `RecentlyViewed`, `PriceAlert`, `ListingTier`, `Address`, `Return`, `RecurringOrder`, `ApiKey`, `WebhookEndpoint`, `WebhookDelivery`

## Appendix E — Migrations (apply in order; `prisma migrate deploy` does this automatically)

| # | Migration |
|---|---|
| 1 | `20260914224438_init` |
| 2 | `20260914231142_shop_cart_feeds` |
| 3 | `20260915101318_payments_devices_reset` |
| 4 | `20260915111737_ai_price_collection` |
| 5 | `20260915202500_supplier_portal` |
| 6 | `20260915213000_go_live` |
| 7 | `20260924210000_admin_commerce` |
| 8 | `20260925090000_listing_status_image` |
| 9 | `20260925120000_marketplace_program` |
| 10 | `20260925140000_pg_trgm_search` |
| 11 | `20260925180000_token_version` |
| 12 | `20260925190000_review_votes` |

## Appendix F — Where to read more
`deploy/GO-LIVE.md` (step-by-step launch), `docs/DEVELOPER-HANDOVER.pdf` (architecture and remaining work), `docs/API.md` (endpoint reference), `docs/INTEGRATIONS.md` + `docs/openapi.yaml` (ERP), `docs/SUPPLIER-GUIDE-EN.pdf` (what suppliers see), `README.md` (local development).
