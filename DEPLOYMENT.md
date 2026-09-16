# Go-live guide — My Supplier · Build for Less

Everything a developer needs to take the platform live. Estimated time for a first production deploy: **about 2 hours** plus waiting on third-party approvals (Moyasar account, Unifonic sender ID, app-store review).

## 0. What you need
| Item | Notes |
|---|---|
| A Linux server (Ubuntu 22.04+, 2 vCPU / 4 GB is enough to start) | any provider in KSA/region: STC Cloud, Oracle Jeddah, AWS Bahrain, Hetzner… |
| A domain, e.g. `mysupplier.sa`, with an **A record** to the server IP (and `www`) | HTTPS certificates are automatic (Caddy / Let's Encrypt) |
| Docker + Docker Compose plugin on the server | `curl -fsSL https://get.docker.com \| sh` |
| Moyasar account (live keys) | payments — mada, Visa/MC, Apple Pay, STC Pay |
| Unifonic account + approved sender ID | SMS OTP and notifications in Saudi Arabia (Twilio also supported) |
| SMTP account (e.g. Google Workspace, Zoho, SES) | email OTP and notifications |
| Apple Developer + Google Play accounts, Expo (EAS) account | mobile app publishing |

## 1. Server deploy (Docker, recommended)
```bash
sudo mkdir -p /opt/mysupplier && sudo chown $USER /opt/mysupplier
git clone https://github.com/invetechs1/My-supplier-.git /opt/mysupplier
cd /opt/mysupplier
cp .env.production.example .env
nano .env        # fill DOMAIN, POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32), ADMIN_PASSWORD, Moyasar/Unifonic/SMTP keys
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api     # wait for "Application startup complete"
```
Open `https://<DOMAIN>` → the site, `https://<DOMAIN>/docs` → API docs. Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then change the password in Settings.

**Updates later**: `./deploy/deploy.sh` (pulls main, rebuilds, migrates, restarts). **Backups**: add `0 3 * * * /opt/mysupplier/deploy/backup.sh` to cron.

Without Docker: see `deploy/mysupplier.service` (systemd) and put nginx/Caddy in front.

## 2. Payments (Moyasar)
1. In the Moyasar dashboard create **live** API keys → `MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY`.
2. Enable mada, Visa/Mastercard, Apple Pay (upload the domain-association file if Moyasar asks; served from the site root) and STC Pay.
3. Add a **webhook**: URL `https://<DOMAIN>/api/v1/payments/webhook/moyasar`, events `invoice_paid`, `payment_paid`, `payment_failed`; set a secret token and put it in `MOYASAR_WEBHOOK_SECRET`.
4. Test with one real order of a few riyals: pay → order shows *paid* → tax invoice appears → supplier marks delivered → payout appears in Admin → Finance.
5. Bank transfers need no gateway: admin confirms receipt in Admin → Finance. Set `PLATFORM_BANK_INSTRUCTIONS` to your real IBAN.
6. Payouts to suppliers are done from your bank (manual) and marked paid in the dashboard; automated bank payouts are on the roadmap.

## 3. OTP & notifications
- **Unifonic**: create an app → `UNIFONIC_APP_SID`; register the sender ID (`UNIFONIC_SENDER_ID`) with CST through Unifonic. Set `SMS_PROVIDER=unifonic`.
- **Email**: `EMAIL_PROVIDER=smtp` + SMTP settings. Add SPF/DKIM records for the sending domain.
- **WhatsApp** (optional): `WHATSAPP_PROVIDER=meta` with a WhatsApp Cloud API number, or `twilio`.
- **Push**: works automatically for EAS builds (`PUSH_PROVIDER=expo`).
- Set `OTP_REQUIRED=1` and `OTP_DEBUG_RETURN_CODE=0` in production (codes are never returned by the API).
- Admin → *Delivery log* shows every SMS/email/push with provider references and lets you retry failures.

## 4. Mobile apps (iOS + Android)
```bash
cd mobile
npm install --legacy-peer-deps
npm i -g eas-cli && eas login
eas init                      # writes the EAS projectId into app.json → extra.eas.projectId
# point the app at production
#   app.json → expo.extra.apiBase = "https://<DOMAIN>"   (or EXPO_PUBLIC_API_BASE in eas.json env)
eas build -p android --profile production   # .aab for Google Play
eas build -p ios --profile production       # needs Apple Developer account
eas submit -p android / eas submit -p ios
```
Store listing: name **مورّدي — Build for Less**, icon and splash are in `mobile/assets/`, bundle IDs `sa.mysupplier.app` (change in `app.json` if needed). Push notifications require the EAS build (Expo Go is fine for testing everything else).

## 5. Go-live checklist
- [ ] `.env`: `SEED_DEMO_DATA=0`, strong `JWT_SECRET`, `ADMIN_PASSWORD` changed after first login, `CORS_ORIGINS` = your domain
- [ ] HTTPS working (`https://<DOMAIN>/api/v1/health` returns `{"status":"ok"}`)
- [ ] Moyasar live keys + webhook secret set; one real test payment done and refunded
- [ ] Unifonic sender ID approved; OTP received on a real phone; `OTP_REQUIRED=1`
- [ ] SMTP verified (registration email arrives, not in spam; SPF/DKIM set)
- [ ] `PLATFORM_VAT_NUMBER` and legal name set (they print on invoices/QR)
- [ ] Categories reviewed in Admin; first real suppliers invited and verified; demo suppliers not present
- [ ] External price sources added in Admin → Price sources (CSV/JSON links or uploads)
- [ ] Nightly backup cron installed; a restore tested once (`gunzip -c file.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U mysupplier mysupplier`)
- [ ] Mobile builds submitted; `apiBase` points to production
- [ ] Monitoring: uptime check on `/api/v1/health`; optionally forward container logs to your log service

## 6. Operating the platform
- **Admin dashboard** (`/admin`): KPIs, supplier verification and plans, users, price sources, data quality, finance (payments, transfers, refunds, payouts), delivery log and scheduled jobs.
- **Scaling**: raise `WEB_CONCURRENCY`; move PostgreSQL to a managed instance (set `DATABASE_URL`); with several API replicas keep `JOBS_ENABLED=1` on exactly one of them (or run `python -m app.jobs` from cron) and move rate limiting to Redis (roadmap).
- **Migrations**: after any model change run `alembic revision --autogenerate -m "…"` locally, commit, and `deploy.sh` applies it.
- **Docs**: `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/INTEGRATIONS.md`, `docs/BUSINESS_MODEL.md`, `docs/ROADMAP.md`, `brand/README.md`.
