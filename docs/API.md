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

Orders (`/orders`) now return `OrderExtended` (with `type`, `items`, `subtotal`, `vat`, `deliveryFee`, `paymentStatus`, delivery details). Suppliers can `PATCH /orders/:id/status`; `PATCH /orders/:id/payment { paymentStatus }` is supplier/admin.

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
