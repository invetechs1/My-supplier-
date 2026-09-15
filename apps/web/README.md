# @mysupplier/web

Next.js 14 (App Router) frontend for **MySupplier** — Saudi building-materials price discovery, RFQ and bidding platform.

## Run

```bash
# from the monorepo root
pnpm install
cp apps/web/.env.example apps/web/.env.local   # set NEXT_PUBLIC_API_URL if the API is not on :4000, NEXT_PUBLIC_SITE_URL for the public URL
pnpm dev:web                                   # http://localhost:3000
```

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.

## Structure

```
src/
  app/            routes (public, /dashboard buyer, /supplier, /admin, /account, /pay/[orderId], /payments/callback,
                  legal: /terms /privacy /refund-policy /about /contact /help; robots.ts, sitemap.ts, manifest.ts)
  components/     ui primitives, Header/Footer, SidebarLayout, MaterialAutocomplete, Orders, NotificationsPanel,
                  MoyasarForm (card payments), CookieBanner, legal/Prose
  lib/api.ts      typed fetch client for docs/API.md (JWT from localStorage "ms_token")
  lib/auth.tsx    AuthProvider + useAuth()
  lib/payments.tsx usePaymentConfig() (GET /payments/config, cached) + bank-transfer placeholders
  lib/i18n.ts     EN/AR dictionary + dir switching
  lib/hooks.ts    useAsync / useDebounce / useFlash / usePageTitle
```

All data-fetching pages are client components; the API base URL is `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`).
`NEXT_PUBLIC_SITE_URL` (default `http://localhost:3000`) feeds `metadataBase`, Open Graph URLs, `robots.txt` and `sitemap.xml`.

Card payments use the Moyasar hosted form (`https://cdn.moyasar.com/mpf/1.14.0/`); the CARD option is enabled only when
`GET /payments/config` returns `cardPaymentsEnabled: true`. The gateway redirects to `/payments/callback?id=&status=&order=`,
which calls `POST /payments/:orderId/verify`. PWA icons live in `public/icons/` (generated from `logo.svg`).

## Docker

```bash
docker build -f apps/web/Dockerfile -t mysupplier-web .   # build context = repo root
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 mysupplier-web
```
Note: `NEXT_PUBLIC_*` values are inlined at build time; pass `--build-arg NEXT_PUBLIC_API_URL=...` for a production image.
