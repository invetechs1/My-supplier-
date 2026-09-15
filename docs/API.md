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

## Auth
| POST | `/auth/register` | body `RegisterPayload` -> `AuthResponse` (SUPPLIER must include `company`) |
| POST | `/auth/login` | body `LoginPayload` -> `AuthResponse` |
| GET | `/auth/me` | `User` (company embedded) |
| PATCH | `/auth/me` | `{ name?, phone?, locale? }` -> `User` |

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
| POST | `/supplier/prices` | `UpsertPricePayload` -> `PriceListing` (upsert on materialId+city) |
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
| POST | `/admin/materials` | `{ sku, name, nameAr, unit, categoryId, brand?, specs?, description? }` |
| PATCH | `/admin/materials/:id` | partial material |
| DELETE | `/admin/materials/:id` | `{ ok: true }` |
| POST | `/admin/prices/import` | `{ sourceName, items: Array<{ sku, price, city, minQty?, leadTimeDays? }> }` -> imports MARKET listings from external price sources |

## Demo accounts (seed)
| Role | Email | Password |
|---|---|---|
| Admin | admin@mysupplier.sa | Admin123! |
| Buyer | buyer@mysupplier.sa | Buyer123! |
| Supplier | supplier@mysupplier.sa | Supplier123! |
