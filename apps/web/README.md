# @mysupplier/web

Next.js 14 (App Router) frontend for **MySupplier** — Saudi building-materials price discovery, RFQ and bidding platform.

## Run

```bash
# from the monorepo root
pnpm install
cp apps/web/.env.example apps/web/.env.local   # set NEXT_PUBLIC_API_URL if the API is not on :4000
pnpm dev:web                                   # http://localhost:3000
```

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.

## Structure

```
src/
  app/            routes (public, /dashboard buyer, /supplier, /admin)
  components/     ui primitives, Header/Footer, SidebarLayout, MaterialAutocomplete, Orders, NotificationsPanel
  lib/api.ts      typed fetch client for docs/API.md (JWT from localStorage "ms_token")
  lib/auth.tsx    AuthProvider + useAuth()
  lib/i18n.ts     EN/AR dictionary + dir switching
  lib/hooks.ts    useAsync / useDebounce / useFlash
```

All data-fetching pages are client components; the API base URL is `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`).

## Docker

```bash
docker build -f apps/web/Dockerfile -t mysupplier-web .   # build context = repo root
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 mysupplier-web
```
Note: `NEXT_PUBLIC_*` values are inlined at build time; pass `--build-arg NEXT_PUBLIC_API_URL=...` for a production image.
