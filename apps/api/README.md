# @mysupplier/api

Express + Prisma + PostgreSQL REST API. Contract: [`docs/API.md`](../../docs/API.md).

```bash
cp .env.example .env            # set DATABASE_URL and JWT_SECRET
pnpm prisma:generate
pnpm prisma:migrate:dev         # or prisma:migrate in production
pnpm prisma:seed                # demo data + demo accounts
pnpm dev                        # http://localhost:4000/api/v1
pnpm test                       # vitest unit tests
```

Layout: `src/routes` (HTTP), `src/services` (domain logic, pure pricing helpers in `pricing.ts`),
`src/middleware` (auth, errors), `src/jobs` (daily price-history snapshot), `prisma/` (schema, migrations, seed).
