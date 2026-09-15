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
`pnpm --filter @mysupplier/mobile web` runs it in a browser (react-native-web;
the session and guest cart fall back to `localStorage` there). Push
notifications and the native payment sheet are native-only.

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

`EXPO_PUBLIC_WEB_URL` (default `https://mysupplier.sa`) is the public web app;
the Profile tab opens `/terms`, `/privacy` and `/contact` from it and password
reset emails link there.

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
  (auth)/forgot-password.tsx  POST /auth/forgot-password (reset link by email)
  account.tsx            edit name/phone, change password, delete account (DELETE /auth/me)
  payment.tsx            deep-link target mysupplier://payment?order=&id=&status= -> POST /payments/:id/verify
  checkout.tsx           delivery details, payment method (CARD only when GET /payments/config says
                         cardPaymentsEnabled), hosted Moyasar page via expo-web-browser after checkout
  (tabs)/                Home · Search · RFQs · Orders · Profile
  boq.tsx                BOQ price research: paste a bill of quantities (EN/AR), POST /boq/analyze,
                         per-line matches with confidence + all offers, "Where to buy" supplier
                         breakdown, change a match (pinned materialId re-analysis), Send as RFQ
                         (POST /boq/to-rfq, buyers only; guests get the login prompt)
  material/[id].tsx      price summary tiles, listings, sparkline, "Request quotes"
  rfq/new.tsx            create RFQ (items via material search or custom)
  rfq/[id].tsx           buyer: ranked bids + accept/reject/close; supplier: bid form
  order/[id].tsx         status timeline; supplier advances status, buyer cancels; "Pay now" for unpaid
                         CARD orders, bank-transfer instructions, ZATCA invoice number + QR (react-native-svg)
                         and "View invoice" (opens /orders/:id/invoice.html?token=…)
  notifications.tsx      list + mark read / mark all read
  supplier/prices.tsx    supplier price list (add / update / delete)
src/
  theme.ts               colours (#0B6E4F primary, #F2A900 accent), spacing, radius, type
  lib/api.ts             typed fetch wrapper (bearer token from storage, error parsing)
  lib/storage.ts         SecureStore on native, localStorage on web
  lib/auth.tsx           AuthProvider / useAuth (bootstraps from storage + GET /auth/me,
                         registers / unregisters the push token on login / logout)
  lib/push.ts            expo-notifications: permission, Expo push token -> POST /devices,
                         notification-tap routing (data.link -> /order/:id, /rfq/:id, /notifications)
  lib/payments.ts        card flow: POST /payments/:id/intent + openAuthSessionAsync(hosted page)
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

Each profile sets `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WEB_URL` in `eas.json`;
adjust the staging and production URLs before building.

### EAS Update (OTA)

`app.json` pins `runtimeVersion: { "policy": "appVersion" }`, so every store
version (1.0.0, 1.1.0, …) has its own update channel. To enable OTA updates run
`eas update:configure`, which adds

```json
"updates": { "url": "https://u.expo.dev/<EXPO_PROJECT_ID>" }
```

to `app.json` (placeholder until the EAS project exists), then publish with
`eas update --branch production --message "..."`.

## Store submission checklist

Identifiers: iOS `sa.mysupplier.app` (buildNumber `1`), Android
`sa.mysupplier.app` (versionCode `1`), version `1.0.0`. Assets live in
`assets/` (`icon.png` 1024², `adaptive-icon.png` 1024² foreground on
transparent, `splash.png` 1284×2778, `notification-icon.png` 96² white glyph,
`favicon.png` 48²) and are generated from `assets/logo.svg`.

1. **EAS project** – `eas build:configure` fills `extra.eas.projectId`; push
   tokens need it (`Constants.expoConfig.extra.eas.projectId`).
2. **Push credentials** – iOS APNs key (`eas credentials`), Android FCM v1
   service account uploaded to Expo. The API sends through Expo's push service.
3. **Payments** – set `MOYASAR_SECRET_KEY` / `MOYASAR_PUBLISHABLE_KEY` on the
   API so `GET /payments/config` returns `cardPaymentsEnabled: true`; until
   then the Card option is shown disabled ("Soon"). Add
   `mysupplier://payment` as the callback/redirect URL in the Moyasar
   dashboard. Apple Pay needs the merchant ID registered in App Store Connect.
4. **`eas.json` submit profile** – replace `appleId`, `ascAppId`,
   `appleTeamId` and drop the Play Console service-account JSON at
   `apps/mobile/google-play-service-account.json` (git-ignored).
5. **App Store Connect / Play Console listing**
   - Privacy policy URL: `https://mysupplier.sa/privacy`; Terms:
     `https://mysupplier.sa/terms`; support: `https://mysupplier.sa/contact`.
   - **Apple privacy nutrition labels / Google Data safety**: data collected =
     name, email, phone, company details (account), purchase history (orders),
     device push token (notifications), coarse city (delivery). No tracking,
     no advertising SDKs, no third-party analytics. Card data is entered on the
     gateway's hosted page and never touches the app.
   - Account deletion: available in-app under Profile → Account settings →
     Delete account (calls `DELETE /auth/me`), required by both stores.
   - Encryption: `ITSAppUsesNonExemptEncryption = false` (HTTPS only).
   - Permissions: iOS camera / photo-library strings are placeholders for the
     upcoming photo-attachment feature (remove them from `app.json` if that
     ships later); Android requests only INTERNET, POST_NOTIFICATIONS,
     RECEIVE_BOOT_COMPLETED, VIBRATE.
   - Age rating 4+/Everyone; category Business / Shopping.
6. **Screenshots** – 6.7" iPhone (1290×2796), 6.5" (1284×2778), 5.5"
   (1242×2208), 12.9" iPad if `supportsTablet` stays true; Android phone
   (1080×1920+) and 7"/10" tablets. Suggested set: Shop, Product, BOQ research
   results, Cart, RFQ with bids, Order with invoice, Profile.
7. **Review notes (both stores)** – "MySupplier is a B2B construction-materials
   marketplace for Saudi Arabia. Browsing needs no account. Demo accounts:
   buyer `buyer@mysupplier.sa` / `Buyer123!` (shop, cart, checkout, RFQs,
   orders, invoices); supplier `supplier@mysupplier.sa` / `Supplier123!`
   (open RFQs, bids, price list). Card payments run in test mode against
   Moyasar; use test card 4111 1111 1111 1111, any future expiry, CVC 123.
   Push notifications require a physical device."
8. **Deep links** – scheme `mysupplier://` (payment result, notifications);
   universal links for `https://mysupplier.sa/app/*` need the AASA /
   assetlinks.json files served by the web app before enabling `autoVerify`.
9. Final gate: `pnpm --filter @mysupplier/mobile typecheck`,
   `eas build --profile production --platform all`, install the internal
   build, run through login → checkout → order → invoice on a real device,
   then `eas submit --profile production --platform all`.
