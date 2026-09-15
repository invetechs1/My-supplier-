# MySupplier – Go-live runbook

This takes the platform from the repository to a public, HTTPS-secured production deployment
(web + API + PostgreSQL) on one server, plus the mobile apps in the stores.

## 0. Prerequisites (business)
| Item | Why | Where |
|---|---|---|
| Commercial registration (CR) + VAT number | Printed on invoices, required by ZATCA and payment providers | Ministry of Commerce / ZATCA |
| Domain (e.g. `mysupplier.sa`) | `.sa` domains via SaudiNIC-accredited registrars | nic.sa |
| Moyasar account (or HyperPay/Tap) | Mada, Visa/Mastercard, Apple Pay | moyasar.com – needs CR, bank account |
| SMTP provider | Order emails, password resets | Amazon SES, SendGrid, Zoho, M365 |
| Apple Developer + Google Play Console accounts | App store publishing | developer.apple.com, play.google.com/console |

## 1. Server
* Any Linux VM with Docker: 2 vCPU / 4 GB RAM is enough for launch (Oracle Cloud Jeddah, AWS Bahrain
  `me-south-1`, Azure UAE, STC Cloud or Hetzner). Open ports 22, 80, 443 only.
* Install Docker + Compose plugin, create a non-root deploy user, enable unattended security updates.
* DNS: `A` records for `mysupplier.sa`, `www.mysupplier.sa` and `api.mysupplier.sa` → server IP.

## 2. Configure
```bash
git clone <repo> mysupplier && cd mysupplier/deploy
cp .env.production.example .env
openssl rand -hex 48        # -> JWT_SECRET
openssl rand -hex 24        # -> POSTGRES_PASSWORD
nano .env                   # domains, secrets, SMTP, Moyasar keys, legal entity, bank details
```

## 3. Launch
```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api   # wait for "MySupplier API listening"
curl https://api.mysupplier.sa/api/v1/health            # {"ok":true,"db":"up",...}
```
Migrations run automatically when the API container starts (`prisma migrate deploy`).
Caddy obtains and renews TLS certificates automatically.

First data: either `./scripts/seed-demo.sh` (demo catalogue + accounts, staging only) or create the
admin manually:
```bash
docker compose -f docker-compose.prod.yml exec api node -e "
const {PrismaClient}=require('@prisma/client');const b=require('bcryptjs');
new PrismaClient().user.create({data:{email:'admin@mysupplier.sa',passwordHash:b.hashSync(process.argv[1],10),name:'Admin',role:'ADMIN'}}).then(()=>console.log('ok'))" 'A-Strong-Password'
```
Then log in at `https://mysupplier.sa/admin`, create categories/materials or import a feed, and verify suppliers as they register.

## 4. Payments (Moyasar)
1. In the Moyasar dashboard create live API keys → `MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY`.
2. Add a webhook: URL `https://api.mysupplier.sa/api/v1/payments/webhook/moyasar`, event `payment_paid`,
   secret → `MOYASAR_WEBHOOK_SECRET`.
3. Restart the API. `GET /payments/config` now returns `cardPaymentsEnabled: true` and the web/mobile
   checkout shows the card option. Test with Moyasar test keys first (test card 4111 1111 1111 1111).
4. Apple Pay on web needs domain verification in the Moyasar dashboard (hosted file under `/.well-known/`
   — serve it from `apps/web/public/.well-known/`).

## 4b. Phone OTP, carriers, monitoring, e-invoicing
* **OTP login**: create a Unifonic account (unifonic.com), get an App SID and an approved sender ID → `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID`. Until set, phone sign-in works only in development (code 123456).
* **Carriers**: delivery quotes come from rate cards in `/admin/shipping` (seeded for supplier delivery, TruKKer, Trella, SMSA, Aramex). Suppliers book shipments manually with tracking numbers today; when you sign a carrier contract, put its API key in `.env` and adapt `services/carriers/index.ts` to that carrier's payload. Carrier tracking webhooks post to `/api/v1/shipping/webhooks/<carrier>` with header `x-webhook-secret: $CARRIER_WEBHOOK_SECRET`.
* **Monitoring**: create a Sentry project → `SENTRY_DSN`. API 5xx errors and web/mobile client errors are captured. Add an uptime monitor on `/api/v1/health`.
* **ZATCA phase 2**: every order has a UBL 2.1 e-invoice with hash chain at `/orders/:id/einvoice`. To report to Fatoora you need onboarding (CSR → CSID) and XAdES signing with your EGS certificate; then set `ZATCA_*`. Plan this with your accountant before your phase-2 wave date.

## 5. Email
Set SMTP variables and restart. Send yourself a password-reset email from `/forgot-password` to verify.
Add SPF/DKIM/DMARC records for the sending domain to avoid spam folders.

## 6. Mobile apps
```bash
cd apps/mobile
npm i -g eas-cli && eas login && eas build:configure     # writes extra.eas.projectId
eas build -p ios --profile production
eas build -p android --profile production
eas submit -p ios && eas submit -p android
```
Set `EXPO_PUBLIC_API_URL=https://api.mysupplier.sa/api/v1` and `EXPO_PUBLIC_WEB_URL=https://mysupplier.sa`
in `eas.json` production profile (already templated). Push notifications work out of the box through
Expo's push service once the app is built with EAS (iOS needs the push key uploaded by `eas credentials`).
Store listing needs: privacy policy URL (`https://mysupplier.sa/privacy`), support URL, screenshots
(see `apps/mobile/README.md`), and demo credentials for review.

## 6b. Security notes (done in code, verify on the server)
* Verification documents are private (served only to the owning company and admins); logos are public.
* Uploads are validated by magic bytes and stored with server-chosen names; feeds cannot target private networks.
* Card payments are bound to their order through gateway metadata; suppliers can only confirm cash-on-delivery after delivery; payouts cover card and bank-transfer money only, COD commission is invoiced to the supplier.
* After deploying, run `pnpm --filter @mysupplier/api add xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (the sandbox that built this could not reach the SheetJS CDN); the parser is already bounded to 8 MB / 5,000 rows.
* Rotate any API key that was ever pasted into a chat or ticket. Keep `JWT_SECRET`, webhook secrets and Moyasar keys only in `deploy/.env`.

## 7. Operations
| Task | How |
|---|---|
| Redeploy after a git push | `./scripts/deploy.sh` |
| Logs | `docker compose -f docker-compose.prod.yml logs -f api web caddy` |
| Backups | nightly dumps in `deploy/backups/` (14-day retention); `./scripts/backup.sh s3://bucket` for off-site |
| Restore | `./scripts/restore.sh backups/<file>.dump` |
| Health / uptime | monitor `https://api.mysupplier.sa/api/v1/health` (UptimeRobot, Better Stack…) – returns 503 when the DB is down |
| Scaling | move Postgres to a managed service (RDS/Cloud SQL), run 2+ `api` replicas behind Caddy, add Redis for jobs when RFQ volume grows |
| Secrets rotation | change in `.env`, `docker compose up -d` (JWT rotation logs everyone out) |

## 8. Launch checklist
- [ ] Legal entity, VAT number and bank details set in `.env` (they print on every invoice)
- [ ] Terms, privacy and refund pages reviewed by counsel (`/terms`, `/privacy`, `/refund-policy`)
- [ ] Admin account created, default demo accounts removed (or seeded only on staging)
- [ ] Payment test transaction and refund done in Moyasar test mode, then live keys
- [ ] SMTP verified, SPF/DKIM set
- [ ] Health monitor + alerting configured, backups verified by a test restore
- [ ] Mobile builds submitted; deep link `mysupplier://payment` tested on a device
- [ ] Unifonic sender ID approved and OTP tested on a real phone
- [ ] Sentry DSN set; test error visible in Sentry
- [ ] Shipping rate cards reviewed with your first carriers; `CARRIER_WEBHOOK_SECRET` set
- [ ] Refund tested in Moyasar test mode
- [ ] First 20 suppliers onboarded with price lists (bulk CSV in `/supplier/prices` or `/supplier/catalog`)
- [ ] At least one external price feed registered in `/admin/feeds`
