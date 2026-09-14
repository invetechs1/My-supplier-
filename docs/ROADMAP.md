# Roadmap – from MVP to the Kingdom's building-materials price authority

## Phase 0 – this repository (MVP, done)
* Catalogue of Saudi building materials with EN/AR names, price comparison across all suppliers
  and public market sources, 120-day price history, category price index.
* RFQ + bidding marketplace, orders, notifications, buyer / supplier / admin dashboards,
  iOS & Android app, seeded demo data, Docker + CI.

## Phase 1 – trust & data breadth (months 1–3)
* Supplier onboarding with CR / VAT verification against Wathq (Saudi Business Center) APIs.
* Nafath / Absher login for individuals, ZATCA-compliant e-invoicing on orders.
* Price-capture partnerships: cement & steel producers, ready-mix plants, quarries; weekly
  imports from GASTAT and Ministry of Municipal & Rural Affairs indices via `POST /admin/prices/import`.
* Push notifications (Expo Push / FCM / APNs), SMS via Unifonic, WhatsApp order updates.
* Supplier reviews, on-time delivery score, dispute workflow.

## Phase 2 – transactions & monetisation (months 3–9)
* Escrow-style payments (Mada, SADAD, Tamara/Tabby B2B), supplier payouts.
* Take rate on awarded orders + supplier subscription tiers (featured listings, RFQ alerts,
  analytics). Logistics quotes (truck / trailer / pump) inside the bid.
* BOQ upload (Excel / IFC) → auto-generated multi-item RFQ; project budgets.
* Price alerts and forward indications (e.g. "rebar expected +3% next month").

## Phase 3 – scale (months 9–24)
* Regional rollout (GCC), multi-currency, English/Arabic/Urdu UI.
* Supplier ERP integrations (SAP B1, Odoo, Zoho) for automatic price sync.
* Credit & financing for contractors backed by transactional history (partner banks / fintechs).
* Data products: monthly national price index reports for developers, consultants, banks, and
  government (Vision 2030 giga-projects).

## KPIs that drive valuation
GMV through platform, number of verified suppliers, SKU coverage × cities, price freshness
(median listing age), RFQ→award conversion, repeat-buyer rate, take rate.
