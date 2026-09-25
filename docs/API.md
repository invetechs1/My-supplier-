# MySupplier REST API contract (v1)

Base URL: `http://localhost:4000/api/v1` (env `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL`).

All responses are JSON. Errors: `{ "error": string, "details"?: any }` with 4xx/5xx.
Authenticated routes need `Authorization: Bearer <jwt>`. Types are in `packages/shared/src/index.ts`.

Roles: `BUYER` (contractor / anyone buying), `SUPPLIER` (must have a company), `ADMIN`.

## Public
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/stats` | `PlatformStats` for landing page |
| GET | `/price-index` | `PriceIndexEntry[]` (category level index, 30d change) |
| GET | `/categories` | `Category[]` (flat, with `materialCount`) |
| GET | `/materials?q=&categoryId=&city=&page=1&pageSize=20&sort=price_asc|price_desc|name|updated` | `Paginated<Material>` with `minPrice/avgPrice/maxPrice/supplierCount` |
| GET | `/materials/:id` | `Material & { summary: PriceSummary, listings: PriceListing[], history: PriceHistoryPoint[] }` |
| GET | `/materials/:id/prices?city=` | `PriceListing[]` sorted by price asc (company embedded) |
| GET | `/prices/compare?materialIds=a,b,c&city=` | `Array<{ material: Material, summary: PriceSummary, listings: PriceListing[] }>` |
| GET | `/suppliers?city=&q=` | `Company[]` (type SUPPLIER, verified first) |
| GET | `/suppliers/:id` | `Company & { listings: PriceListing[], stats: { listings, bids, wonBids } }` |

## BOQ research (public – guests can use it; the core "don't drive around" feature)
| POST | `/boq/parse` | `{ text }` -> `{ lines: BoqLineInput[] }` parses pasted BOQ text / CSV (EN + AR, "25 ton rebar 16mm", "Rebar 16mm, 25, ton", …) |
| POST | `/boq/analyze` | `{ text? , lines?: BoqLineInput[], city?, verifiedOnly? }` -> `BoqAnalysis`: every line matched to a material (confidence + alternatives; pass `materialId` on a line to pin a match), all supplier offers sorted by price, `bestOffer` per line, `summary` (cheapestTotal, averageTotal, savings, bestSingleSupplier), `suppliers[]` breakdown (coverage %, total, lead time) |
| POST | `/boq/to-rfq` | auth BUYER: `{ title, deliveryCity, deliveryAddress?, deliveryDate?, closesInDays=7, notes?, lines }` -> `Rfq` (suppliers notified) |

## Shop (Amazon-style storefront, public)
| GET | `/shop/home` | `ShopHome` – featured, deals (best price ≥5% under average), new arrivals, categories, stats |
| GET | `/shop/products?q=&categoryId=&city=&brand=&minPrice=&maxPrice=&inStock=1&sort=relevance|price_asc|price_desc|newest|popular&page=&pageSize=` | `Paginated<Product>` (each with `bestOffer`, `offerCount`, `isDeal`, `inStock`) |
| GET | `/shop/products/:id` | `ProductDetail` – all `offers` sorted by price (like "other sellers"), `summary`, `history`, `related` |
| GET | `/shop/brands` | `string[]` |
| GET | `/images/materials/:sku.svg` | generated product image (SVG) used when a material has no `imageUrl` |

## Cart & checkout (auth: any role; buyers typically)
| GET | `/cart` | `Cart` (totals include 15% VAT and delivery fee per supplier) |
| POST | `/cart/items` | `{ listingId, quantity }` -> `Cart` (adds or increments; validates minQty and stock) |
| PATCH | `/cart/items/:id` | `{ quantity }` -> `Cart` |
| DELETE | `/cart/items/:id` | `Cart` |
| DELETE | `/cart` | `Cart` (empty) |
| POST | `/checkout` | `CheckoutPayload` -> `CheckoutResult`: one `DIRECT` order per supplier in the cart, cart emptied, suppliers notified |

Orders (`/orders`) now return `OrderExtended` (with `review` embedded when one exists) (with `type`, `items`, `subtotal`, `vat`, `deliveryFee`, `paymentStatus`, delivery details). Suppliers can `PATCH /orders/:id/status`; `PATCH /orders/:id/payment { paymentStatus }` is supplier/admin.

## Supplier catalogue (role SUPPLIER)
| POST | `/supplier/catalog/import` | `{ items: SupplierCatalogItem[] }` -> `{ created, updated, listings, errors[] }` creates new materials (source SUPPLIER) when the SKU/name is unknown and upserts the supplier's offer with stock |
| PATCH | `/supplier/prices/:id` | `{ price?, stock?, minQty?, leadTimeDays?, validUntil? }` -> `PriceListing` |

## Admin feeds – collecting construction products from external sources (role ADMIN)
| GET | `/admin/feeds` | `Feed[]` |
| POST | `/admin/feeds` | `{ name, url, format: "json"|"csv", enabled? }` -> `Feed`. Source must return rows `{ sku, name, nameAr?, category, unit, brand?, price, city, imageUrl?, stock? }` |
| POST | `/admin/feeds/:id/run` | fetches the URL now -> `{ created, updated, listings, errors[] }` (materials are created with source FEED; prices stored as MARKET listings keyed by feed name). A daily job runs all enabled feeds. |
| POST | `/admin/feeds/import` | same row format inline: `{ sourceName, items: [...] }` (no URL) |
| DELETE | `/admin/feeds/:id` | `{ ok: true }` |

## Production features
### Payments (Moyasar-ready; Mada, Visa/Mastercard, Apple Pay)
| GET | `/payments/config` | `PaymentConfig` – tells clients whether card payments are enabled and the publishable key |
| POST | `/payments/:orderId/intent` | auth buyer -> `PaymentIntent` (amount in halalas, callback URL) used to render the Moyasar form / hosted page |
| POST | `/payments/:orderId/verify` | auth buyer: `{ paymentId }` – server verifies with Moyasar (amount + status) and marks the order PAID -> `{ order: OrderExtended, payment: PaymentRecord }` |
| POST | `/payments/webhook/moyasar` | gateway webhook (secret header `x-webhook-secret`) marks orders paid |
| GET | `/payments/:orderId` | `PaymentRecord[]` for the order (buyer / supplier / admin) |

### Invoices (ZATCA phase-1 simplified tax invoice QR)
| GET | `/orders/:id/invoice` | auth (buyer/supplier/admin) -> `InvoiceData` (JSON incl. base64 TLV QR + SVG) |
| GET | `/orders/:id/invoice.html?token=<jwt>` | printable HTML invoice (open in new tab / print to PDF); token in query because browsers can't send headers on navigation |

### Push notifications & devices
| POST | `/devices` | auth: `DeviceRegistration` (Expo push token) -> `{ ok: true }`; every in-app notification is also pushed to the user's registered devices and emailed when SMTP is configured |
| DELETE | `/devices/:token` | auth -> `{ ok: true }` |

### Password reset & account
| POST | `/auth/forgot-password` | `{ email }` -> `{ ok: true }` always (sends an email with a reset link `WEB_URL/reset-password?token=…`; in development the link is logged) |
| POST | `/auth/reset-password` | `{ token, password }` -> `{ ok: true }` |
| POST | `/auth/change-password` | auth: `{ currentPassword, newPassword }` -> `{ ok: true }` |
| DELETE | `/auth/me` | auth: deactivates the account (app-store requirement) -> `{ ok: true }` |

### Ops
| GET | `/health` | `HealthStatus` (checks the database; returns 503 when down) |
| GET | `/sitemap.xml` | product + category URLs for the web app |

## AI price collection
Prices enter the platform four ways: supplier self-service, AI-read documents, AI-read web pages (feeds with `format: "html"`), and magic-link updates. All AI imports land in a **review queue** before publishing.

| Method | Path | Notes |
|---|---|---|
| GET | `/ai/config` | `AiConfig` |
| POST | `/imports` | auth BUYER/SUPPLIER/ADMIN. `multipart/form-data`: `file` (pdf, xlsx, xls, csv, png, jpg, webp; ≤15 MB) **or** `text`; fields `kind` (SUPPLIER_PRICE_LIST for suppliers, BUYER_QUOTATION for buyers, TEXT), `city?`, `sourceName?`, `supplierName?` (quotations), `quotationDate?`. Processes synchronously (10–60 s) and returns `PriceImport` with `rows` (matched to the catalogue with confidence + alternatives), status `REVIEW` |
| GET | `/imports?status=&kind=&page=` | `Paginated<PriceImport>` (mine; admin sees all) |
| GET | `/imports/:id` | `PriceImport` with `rows` |
| PATCH | `/imports/:id/rows/:rowId` | `{ materialId?, price?, unit?, city?, status?, createMaterial? }` -> `PriceImportRow` (setting `materialId` recomputes confidence to 1) |
| POST | `/imports/:id/approve-all` | `{ minConfidence?: 0.8 }` -> `PriceImport` (SUGGESTED rows with confidence ≥ min become APPROVED) |
| POST | `/imports/:id/publish` | `{ includeSuggested?: boolean, minConfidence?: 0.8 }` -> `PublishImportResult`. Supplier imports create/update the supplier's SUPPLIER listings; buyer quotations create `QUOTATION` listings attributed to the quoting supplier (matched by name, else `sourceName`); admin/web imports create MARKET listings. Rows with `createMaterial` and no match create new catalogue items |
| POST | `/imports/:id/reject` | -> `PriceImport` |
| GET | `/materials?q=` | (existing) use for the "change match" search box |

`PriceSource` now includes `QUOTATION` (a price a buyer actually received). Material pages and BOQ research show it with a "quoted" badge.

### Web-page feeds (AI scraping)
`POST /admin/feeds` accepts `format: "html"` plus optional `companyId`, `city`, `autoPublish`. Running such a feed fetches the page, extracts prices with AI and creates a `PriceImport` (kind WEB_PAGE) in REVIEW — or publishes directly when `autoPublish` is true. `POST /admin/feeds/:id/run` then returns `{ importId, extracted, published }`. `Feed` gains `format: "json" | "csv" | "html"`, `companyId?`, `city?`, `autoPublish`.

### Supplier outreach & magic-link price updates
| GET | `/admin/outreach?staleDays=14&q=` | `OutreachSupplier[]` sorted by staleness |
| POST | `/admin/outreach/requests` | `{ companyIds: string[], channel: "EMAIL"|"WHATSAPP"|"LINK", message? }` -> `OutreachRequestResult[]` (EMAIL sends the link; WHATSAPP returns a wa.me URL to open; LINK just returns the link). Links expire in 14 days |
| GET | `/price-update/:token` | public -> `PriceUpdateRequestInfo` (supplier's current listings) |
| POST | `/price-update/:token` | public -> `PriceUpdateSubmission` -> `{ updated, added, completedAt }` |
A weekly job emails suppliers whose prices are older than `OUTREACH_STALE_DAYS` (default 14) when `OUTREACH_AUTO=true`.

## Supplier portal (multi-tenant)
Every supplier endpoint is scoped to the caller's `companyId`. Company roles: `OWNER` / `MANAGER` (everything), `SALES` (prices, catalogue, bids, orders, messages), `WAREHOUSE` (inventory, order status). `GET /auth/me` now includes `companyRole` and `company` carries the `CompanyProfile` fields.

### Dashboard & analytics
| GET | `/supplier/dashboard?days=30` | `SupplierDashboard` (KPIs, 30-day revenue/orders series, orders by status, top products, price competitiveness vs market, recent orders & reviews) |

### Company profile, storefront, documents, branches
| GET | `/supplier/company` | `CompanyProfile` |
| PATCH | `/supplier/company` | OWNER/MANAGER: any `CompanyProfile` editable field (`name, nameAr, slug, description, descriptionAr, citiesServed, minOrderValue, deliveryFee, deliveryDays, workingHours, phone, email, website, bankName, iban, beneficiary, lowStockThreshold`) -> `CompanyProfile` |
| POST | `/supplier/company/logo` | multipart `file` (png/jpg/webp ≤ 2 MB) -> `CompanyProfile` (logoUrl) |
| GET | `/supplier/company/documents` | `CompanyDocument[]` |
| POST | `/supplier/company/documents` | multipart `file` (pdf/png/jpg ≤ 10 MB) + `type` -> `CompanyDocument` (sets verificationStatus UNDER_REVIEW) |
| DELETE | `/supplier/company/documents/:id` | `{ ok }` |
| GET/POST | `/supplier/branches` | `Branch[]` / `{ name, city, address?, phone?, isDefault? }` -> `Branch` |
| PATCH/DELETE | `/supplier/branches/:id` | update / remove (listings keep working; branch nulled) |
| GET | `/suppliers/:idOrSlug` | public `SupplierPublicProfile` (now includes logo, description, branches, reviews, stats) |
| GET | `/suppliers/:id/reviews?page=` | `Paginated<Review>` |
Uploaded files are served from `/uploads/...` (local disk `UPLOAD_DIR`; switch to S3 in production via `UPLOAD_BASE_URL`).

### Team
| GET | `/supplier/team` | `{ members: TeamMember[], invites: CompanyInvite[] }` |
| POST | `/supplier/team/invite` | OWNER/MANAGER: `{ email, role, name? }` -> `CompanyInvite` (emails a link `WEB_URL/join?token=…`, 7 days) |
| DELETE | `/supplier/team/invite/:id` | cancel |
| PATCH | `/supplier/team/:userId` | OWNER/MANAGER: `{ role?, active? }` (cannot demote the last OWNER) |
| GET | `/auth/invite/:token` | public -> `{ company: {id,name}, email, role, expiresAt }` |
| POST | `/auth/accept-invite` | public `{ token, name, password, phone? }` -> `AuthResponse` (creates SUPPLIER user in the company; if the email already has an account it is attached instead) |

### Inventory
| GET | `/supplier/inventory?q=&branchId=&lowStock=1&page=` | `Paginated<InventoryItem>` |
| PATCH | `/supplier/inventory/:listingId` | `{ stock: number | null, branchId? }` sets the level (records an ADJUST movement) |
| POST | `/supplier/inventory/:listingId/movements` | `{ type: "IN"|"OUT"|"ADJUST", quantity, reason? }` -> `StockMovement` |
| GET | `/supplier/inventory/:listingId` | `InventoryItem` |
| GET | `/supplier/inventory/:listingId/movements` | `StockMovement[]` (latest 100) |
| GET | `/supplier/inventory/export.csv` | CSV of all listings with stock |
Checkout records `OUT` movements per order item; cancelling a PENDING/CONFIRMED order records `RELEASE` and restores stock. Low-stock items (stock ≤ company threshold) raise a `SYSTEM` notification to WAREHOUSE/OWNER users once per day.

### Orders: timeline, messages, delivery note
| GET | `/orders/:id/events` | `OrderEvent[]` |
| GET | `/orders/:id/messages` | `OrderMessage[]` (marks the other side's messages read) |
| POST | `/orders/:id/messages` | `{ body }` -> `OrderMessage` (buyer ↔ supplier; notifies the other party) |
| GET | `/orders/:id/delivery-note.html?token=` | printable delivery note / packing slip |
| POST | `/orders/:id/review` | buyer, order DELIVERED: `{ rating 1-5, comment? }` -> `Review` |
| POST | `/reviews/:id/reply` | supplier: `{ reply }` -> `Review` |

### Finance & payouts
| GET | `/supplier/finance/summary` | `FinanceSummary` |
| GET | `/supplier/finance/statement?from=&to=&page=` | `Paginated<StatementLine>` |
| GET | `/supplier/finance/statement.csv?from=&to=` | CSV |
| GET | `/supplier/payouts` | `Payout[]` |
| GET | `/admin/settings` / `PATCH` | `PlatformSettings` (`commissionPct`, `payoutDayOfWeek`, `lowStockThresholdDefault`) |
| GET | `/admin/payouts?status=&page=` | `Paginated<Payout>` |
| POST | `/admin/payouts/generate` | `{ periodStart, periodEnd, companyId? }` -> `{ created: Payout[] }` (net of paid + delivered orders not yet paid out) |
| PATCH | `/admin/payouts/:id` | `{ status: "PAID", reference? }` -> `Payout` (notifies supplier) |
| PATCH | `/admin/companies/:id/verification` | `{ status: VerificationStatus, notes?, commissionPct? }` -> `CompanyProfile` (VERIFIED also sets `verified=true`) |
| GET | `/admin/companies/:id` | `CompanyProfile & { documents: CompanyDocument[], members: TeamMember[], branches: Branch[] }` |
| PATCH | `/admin/companies/:id/documents/:docId` | `{ status, notes? }` |

## Go-live features
### Phone OTP login (Saudi users prefer mobile sign-in)
| POST | `/auth/otp/request` | `OtpRequestPayload` -> `OtpRequestResult`. Sends a 6-digit code by SMS (Unifonic when `UNIFONIC_APP_SID` is set) or logs it in development (`devCode` returned when not production). Rate limited: 5 per phone per 15 min |
| POST | `/auth/otp/verify` | `OtpVerifyPayload` -> `AuthResponse`. Existing account with that phone logs in; a new phone creates a BUYER (or SUPPLIER with `company`) using `name`. Marks `phoneVerified` |
| POST | `/auth/phone/verify` | auth: `{ code }` after `/auth/otp/request` with purpose VERIFY_PHONE -> `User` |

### Refunds
| POST | `/payments/:orderId/refund` | SUPPLIER (owner/manager) or ADMIN: `RefundPayload` -> `RefundResult`. Card payments are refunded through Moyasar (`POST /payments/:id/refund`); bank/COD payments are recorded as manual refunds. Order `paymentStatus` becomes `REFUNDED`, an event and notification are written |

### Shipments & carriers
| GET | `/shipping/carriers` | `Carrier[]` (enabled carriers) |
| POST | `/shipping/quote` | public: `{ supplierCompanyId?, items: [{ materialId, quantity }], deliveryCity, pickupCity? }` -> `DeliveryQuote[]` sorted by price (zone from pickup vs delivery city, weight/volume from material logistics data, rate cards) |
| GET | `/cart?deliveryCity=` | (existing) `deliveryFee` now comes from the cheapest quote per supplier, falling back to the flat fee; `Cart` gains `quotes: Record<supplierId, DeliveryQuote | null>` |
| POST | `/checkout` | (existing) accepts optional `carrierBySupplier: Record<supplierId, CarrierCode>`; the chosen quote's price becomes the order's `deliveryFee` and a `PENDING` shipment is created per order |
| GET | `/orders/:id/shipments` | `Shipment[]` (buyer, supplier, admin) |
| POST | `/orders/:id/shipments` | supplier: `CreateShipmentPayload` -> `Shipment` (status BOOKED; sets order IN_TRANSIT when it moves) |
| PATCH | `/shipments/:id` | supplier: partial `CreateShipmentPayload` + `{ status?, description?, location? }` -> `Shipment` (adds an event; DELIVERED sets the order DELIVERED, notifies buyer) |
| POST | `/shipping/webhooks/:carrier` | carrier tracking webhook (`x-webhook-secret` = `CARRIER_WEBHOOK_SECRET`): `{ trackingNumber, status, description?, location? }` |
| GET/POST | `/admin/shipping/rates` · `PATCH/DELETE /admin/shipping/rates/:id` | `ShippingRate` cards (seeded for SUPPLIER own fleet, TRUKKER/TRELLA heavy trucking, SMSA/ARAMEX parcel) |
| PATCH | `/admin/materials/:id` | (existing) now accepts `weightKg`, `volumeM3`, `hazardous` |
Carrier APIs (Trukker, Trella, SMSA, Aramex) are integrated through `services/carriers/*` adapters: quoting uses the rate cards; booking/tracking calls the carrier when its credentials are configured, otherwise shipments are managed manually by the supplier with tracking numbers.

### E-invoicing (ZATCA phase 2 groundwork)
| GET | `/orders/:id/einvoice` | `EInvoiceRecord` (generated on first request: UBL 2.1 XML, SHA-256 hash chained to the previous invoice, UUID, counter, phase-1 QR) |
| GET | `/orders/:id/einvoice.xml?token=` | the UBL XML |
| POST | `/admin/einvoices/:id/report` | submits to ZATCA reporting API when `ZATCA_*` credentials are configured, else returns `PENDING_CONFIG` |

### Ops
| POST | `/client-errors` | `ClientErrorReport` from web/mobile -> logged and forwarded to Sentry when `SENTRY_DSN` is set |
Verification documents are now served only through `GET /supplier/company/documents/:id/file` (owner/manager) and `GET /admin/companies/:id/documents/:docId/file` (admin), both accepting `?token=`; logos remain public under `/uploads/`.

## Auth
| POST | `/auth/register` | body `RegisterPayload` -> `AuthResponse` (SUPPLIER must include `company`) |
| POST | `/auth/login` | body `LoginPayload` -> `AuthResponse` |
| GET | `/auth/me` | `User` (company embedded) |
| PATCH | `/auth/me` | `{ name?, phone?, locale? }` -> `User` |
| POST | `/auth/logout` | Revokes every session token issued so far for the user (bumps `tokenVersion`); password change/reset, role change and deactivation do the same |
| POST | `/auth/download-token` | `{ path }` -> `{ token, expiresIn: 60 }`. Path-bound 60-second token for links that cannot send a header: `/orders/:id/invoice.html`, `/orders/:id/delivery-note.html`, `/orders/:id/einvoice.xml`, `/supplier/inventory/export.csv`, `/supplier/finance/statement.csv`, `/supplier/company/documents/:id/file`, `/admin/companies/:id/documents/:docId/file`, `/payments/:orderId/page`. Append it as `?token=`; session JWTs are rejected in URLs and download tokens are rejected as sessions |

## Buyer (role BUYER or ADMIN)
| POST | `/rfqs` | `CreateRfqPayload` -> `Rfq` (notifies suppliers: `NEW_RFQ`) |
| GET | `/rfqs?status=&page=` | `Paginated<Rfq>` (mine) |
| GET | `/rfqs/:id` | `Rfq` incl. `bids: Bid[]` when caller is the buyer/admin; supplier sees only own bid |
| POST | `/rfqs/:id/close` | -> `Rfq` |
| POST | `/rfqs/:id/cancel` | -> `Rfq` |
| POST | `/bids/:id/accept` | buyer accepts a bid -> `{ order: Order, rfq: Rfq }` (rfq AWARDED, other bids REJECTED, creates order, notifies) |
| POST | `/bids/:id/reject` | -> `Bid` |

## Supplier (role SUPPLIER)
| GET | `/marketplace/rfqs?city=&q=&page=` | `Paginated<Rfq>` open RFQs (status OPEN, closesAt > now), flag `myBidId` if already bid |
| POST | `/rfqs/:id/bids` | `CreateBidPayload` -> `Bid` (one bid per company per RFQ; re-post updates it) |
| GET | `/bids?status=&page=` | `Paginated<Bid>` (my company's bids with rfq embedded) |
| POST | `/bids/:id/withdraw` | -> `Bid` |
| GET | `/supplier/prices?page=` | `Paginated<PriceListing>` (my company) |
| POST | `/supplier/prices` | `UpsertPricePayload` -> `PriceListing`. 409 when the company already lists that material in that city; send `overwrite: true` to replace it (the web form asks for confirmation) |
| POST | `/supplier/prices/bulk` | `{ items: UpsertPricePayload[] }` -> `{ upserted: number }` |
| DELETE | `/supplier/prices/:id` | `{ ok: true }` |

## Orders (buyer sees own, supplier sees company's, admin all)
| GET | `/orders?page=` | `Paginated<Order>` |
| GET | `/orders/:id` | `Order` (rfq, bid, company embedded) |
| PATCH | `/orders/:id/status` | `{ status: OrderStatus }` supplier: CONFIRMED/IN_TRANSIT/DELIVERED; buyer: CANCELLED while PENDING |

## Notifications (any authenticated)
| GET | `/notifications?unread=1` | `Notification[]` (latest 50) + header `X-Unread-Count` |
| POST | `/notifications/:id/read` | `Notification` |
| POST | `/notifications/read-all` | `{ ok: true }` |

## Admin (role ADMIN)
| GET | `/admin/stats` | `PlatformStats & { rfqsByStatus: Record<string, number>, recentOrders: Order[], topCategories: PriceIndexEntry[] }` |
| GET | `/admin/users?q=&role=&page=` | `Paginated<User>` |
| PATCH | `/admin/users/:id` | `{ role?, active? }` |
| GET | `/admin/companies?verified=&page=` | `Paginated<Company>` |
| PATCH | `/admin/companies/:id/verify` | `{ verified: boolean }` -> `Company` |
| POST | `/admin/categories` | `{ slug, name, nameAr, parentId?, icon? }` |
| PATCH | `/admin/categories/:id` | partial `{ slug?, name?, nameAr?, parentId? (null = top level), icon? }` (audited) |
| DELETE | `/admin/categories/:id` | `{ ok: true }` – only for categories with no products and no sub-categories (409 otherwise) |
| POST | `/admin/materials` | `{ sku, name, nameAr, unit, categoryId, brand?, specs?, description? }` |
| PATCH | `/admin/materials/:id` | partial material |
| DELETE | `/admin/materials/:id` | `{ ok: true }` |
| POST | `/admin/prices/import` | `{ sourceName, items: Array<{ sku, price, city, minQty?, leadTimeDays? }> }` -> imports MARKET listings from external price sources |

## Supplier "My products" (role SUPPLIER)
| Method | Path | Notes |
|---|---|---|
| GET | `/supplier/products?q=&status=ACTIVE|PAUSED|OUT_OF_STOCK|EXPIRED&city=&categoryId=&sort=updated|name|price|stock&page=` | `SupplierProductsResponse`: every offer the supplier has in the marketplace with `displayImageUrl`, computed `status`, `competitors`, `bestCompetitorPrice`, `isCheapest`, `sold30d`, plus `summary` counts across the whole catalogue and the supplier's `cities` |
| PATCH | `/supplier/prices/:id` | now also accepts `active: boolean` (pause/resume: paused offers are hidden from every public listing, search, BOQ match and shop page) |
| POST | `/supplier/prices/:id/image` | multipart `file` (JPEG/PNG/WebP, 3 MB): supplier photo for the offer; shown in the shop when the material has no catalogue image |
| DELETE | `/supplier/prices/:id/image` | remove the supplier photo |

## Admin commerce back office (role ADMIN)
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/admin/coupons`, `PATCH`/`DELETE /admin/coupons/:id` | Coupons & promotions: `{ code, type: PERCENT|FIXED, value, minOrder?, maxDiscount?, startsAt?, endsAt?, usageLimit?, active }`; listing includes `orders` and `discountGiven` |
| GET | `/cart?coupon=CODE` | Cart quote with `discount`, `coupon` and `couponError`; `POST /checkout` accepts `couponCode` (discount split pro rata per supplier order, VAT on the discounted subtotal, `usedCount` incremented) |
| GET | `/admin/reviews?rating=&hidden=&q=&page=` | `Paginated<AdminReview>` + `summary { average, total, hidden }`; `PATCH /admin/reviews/:id { hidden?, reply? }`, `DELETE`. Hidden reviews are excluded from public supplier pages |
| GET | `/admin/payments?status=&provider=&q=&page=` | Payments ledger with `summary` per status and `outstanding` unpaid orders; refunds via `POST /payments/:orderId/refund` |
| GET | `/admin/reports?days=30` | `AdminReports`: totals (GMV and change vs previous period, orders, AOV, active buyers, new users, RFQ conversion, paid share, discounts, open support), daily series, top products/suppliers, by category/city/payment method/status |
| GET | `/admin/audit?entity=&action=&q=&page=` | Append-only audit log of privileged actions (user role changes, verification, settings, payouts, refunds, coupons, moderation, announcements, support) |
| GET/POST | `/admin/announcements` | `POST { title, body, audience: ALL|BUYERS|SUPPLIERS, link?, email? }` notifies every active user in the audience (in-app + push, optional email); `GET` lists past sends |
| POST | `/contact` | Public, rate limited: `{ name, email, phone?, subject, message, orderRef? }` creates a support ticket and notifies admins |
| GET | `/admin/contact?status=&q=&page=` | Support inbox with `summary` by status; `PATCH /admin/contact/:id { status, notes }` |

## ERP integration
Machine API for SAP, Oracle Fusion, Dynamics 365 BC, Odoo, Zoho or custom ERPs. Full OpenAPI 3.0 spec in [`docs/openapi.yaml`](./openapi.yaml), connection guide, sync patterns, signature samples and field mappings in [`docs/INTEGRATIONS.md`](./INTEGRATIONS.md).

Authentication: `X-API-Key: msk_live_…` (or `Authorization: ApiKey …`). Keys belong to a company, carry scopes (`catalog:read`, `prices:write`, `stock:write`, `orders:read`, `orders:write`, `invoices:read`, `rfqs:read`, `rfqs:write`, `webhooks:manage`) and are rate limited to 600 req/min per key. `/integrations/v1/*` rejects JWT-only callers with 401.

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/integrations/keys`, `POST /integrations/keys/:id/revoke` | JWT company OWNER/MANAGER or ADMIN (`?companyId=`): `{ name, scopes[], expiresAt? }` → `{ apiKey, key }` – plaintext key returned once (sha256 hash + 12-char prefix stored). Audited |
| GET | `/integrations/scopes` | Available scopes with descriptions and webhook event names |
| GET/POST | `/integrations/webhooks` | JWT manager or key with `webhooks:manage`: `{ url (https, public), events[] or ["*"], description? }` → `{ endpoint, secret }` (secret once); `PATCH /:id { url?, events?, description?, active? }`, `DELETE /:id`, `POST /:id/test` (signed `ping`), `GET /:id/deliveries?status=&page=`, `POST /integrations/deliveries/:id/retry` |
| GET | `/integrations/v1/ping` | `{ ok, company, keyName, scopes, serverTime }` connection test |
| GET | `/integrations/v1/catalog/categories`, `/catalog/materials?updatedSince=&categorySlug=&sku=&q=&page=`, `/catalog/prices?sku=&city=&limit=` | `catalog:read`: product master for SKU mapping; best active offers per SKU for buyer ERPs |
| PUT | `/integrations/v1/prices` | `prices:write` (suppliers): up to 1000 rows `{ sku|materialId, city, price, minQty?, leadTimeDays?, validUntil?, salePrice?, stock?, active? }`, upsert on (sku, city), per-row `created|updated|error` results |
| PUT | `/integrations/v1/stock` | `stock:write`: up to 1000 rows `{ sku+city | listingId, stock }` (absolute, ADJUST movement); low stock fires `stock.low` |
| GET | `/integrations/v1/orders?since=&status=&paymentStatus=&poNumber=&page=`, `/orders/:reference` | `orders:read`: supplier's sales orders (ERP shape: buyer contact + company VAT/CR, shipTo, items with SKU, totals, e-invoice ids, shipments), sorted by `updatedAt` for incremental pulls |
| PATCH | `/integrations/v1/orders/:reference/status` | `orders:write`: `{ status: CONFIRMED|PROCESSING|SHIPPED|IN_TRANSIT|DELIVERED|CANCELLED, trackingNumber?, trackingUrl?, carrierName?, note? }` – same transitions as `/orders/:id/status`, aliases PROCESSING→CONFIRMED, SHIPPED→IN_TRANSIT, idempotent replay, creates/updates a shipment when a tracking number is given |
| GET | `/integrations/v1/purchases?since=…`, `/purchases/:reference` | `orders:read`: orders placed by the key's (buyer) company |
| GET | `/integrations/v1/invoices?since=&side=sales|purchases&includeXml=` | `invoices:read`: ZATCA e-invoice records with order totals (UBL XML optional) |
| GET/POST | `/integrations/v1/rfqs`, `GET /rfqs/:id`, `POST /rfqs/:id/bids` | `rfqs:read` / `rfqs:write`: suppliers see open RFQs (marketplace query, with `myBid`) and bid with the same payload as the JWT route; buyer companies list their own RFQs and create new ones (`items[].sku` resolves description/unit) |

Webhooks: `POST` JSON `{ id, event, createdAt, data }` with `X-MySupplier-Event`, `X-MySupplier-Delivery`, `X-MySupplier-Timestamp` and `X-MySupplier-Signature: sha256=HMAC-SHA256(secret, timestamp + "." + body)`; 10 s timeout; retries after 1m, 5m, 30m, 2h, 12h then `FAILED`; `responseCode` and the first 2 KB of the response are kept in the delivery log. Events: `order.created`, `order.status_changed`, `order.paid`, `order.cancelled`, `payment.refunded`, `invoice.issued`, `rfq.created`, `bid.received`, `bid.accepted`, `stock.low`, `return.requested`, `ping`.

## Demo accounts (seed)
| Role | Email | Password |
|---|---|---|
| Admin | admin@mysupplier.sa | Admin123! |
| Buyer | buyer@mysupplier.sa | Buyer123! |
| Supplier | supplier@mysupplier.sa | Supplier123! |

## B2B commerce
Volume tiers & sales, address book, credit terms (net terms), reorder / buy again, returns (RMA) and recurring orders. Types live in `packages/shared/src/commerce.ts` (`CartItemPricing`, `Address`, `CreditInfo`, `ReturnRequest`, `RecurringOrder`, `FrequentlyOrderedItem`, `ReorderResult`, `CheckoutExtras`, …).

### Pricing in the cart
| Method | Path | Notes |
|---|---|---|
| GET | `/cart` | Every item now carries `CartItemPricing`: `unitPrice` (effective), `basePrice`, `tierApplied { minQty, price } \| null`, `saleApplied`, `nextTier { minQty, price, savePerUnit } \| null` and the listing's `tiers`. Rule: live sale price wins, else the highest tier whose `minQty <= quantity`, else the base price. `lineTotal`/`subtotal` use the effective price; `savings` = total tier/sale saving; `credit` = `CreditInfo & { canCoverCart }` for the buyer's company (null without a company) |
| POST | `/checkout` | `CheckoutPayload & CheckoutExtras`: `paymentMethod` now also `CREDIT`; `addressId` (saved address, fills `deliveryCity`/`deliveryAddress`/`contactPhone`, must belong to the buyer) and `poNumber` are stored on every order. Order items store the effective unit price. Coupon split, per-supplier shipments and stock reservation unchanged |

### Supplier tiers & sales (role SUPPLIER)
| Method | Path | Notes |
|---|---|---|
| PATCH | `/supplier/prices/:id` | also accepts `salePrice` (nullable, must be `< price`) and `saleEndsAt` (nullable date, future). Clearing `salePrice` clears `saleEndsAt`. Response includes `tiers` |
| PUT | `/supplier/prices/:id/tiers` | `{ tiers: [{ minQty, price }] }` replaces the whole ladder; must be ascending `minQty > 1` with strictly decreasing prices below the base price (max 10). `[]` removes all tiers. -> listing with `tiers` |

### Address book (any authenticated user)
| Method | Path | Notes |
|---|---|---|
| GET | `/addresses` | `Address[]` (default first) |
| POST | `/addresses` | `AddressPayload` -> `Address` (first address becomes default) |
| PATCH | `/addresses/:id` | partial `AddressPayload` |
| DELETE | `/addresses/:id` | `{ ok: true }` (another address is promoted to default) |
| POST | `/addresses/:id/default` | make default |

### Credit terms (net terms)
| Method | Path | Notes |
|---|---|---|
| GET | `/me/credit` | `CreditInfo & { openOrders, overdue }` – `{ approved, limit, used, available, termsDays }` for the buyer's company |
| GET | `/admin/companies/:id/credit` | `{ company, credit: CreditInfo, openOrders, overdue, settled }` |
| PATCH | `/admin/companies/:id/credit` | `{ creditApproved?, creditLimit?, creditTermsDays? }` (audited, staff notified on approve/suspend) |
| — | checkout with `paymentMethod: CREDIT` | allowed only when the buyer's company is `creditApproved` and `creditUsed + total <= creditLimit` (whole basket, re-checked inside the transaction). Orders get `paymentStatus UNPAID`, `dueDate = now + creditTermsDays`, and `Company.creditUsed` is incremented. `PATCH /orders/:id/payment { PAID }` (admin) and cancelling an unpaid credit order release the credit again; refunds on unpaid credit orders release the refunded amount |

### Reorder / buy again
| Method | Path | Notes |
|---|---|---|
| POST | `/orders/:id/reorder` | buyer's own order: adds each line (original quantity) to the cart using the original listing or, when it is gone/unpurchasable, the cheapest current offer for the same material -> `ReorderResult { cart, added, skipped: [{ orderItemId, name, quantity, reason }] }` |
| GET | `/orders/frequently-ordered?limit=20` | `FrequentlyOrderedItem[]`: top materials by quantity in the last 12 months with `orders`, `lastOrderedAt`, `lastUnitPrice` and the current `bestOffer` |

### Returns / RMA
| Method | Path | Notes |
|---|---|---|
| POST | `/orders/:id/returns` | buyer, order `IN_TRANSIT` or `DELIVERED` within 14 days of delivery: `ReturnPayload { reason: DAMAGED\|DEFECTIVE\|WRONG_ITEM\|NOT_AS_DESCRIBED\|EXCESS\|OTHER, details?, items: [{ orderItemId, quantity }] }` (quantities net of earlier returns) -> `ReturnRequest` with reference `RET-YYYY-nnnnnn`; supplier notified, order event recorded |
| GET | `/returns?status=&orderId=&page=` | `Paginated<ReturnRequest>` – buyer: own, supplier: company, admin: all |
| GET | `/returns/:id` | `ReturnRequest & { estimatedRefund }` |
| PATCH | `/returns/:id` | `ReturnUpdatePayload { status, resolution?, refundAmount? }`. Transitions: `REQUESTED -> APPROVED\|REJECTED\|CANCELLED`, `APPROVED -> RECEIVED\|REJECTED\|CANCELLED`, `RECEIVED -> REFUNDED`. Buyers may only `CANCELLED`. `RECEIVED` computes `refundAmount` (unit price × qty, minus pro-rata coupon discount, plus VAT; override may only lower it) and restocks the listing. `REFUNDED` (supplier or admin) records a `Payment` (`MANUAL`, `REFUNDED`, negative amount), sets the order `paymentStatus REFUNDED` when fully refunded, adds an order event and notifies the buyer |

### Recurring orders (role BUYER, company profile required)
| Method | Path | Notes |
|---|---|---|
| GET | `/recurring` | `RecurringOrder[]` with `lastOrder` |
| POST | `/recurring` | `RecurringOrderPayload { name, items: [{ listingId, quantity }], intervalDays 7..90, deliveryCity, deliveryAddress, contactPhone, paymentMethod: COD\|BANK_TRANSFER\|CREDIT, startAt? }` (lines validated against live offers; CREDIT requires approved terms). First run at `startAt` or now + interval |
| PATCH | `/recurring/:id` | `RecurringOrderUpdatePayload` – edit any field, `active: false` pauses, `active: true` resumes (a missed schedule is moved to the next future slot), `nextRunAt` reschedules |
| DELETE | `/recurring/:id` | `{ ok: true }` |
| POST | `/recurring/:id/run-now` | places the orders immediately -> `RecurringRunResult & { total, recurringOrder }` |
| — | scheduler | `runRecurringOrders(now)` (services/commerce.ts) creates one DIRECT order per supplier for every active due schedule exactly like checkout, skips lines no longer purchasable, sets `lastRunAt` / `lastOrderId` / `nextRunAt` and notifies the buyer (also on failure, e.g. credit exceeded) |

## Product discovery
Amazon-class search, browse and engagement on top of the shop. Offers everywhere (`bestOffer`, `offers[]`, cart) now carry `OfferPricing`: `salePrice` (live only: `saleEndsAt` null or in the future), `compareAtPrice` (list price while a sale is live), `effectivePrice` (what the buyer pays) and `tiers: [{ minQty, price }]` sorted by `minQty`. Product enrichment (`bestOffer`, `minPrice`, `avgPrice`, `isDeal`, price sorts/filters) uses effective prices. Shared types live in `packages/shared/src/marketplace.ts`.

### Search, suggestions & brands (public)
| Method | Path | Notes |
|---|---|---|
| GET | `/shop/products?q=&categoryId=&city=&brand=&minPrice=&maxPrice=&inStock=1&rating=4&sort=relevance|price_asc|price_desc|rating|newest|popular&spec.<key>=value&page=` | `ProductSearchResponse`: paginated products + `facets` (`attributes` from the category's `CategoryAttribute`s with per-value counts for SELECT/TEXT/BOOLEAN and `min`/`max` for NUMBER, `brands`, `price` range, `cities`, `total`, `truncated`, `fuzzy`). `spec.<key>` matches `Material.specs` exactly (case-insensitive; repeat or comma-separate for OR), NUMBER keys accept `min..max`, `10..`, `..50`. `brand` may be comma separated; `rating` (alias `minRating`) is a >= filter. Filters and facet counts run in memory over a candidate set bounded to 5000 rows (`facets.truncated` flags the bound). When the exact ILIKE search returns fewer than 3 rows, pg_trgm similarity results are mixed in (`facets.fuzzy = true`), e.g. `q=cemnt` finds cement |
| GET | `/shop/suggest?q=` | `ShopSuggestions`: up to 8 products `{ id, name, nameAr, sku, imageUrl, categoryName }` (prefix, then contains, then trigram fallback), up to 4 categories and 4 brands |
| GET | `/shop/brands` | `BrandSummary[]`: `{ brand, productCount, imageUrl }` ordered by product count |
| GET | `/shop/brands/:brand?page=&city=` | Paginated products of a brand (case-insensitive) + `brand: BrandSummary`; 404 when unknown |
| GET | `/shop/products/:id?city=` | Now also returns `attributes` (`CategoryAttribute[]` for the spec table, category + parent), `reviewSummary { average, count, distribution }`, `questionsCount` and `frequentlyBoughtTogether` (top 6 materials co-ordered with it, padded with popular same-category items). Records `RecentlyViewed` for a logged-in user (last 50 kept) |
| GET | `/shop/recommendations?city=` | `{ basis: "recently_viewed" | "popular", items: Product[] }`: logged in → popular items from the categories browsed recently (excluding already-viewed); public → popular |
| GET | `/shop/recently-viewed?city=` | Auth. Last 24 viewed products (`viewedAt` added), newest first |

### Category attributes (spec definitions)
| Method | Path | Notes |
|---|---|---|
| GET | `/categories/:slug/attributes` | Public. `CategoryAttribute[]` for the category (slug or id) plus inherited parent definitions |
| GET/POST | `/admin/categories/:id/attributes` | Admin. `POST CategoryAttributePayload { key, label, labelAr, type: TEXT|NUMBER|SELECT|BOOLEAN, unit?, options[], filterable, sortOrder }`; `key` unique per category, SELECT requires options. Audited |
| PATCH/DELETE | `/admin/attributes/:id` | Admin. Partial update / delete. Audited |

### Product reviews
| Method | Path | Notes |
|---|---|---|
| GET | `/shop/products/:id/reviews?sort=recent|helpful|rating&page=` | Public. `ProductReviewsResponse` (hidden excluded) + `summary: ProductReviewSummary` + `mine` (the caller's own review or null when signed in) |
| POST | `/shop/products/:id/reviews` | BUYER. `ProductReviewPayload { rating 1..5, title?, body?, images? }`; one review per user per product (409 otherwise); `verified = true` when the buyer has a non-cancelled order containing the product. Recomputes `Material.ratingAvg/ratingCount` |
| PATCH | `/shop/reviews/:id` | Author only: edit `rating/title/body/images` |
| POST | `/shop/reviews/:id/helpful` | Auth. One vote per user (`ReviewVote`); returns `{ id, helpful, voted }` |
| POST | `/supplier/reviews/:id/reply` | SUPPLIER whose company lists the product: `{ reply }` → `supplierReply`; the author is notified |
| GET | `/admin/product-reviews?hidden=&q=&rating=&page=` | Admin moderation list + `summary { average, total, hidden }` |
| PATCH/DELETE | `/admin/product-reviews/:id` | Admin. `PATCH { hidden }`; both recompute the product rating and are audited |

### Product Q&A
| Method | Path | Notes |
|---|---|---|
| GET | `/shop/products/:id/questions?page=` | Public. `Paginated<ProductQuestion>` (hidden excluded; answered first) |
| POST | `/shop/products/:id/questions` | Auth. `{ question }`; suppliers selling the product are notified |
| POST | `/shop/questions/:id/answer` | SUPPLIER selling the product or ADMIN. `{ answer }`; the asker is notified (in-app, push, email) |
| GET | `/admin/product-questions?hidden=&answered=&q=&page=` | Admin list |
| PATCH/DELETE | `/admin/product-questions/:id` | Admin. `PATCH { hidden }`; audited |

### Wishlists / project lists (auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/wishlists` | `Wishlist[]` with `itemCount`; auto-creates the default "Saved items" list |
| POST | `/wishlists` | `{ name }` (max 50 lists) |
| GET | `/wishlists/contains?materialId=` | `WishlistContains { materialId, wishlistIds, saved }` for the heart icon |
| GET | `/wishlists/:id?city=` | List with `items[]`, each `material` enriched with `bestOffer` |
| PATCH/DELETE | `/wishlists/:id` | Rename / delete (not the default list) |
| POST | `/wishlists/:id/items` | `WishlistItemPayload { materialId, listingId?, quantity?, note? }`; `:id` may be `default`; re-adding updates quantity/note |
| PATCH/DELETE | `/wishlists/:id/items/:itemId` | Update `listingId/quantity/note` / remove |
| POST | `/wishlists/:id/add-to-cart` | `{ city? }` → `WishlistAddToCartResult { added, skipped[{ materialId, reason }] }`: every item with a purchasable offer (its chosen `listingId` if still purchasable, else the best offer) is added to the cart with the same minQty/stock validation as `POST /cart/items` |

### Price alerts (auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/alerts` | `PriceAlert[]` with enriched `material` |
| POST | `/alerts` | `PriceAlertPayload { materialId, targetPrice?, notifyBackInStock?, city? }`; one alert per product per user (upsert re-activates) |
| DELETE | `/alerts/:id` | Remove |
| job | `runPriceAlerts()` (`services/marketplace.ts`) | Scheduled by the app: deactivates and notifies (`SYSTEM`, link to the product) when the best effective price in the alert's city is <= `targetPrice`, or when `notifyBackInStock` and a purchasable offer exists |

Migration `20260925140000_pg_trgm_search` enables `pg_trgm` and adds GIN trigram indexes on `Material.name`, `nameAr` and `brand`.
