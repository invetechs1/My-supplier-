# API reference (v1)

Base URL: `/api/v1`. Auth: `Authorization: Bearer <token>` from `/auth/login` or `/auth/register`. Interactive docs at `/docs`.

## Auth
| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /auth/register | public | `{email,password,full_name,role: buyer|supplier,company_name,city,phone,cr_number,category_ids}` → token + user |
| POST | /auth/login | public | `{email,password}` |
| GET / PATCH | /auth/me | any | profile |
| POST | /auth/change-password | any | |

## Catalog & market (public)
| Method | Path | Notes |
|---|---|---|
| GET | /catalog/categories | tree with product counts |
| GET | /catalog/products | `q, category_id, city, brand, sort=relevance|price_asc|price_desc|offers, page, size, only_with_offers` → items with `summary` |
| GET | /catalog/products/{id} | offers sorted by ex-VAT price, 90-day history, related |
| GET | /catalog/compare?ids=1,2,3 | side-by-side |
| GET | /catalog/brands · /catalog/cities | filter values |
| POST/PUT | /catalog/products | supplier/admin create or edit canonical products |
| GET/POST/DELETE | /catalog/alerts | price watchlist (auth) |
| GET | /market/stats · /market/index · /market/trending | landing-page stats, category index, biggest moves |

## Suppliers
| Method | Path | Who |
|---|---|---|
| GET | /suppliers · /suppliers/{id} · /suppliers/{id}/offers | public |
| GET/PUT | /suppliers/me | supplier |
| GET | /suppliers/me/dashboard | supplier KPIs |
| GET/POST | /suppliers/me/offers | list / upsert (product_id + city unique) |
| PATCH/DELETE | /suppliers/me/offers/{id} | |
| POST | /suppliers/me/offers/import | multipart CSV/JSON — columns: `sku, product_name, name_ar, category, unit, price, city, min_qty, includes_vat, stock_status, notes` |

## RFQ & bids
| Method | Path | Who |
|---|---|---|
| POST | /rfq | buyer — `{title, city, delivery_address, needed_by, closes_at, visibility, invited_supplier_ids, items:[{product_id|description, quantity, unit, target_price}], publish}` |
| GET | /rfq/mine | buyer |
| GET | /rfq/open | supplier — public RFQs matching its categories + invitations (`only_matching=false` for all) |
| GET | /rfq/{id} | owner sees ranked bids; supplier sees items + `my_bid` only |
| POST | /rfq/{id}/publish · /close | buyer |
| POST | /rfq/{id}/bids | supplier — `{items:[{rfq_item_id, unit_price, quantity?, brand}], delivery_days, delivery_fee, valid_until, payment_terms, notes}`; resubmitting replaces |
| POST | /rfq/{id}/bids/{bid_id}/withdraw | supplier |
| POST | /rfq/{id}/award/{bid_id} | buyer → creates order, rejects other bids, notifies |
| GET | /rfq/bids/mine | supplier |

## Orders
| Method | Path | Who |
|---|---|---|
| POST | /orders/direct | buyer — `{offer_id, quantity, delivery_address}` (registered suppliers only) |
| GET | /orders/mine · /orders/supplier · /orders/{id} | |
| PATCH | /orders/{id}/status | supplier: confirmed → in_delivery → delivered / cancelled; buyer: cancelled (pending only) |
| POST | /orders/{id}/review | buyer, delivered orders — `{rating 1-5, comment}` |

## Notifications
`GET /notifications?unread_only=`, `GET /notifications/unread-count`, `POST /notifications/read-all`, `POST /notifications/{id}/read`.

## Admin (role=admin)
`GET /admin/dashboard` · `GET/PATCH /admin/users` · `GET /admin/suppliers?verified=` · `POST /admin/suppliers/{id}/verify?verified=&plan=` · `POST/PUT /admin/categories` · `DELETE /admin/products/{id}` (deactivate) · `GET /admin/price-alerts` (stale + outliers) · `GET/POST/DELETE /admin/sources` · `POST /admin/sources/{id}/fetch` · `POST /admin/sources/{id}/upload` · `GET /admin/audit`.
