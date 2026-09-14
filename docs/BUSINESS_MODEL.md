# Business model & fundraising path

## The market
Saudi construction spending is in the hundreds of billions of riyals per year (giga-projects, housing, infrastructure). Building materials are typically 50–60% of project cost, yet pricing is opaque: contractors phone 5–10 suppliers per item, prices differ 10–25% between suppliers and cities, and quotes take days. A single trusted, always-current price layer plus an RFQ marketplace is the wedge.

## Revenue lines (all implemented or ready to switch on)
| Line | Mechanism | Where in the product |
|---|---|---|
| **Transaction take-rate** | 1.5–3% of awarded RFQ / direct-order GMV, charged to the supplier | Orders carry totals; admin dashboard shows GMV and estimated revenue at 2.5% |
| **Supplier subscriptions** | free / pro / enterprise plans (bid limits, featured placement, analytics, multi-city price lists, API access) | `Supplier.plan`, admin sets plan on verification |
| **Verification & compliance** | paid onboarding/verification badge (CR, VAT, ratings) | `Supplier.verified` |
| **Price intelligence** | paid market-index reports, category trend data, API access for developers, ERP integrations | `/market/index`, `/market/trending`, price history tables |
| **Buyer premium** | project-level RFQ workspaces, team seats, invited-only tenders, procurement analytics | RFQ visibility + invites; extend with teams |
| **Financing & logistics (later)** | BNPL for materials with partner banks, delivery marketplace, escrow | Order state machine is the hook |

## Why buyers and suppliers come (and stay)
- Buyer: one search shows *all* prices; one RFQ reaches every relevant supplier; awarded orders are tracked and rated.
- Supplier: qualified demand delivered to them, zero cost to list, visibility of where they rank on price (`best_price_offers` on their dashboard), stale-price nudges keep the data fresh.
- Data flywheel: more suppliers → better comparisons → more buyers → more RFQs → more suppliers. External price feeds seed the comparison before the supplier base is dense.

## KPIs to show investors (all available in the admin dashboard / DB)
- Priced products and offers, share of offers updated in the last 30 days (freshness).
- Registered vs verified suppliers, RFQ count, bids per RFQ, award rate, time-to-first-bid.
- GMV (awarded + direct), take-rate revenue, repeat-buyer rate, supplier win-rate distribution.

## Path to a large outcome
The ask of "billions of riyals" is a **GMV** target, not first-year revenue. A realistic ladder:
1. **0–6 months (Riyadh, 3 categories: cement, steel, blocks/aggregates):** 200+ verified suppliers, 3,000+ priced SKUs, 100 RFQs/month. Raise pre-seed/seed on freshness + RFQ traction.
2. **6–18 months (5 cities, all categories, mobile in stores, API):** 1,000+ suppliers, take-rate switched on, first ERP/e-procurement integrations with large contractors, price-index licensing. Series A on GMV run-rate and supplier retention.
3. **18–36 months:** financing partner, logistics marketplace, GCC expansion. At 2.5% take-rate, SAR 1B annual GMV ≈ SAR 25M revenue plus subscriptions and data — this is the scale at which "billions in GMV" becomes a credible, financeable story.

Fundraising conversations in KSA should reference Vision 2030 housing targets, the Contractors Authority (SCA) classification data for supplier onboarding, and Etimad/Monsha'at programs for SME suppliers.
