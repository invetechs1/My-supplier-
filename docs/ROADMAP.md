# Roadmap

## Shipped in v1.0
- Backend API (FastAPI): auth/roles, catalog with multi-supplier price comparison, price history & market index, external price feed ingestion (CSV/JSON URL + upload), supplier price lists (+ bulk import), RFQ with public/invited visibility, bidding with market reference, award → order → delivery → review, direct orders, price alerts, notifications, admin KPIs, verification, data-quality alerts, audit log. 8 end-to-end tests.
- Web (React): public site (home, catalog, product comparison, suppliers, market index), buyer workspace, supplier portal, admin dashboard. Arabic RTL / English.
- Mobile (Expo iOS/Android): search & compare, product detail with direct order, quote list → RFQ, RFQ list/detail with bidding (supplier) and awarding (buyer), orders, notifications, supplier price list, auth.
- Docker Compose (PostgreSQL + API serving the built web), GitHub Actions CI.

## Shipped in v1.1
- Escrow payments (Moyasar hosted checkout: mada, cards, Apple Pay, STC Pay; bank transfer; mock gateway for dev), platform fee, payouts, refunds, ZATCA phase‑1 tax invoices with QR, admin finance dashboard, supplier payout view.
- OTP by SMS/WhatsApp/email (Unifonic, Twilio, SMTP): verified registration, passwordless phone login, password reset, phone verification.
- Multi-channel notifications (email, SMS, WhatsApp, Expo push) with per-user preferences, outbox with retries and admin delivery log; mobile push registration.
- Background jobs (RFQ expiry, price alerts, feed fetching, payment expiry), per-IP rate limiting, Alembic migrations.

## Shipped in v1.2
- File uploads (local disk or S3-compatible storage): supplier logos, product images, supplier compliance documents (CR, VAT, classification, IBAN letter) with admin review and expiry.
- Bill-of-quantities import (Excel/CSV) into an RFQ with automatic product matching; bid comparison export to Excel.
- Order disputes (buyer or supplier) with admin resolution and optional refund; Sentry error monitoring hook.

## Shipped in v1.3
- Construction equipment catalog: 16 new top-level categories (heavy equipment, generators & compressors, concrete & rebar equipment, scaffolding & formwork, lifting, safety & PPE & fire, surveying, site facilities, HVAC, glass & aluminium, roads & asphalt, landscaping, steel structures & prefab, finishes, construction chemicals, spare parts & consumables) with 159 products; sale and rental (day/week/month) pricing on offers compared per basis; incremental seeding; demo equipment-rental, safety and prefab suppliers.

## Next (in priority order)
1. **Production hardening**: Redis-backed rate limiting and job locks for multi-replica deployments; private bucket + signed URLs for supplier documents.
2. **Payments phase 2**: ZATCA phase‑2 e-invoicing (XML, signing, clearance), Tabby/Tamara BNPL for buyers, automated payouts via bank API, HyperPay as a second gateway.
3. **Supplier connectors**: per-supplier CSV templates and adapters for common supplier ERPs (Odoo, SAP B1) and Google Sheets links (a published-CSV Sheets link already works as a price source).
4. **Search & scale**: PostgreSQL full-text search, product de-duplication (same item, different brands/names), unit normalisation (ton ↔ bag ↔ m³).
5. **Buyer teams & projects**: multiple users per company, per-project RFQ folders, PDF export of comparisons.
6. **Trust**: document expiry reminders, supplier badges from approved documents, review moderation.
7. **Intelligence**: price forecasts per category, "should you buy now" signals, city arbitrage view, public weekly index page for SEO.
8. **Growth**: referral credits, WhatsApp bot for quick price lookups, Arabic SEO landing pages per product/city.
