# Roadmap

## Shipped in v1.0
- Backend API (FastAPI): auth/roles, catalog with multi-supplier price comparison, price history & market index, external price feed ingestion (CSV/JSON URL + upload), supplier price lists (+ bulk import), RFQ with public/invited visibility, bidding with market reference, award → order → delivery → review, direct orders, price alerts, notifications, admin KPIs, verification, data-quality alerts, audit log. 8 end-to-end tests.
- Web (React): public site (home, catalog, product comparison, suppliers, market index), buyer workspace, supplier portal, admin dashboard. Arabic RTL / English.
- Mobile (Expo iOS/Android): search & compare, product detail with direct order, quote list → RFQ, RFQ list/detail with bidding (supplier) and awarding (buyer), orders, notifications, supplier price list, auth.
- Docker Compose (PostgreSQL + API serving the built web), GitHub Actions CI.

## Next (in priority order)
1. **Production hardening**: Alembic migrations, rate limiting, email/SMS OTP on registration (Unifonic/Twilio), Expo push notifications via `notify.register_hook`, S3 uploads for supplier logos and product images.
2. **Payments**: Moyasar/HyperPay/Tabby integration for direct orders and escrow on awarded RFQs; automatic take-rate invoicing (ZATCA e-invoice format).
3. **Supplier connectors**: scheduled feed fetching, per-supplier CSV templates, and adapters for common supplier ERPs (Odoo, SAP B1) and Google Sheets links.
4. **Search & scale**: PostgreSQL full-text search, product de-duplication (same item, different brands/names), unit normalisation (ton ↔ bag ↔ m³).
5. **Buyer teams & projects**: multiple users per company, per-project RFQ folders, BOQ import (Excel) → RFQ in one step, comparison export to Excel/PDF.
6. **Trust**: supplier document vault (CR, VAT, SCA classification), verified-purchase reviews only, dispute flow on orders.
7. **Intelligence**: price forecasts per category, "should you buy now" signals, city arbitrage view, public weekly index page for SEO.
8. **Growth**: referral credits, WhatsApp bot for quick price lookups, Arabic SEO landing pages per product/city.
