# MySupplier mobile (`@mysupplier/mobile`)

Expo SDK 51 / React Native 0.74 app (iOS + Android) for the MySupplier
building-materials price-discovery, RFQ and bidding platform. Routing is
file-based with **expo-router v3** (`app/` directory); shared domain types
come from `@mysupplier/shared` (workspace package, consumed as raw `.ts`).

## Run it

```bash
# from the monorepo root
pnpm install --filter @mysupplier/mobile...
cp apps/mobile/.env.example apps/mobile/.env   # then edit EXPO_PUBLIC_API_URL
pnpm --filter @mysupplier/mobile start         # or: pnpm dev:mobile
```

Scan the QR code with **Expo Go** (iOS App Store / Google Play), or press
`i` / `a` in the terminal to open the iOS simulator / Android emulator.
`pnpm --filter @mysupplier/mobile web` runs it in a browser (SecureStore is a
no-op there, so the session is not persisted across reloads).

Make sure the API is running: `pnpm dev:api` (defaults to port 4000).

### API URL and `EXPO_PUBLIC_API_URL`

The app reads `process.env.EXPO_PUBLIC_API_URL` at bundle time and falls back
to `http://localhost:4000/api/v1`.

| Where the app runs            | Value to use                                        |
|-------------------------------|-----------------------------------------------------|
| iOS simulator                 | `http://localhost:4000/api/v1`                      |
| **Android emulator**          | `http://10.0.2.2:4000/api/v1` (emulator alias for the host's localhost; `localhost` would point at the emulator itself) |
| Physical device via Expo Go   | `http://<your-machine-LAN-IP>:4000/api/v1`, e.g. `http://192.168.1.20:4000/api/v1` (same Wi-Fi) |
| Staging / production          | the deployed API URL, set per profile in `eas.json` |

After changing `.env`, restart Metro with `expo start -c` so the value is
re-inlined.

Demo accounts (from the API seed): `buyer@mysupplier.sa / Buyer123!` and
`supplier@mysupplier.sa / Supplier123!`. The login screen has shortcuts for them.

## Project layout

```
app/                     expo-router routes
  _layout.tsx            AuthProvider + I18nProvider + root Stack
  (auth)/login.tsx       email/password login (modal)
  (auth)/register.tsx    BUYER / SUPPLIER registration with company fields
  (tabs)/                Home · Search · RFQs · Orders · Profile
  boq.tsx                BOQ price research: paste a bill of quantities (EN/AR), POST /boq/analyze,
                         per-line matches with confidence + all offers, "Where to buy" supplier
                         breakdown, change a match (pinned materialId re-analysis), Send as RFQ
                         (POST /boq/to-rfq, buyers only; guests get the login prompt)
  material/[id].tsx      price summary tiles, listings, sparkline, "Request quotes"
  rfq/new.tsx            create RFQ (items via material search or custom)
  rfq/[id].tsx           buyer: ranked bids + accept/reject/close; supplier: bid form
  order/[id].tsx         status timeline; supplier advances status, buyer cancels
  notifications.tsx      list + mark read / mark all read
  supplier/prices.tsx    supplier price list (add / update / delete)
src/
  theme.ts               colours (#0B6E4F primary, #F2A900 accent), spacing, radius, type
  lib/api.ts             typed fetch wrapper (bearer token from SecureStore, error parsing)
  lib/auth.tsx           AuthProvider / useAuth (bootstraps from SecureStore + GET /auth/me)
  lib/i18n.ts            tiny EN/AR dictionary + useI18n
  lib/format.ts          formatSar (re-exported from shared), dates, relative time
  hooks/                 useApi (loading/error/refresh), useDebounce
  components/            Screen, Button, TextField, PickerModal, MaterialCard, PriceTile,
                         StatusBadge, Sparkline, MaterialSearchModal, RequireAuth, states...
```

Unauthenticated users can browse Home, Search, material details and the BOQ
price research screen (reachable from the Home card and the Profile tab). RFQs,
bidding, orders, notifications and the supplier price list are wrapped in
`<RequireAuth>` which shows a login prompt in place (no hard redirect).

## Scripts

| Script      | What it does              |
|-------------|---------------------------|
| `start`     | `expo start`              |
| `android`   | `expo start --android`    |
| `ios`       | `expo start --ios`        |
| `web`       | `expo start --web`        |
| `typecheck` | `tsc --noEmit`            |
| `test`      | no tests yet              |

## Monorepo notes

- `metro.config.js` adds the monorepo root to `watchFolders` and both
  `apps/mobile/node_modules` and the root `node_modules` to
  `resolver.nodeModulesPaths`, with symlink support for pnpm.
- `tsconfig.json` maps `@/*` to `src/*` and `@mysupplier/shared` to the
  package source; `babel-preset-expo` picks up the same `paths`, so the
  shared `.ts` source is transpiled by Metro without a build step.

## EAS builds

```bash
npm i -g eas-cli
eas login
eas build:configure                      # sets extra.eas.projectId in app.json

eas build --profile development --platform android   # dev client (internal)
eas build --profile preview --platform android       # installable APK for testers
eas build --profile preview --platform ios           # internal iOS build
eas build --profile production --platform all        # store builds
eas submit --profile production --platform ios       # / android
```

Each profile sets `EXPO_PUBLIC_API_URL` in `eas.json`; adjust the staging and
production URLs before building.
