# Integrations: payments, OTP, notifications, jobs

Everything below works out of the box in **dev mode** with built-in stand-ins (mock gateway, console SMS/email, console push) and switches to real providers by environment variables only. No code changes are needed to go live.

## 1. Payments (escrow) — `backend/app/services/payments.py`

**Flow**: buyer clicks *Pay now* on an order → `POST /payments/checkout {order_id, method}` → the platform creates a `Payment` and returns a hosted checkout URL (or bank-transfer instructions) → gateway confirms via **webhook** and/or the client calls `POST /payments/{id}/sync` after redirect → order becomes `paid`; a ZATCA-style **tax invoice** (supplier → buyer) and a **platform-fee invoice** (platform → supplier) are issued → supplier delivers → `delivered` **releases escrow** into a `Payout` (net of the platform fee) → admin pays the supplier and marks the payout paid (reference stored). Cancelling a paid, undelivered order refunds automatically.

| Variable | Meaning |
|---|---|
| `PAYMENT_PROVIDER` | `mock` (default, dev) or `moyasar` |
| `MOYASAR_SECRET_KEY` / `MOYASAR_PUBLISHABLE_KEY` | from the Moyasar dashboard (mada, Visa/MC, Apple Pay, STC Pay) |
| `MOYASAR_WEBHOOK_SECRET` | secret you set on the Moyasar webhook; sent as `X-Webhook-Secret` header or `secret_token` field. Webhook URL: `https://<api>/api/v1/payments/webhook/moyasar` |
| `PLATFORM_FEE_PCT` | take rate (default 2.5) deducted from the supplier payout |
| `PLATFORM_VAT_NUMBER` | appears on platform-fee invoices and the QR |
| `PLATFORM_BANK_INSTRUCTIONS` | shown for `bank_transfer`; admin confirms receipt in Admin → Finance |
| `PUBLIC_BASE_URL` / `WEB_BASE_URL` | used for callback and return URLs |

The webhook never trusts the payload alone: with `moyasar` the payment status is re-fetched from the Moyasar API before it is marked paid. Adding HyperPay/Tap/Tabby = one more provider class with `create_checkout / fetch_status / refund`.

**Invoices**: `GET /payments/invoices/order/{id}` (JSON) and `GET /payments/invoices/{id}.html` (printable, QR as SVG). The QR is the ZATCA phase‑1 TLV (seller, VAT no., timestamp, total, VAT). Phase‑2 (XML + signing + clearance) is a later step and slots into `issue_invoices`.

## 2. OTP — `backend/app/services/otp.py`

`POST /auth/otp/request {destination, purpose, channel?}` → `POST /auth/otp/verify {destination, code, purpose}` → `verification_token` (15 min).

- `purpose=register`: pass the token as `otp_token` to `/auth/register` → phone/email is stored as verified. Set `OTP_REQUIRED=1` to make it mandatory.
- `purpose=login`: verify returns an access token directly (passwordless login by phone).
- `purpose=reset`: use the token with `POST /auth/password/reset`.
- `purpose=verify`: logged-in user attaches a verified phone via `POST /auth/verify-contact`.

Codes are 6 digits, hashed (HMAC), expire after `OTP_TTL_MINUTES` (5), max `OTP_MAX_ATTEMPTS` (5), at most `OTP_MAX_REQUESTS_PER_10MIN` (3) per destination, plus a per-IP limit (`RATE_LIMIT_OTP_PER_MINUTE`). Saudi numbers are normalised to `+9665XXXXXXXX`. While the SMS/email provider is `console`, the API returns `debug_code` so the UI flow works without a real provider (`OTP_DEBUG_RETURN_CODE=0` disables this).

## 3. Notification channels — `backend/app/services/channels.py`

Every in-app notification also creates one **outbox row per enabled channel** (user preferences: `PATCH /auth/me/notifications`). A background worker sends them with retries (30s, 60s, 120s) and records provider references and errors. Admin → *Delivery log* shows every send and can retry failures.

| Channel | `*_PROVIDER` | Variables |
|---|---|---|
| Email | `console` / `smtp` | `SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_TLS` |
| SMS | `console` / `unifonic` / `twilio` | `UNIFONIC_APP_SID, UNIFONIC_SENDER_ID` or `TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM` |
| WhatsApp | `console` / `twilio` / `meta` | `TWILIO_WHATSAPP_FROM` or `META_WA_PHONE_ID, META_WA_TOKEN` (WhatsApp Cloud API) |
| Push | `expo` / `console` | optional `EXPO_ACCESS_TOKEN`. Devices register via `POST /notifications/devices` (the mobile app does this after login) |

Unifonic is the usual choice in Saudi Arabia (sender-ID registration required with CST); Twilio works for both SMS and WhatsApp during pilots. WhatsApp outbound outside the 24‑hour window needs approved templates — swap the `text` body for a `template` payload in `MetaWhatsApp.send`.

## 4. Background jobs — `backend/app/services/jobs.py`

Runs inside the API process (`JOBS_ENABLED=1`, tick every `JOBS_TICK_SECONDS`) or from cron: `python -m app.jobs` (all) / `python -m app.jobs fetch_feeds`.

| Job | Interval | What |
|---|---|---|
| `outbox` | every tick | send queued notification deliveries |
| `close_expired_rfqs` | 5 min | close RFQs past `closes_at`, tell the buyer how many bids arrived |
| `price_alerts` | 15 min | notify watchers when the best price hits their target (or drops 3% below baseline) |
| `fetch_feeds` | hourly check, `FEED_FETCH_INTERVAL_HOURS` | pull every active external price source |
| `expire_payments` | hourly | fail checkout attempts older than 24h |

Admin → *Delivery log* lists recent runs and can run any job now (`POST /admin/jobs/{name}/run`). With several API replicas, run jobs from one cron host and set `JOBS_ENABLED=0` on the others.

## 5. Rate limiting & migrations

- Per-IP limits on `POST /api/v1/auth/*` (`RATE_LIMIT_AUTH_PER_MINUTE`, 30) and `/auth/otp/*` (`RATE_LIMIT_OTP_PER_MINUTE`, 6). In-memory; behind a load balancer use `X-Forwarded-For` (already honoured) or move the counter to Redis.
- **Alembic** is set up in `backend/migrations` (initial revision included). Production: `AUTO_CREATE_TABLES=0` and run `alembic upgrade head` on deploy; after model changes `alembic revision --autogenerate -m "…"`.

## 6. Mobile specifics
- Expo push: `expo-notifications` + `expo-device`; token is registered after login (`src/push.ts`). Build with EAS so the Expo push token maps to APNs/FCM (`eas credentials`).
- Payments open the hosted checkout in the system browser; after payment the buyer returns to the app and the order list refreshes (`/payments/{id}/sync` is called by the web return page; the app re-reads the order).

## 7. File storage (v1.2)
Uploads (supplier logos, product images, compliance documents) go to local disk by default (`backend/data/uploads`, served at `/uploads/...`). For production set `STORAGE_BACKEND=s3` with `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT` (Oracle OCI, Wasabi, MinIO) and `S3_PUBLIC_BASE` (CDN), plus the standard `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Files are type-checked by magic bytes (PNG/JPG/WEBP, PDF for documents) and limited to `MAX_UPLOAD_MB` (8). Documents are stored with random names; for stricter privacy move them to a private bucket and serve signed URLs (see the handover backlog).

## 8. Monitoring
Set `SENTRY_DSN` (and `ENVIRONMENT=production`) to send exceptions and traces to Sentry; nothing is sent when unset.
