# ERP integration guide

Connect any ERP – SAP (ECC / S/4HANA), Oracle Fusion Cloud, Microsoft Dynamics 365 Business Central, Odoo, Zoho
Inventory/Books or a custom system – to the MySupplier marketplace. The full OpenAPI 3.0 specification is in
[`docs/openapi.yaml`](./openapi.yaml) (import it into Postman, SAP CPI, Azure Logic Apps, Boomi, n8n, etc.).

Base URL: `https://api.mysupplier.sa/api/v1` (local: `http://localhost:4000/api/v1`). All examples below omit the prefix.

## 1. Connect

### 1.1 Create an API key
A company **owner or manager** creates keys in the dashboard (Integrations → API keys) or with the JWT API:

```http
POST /integrations/keys
Authorization: Bearer <user JWT>
Content-Type: application/json

{ "name": "SAP PRD", "scopes": ["catalog:read", "prices:write", "stock:write", "orders:read", "orders:write", "invoices:read"], "expiresAt": "2027-09-30T00:00:00Z" }
```

The response contains the plaintext key **once** (`msk_live_` + 32 characters). We only store a SHA-256 hash and the
first 12 characters (`prefix`) for display. Lost keys must be revoked (`POST /integrations/keys/:id/revoke`) and re-created.

Send the key on every call as `X-API-Key: msk_live_…` (or `Authorization: ApiKey msk_live_…`).

### 1.2 Test the connection
```bash
curl -H "X-API-Key: $KEY" https://api.mysupplier.sa/api/v1/integrations/v1/ping
```
```json
{ "ok": true, "company": { "id": "cmp_01", "name": "Eastern Steel Trading", "type": "SUPPLIER", "city": "Dammam" }, "keyName": "SAP PRD", "scopes": ["catalog:read", "prices:write"], "serverTime": "2026-09-25T09:12:44.000Z" }
```
Store `serverTime` – it is the safest watermark for incremental pulls (`since=`).

### 1.3 Scopes
| Scope | Allows |
|---|---|
| `catalog:read` | categories, materials (product master), best offers per SKU |
| `prices:write` | `PUT /integrations/v1/prices` (supplier) |
| `stock:write` | `PUT /integrations/v1/stock` (supplier) |
| `orders:read` | `GET /orders`, `GET /purchases` |
| `orders:write` | `PATCH /orders/:reference/status` (supplier) |
| `invoices:read` | `GET /invoices` |
| `rfqs:read` | `GET /rfqs` |
| `rfqs:write` | `POST /rfqs` (buyer), `POST /rfqs/:id/bids` (supplier) |
| `webhooks:manage` | manage webhook endpoints with the key instead of a login |

Give each system its own key with the minimum scopes. Keys are company scoped: a supplier key only sees the
supplier's listings and sales orders; a buyer key only sees purchases made by the company's users.

### 1.4 Limits and errors
* 600 requests / minute per key (`RateLimit-Limit`, `RateLimit-Remaining` headers; `429` when exceeded). Bulk endpoints take up to 1000 rows per call, so a 20 000-line price list is 20 calls.
* JSON bodies up to 2 MB.
* Errors are `{ "error": "message", "details": … }`. `401` = key problem (missing / malformed / revoked / expired), `403` = missing scope or wrong company type, `400` = validation (`details.fieldErrors`), `404` = not found or not yours, `409` = duplicate.

## 2. Sync patterns

### 2.1 Supplier: push prices and stock every N minutes
Run from the ERP scheduler (SAP background job, Odoo cron, BC job queue, Zoho Flow) every 15–60 minutes or on change:

```http
PUT /integrations/v1/prices
X-API-Key: msk_live_…

{ "rows": [
  { "sku": "CEM-OPC-50", "city": "Riyadh", "price": 15.75, "minQty": 100, "leadTimeDays": 1, "stock": 12000 },
  { "sku": "RB-12-G60",  "city": "Riyadh", "price": 2650,  "minQty": 1,   "leadTimeDays": 2, "validUntil": "2026-12-31" },
  { "sku": "RB-12-G60",  "city": "Dammam", "price": 2590,  "salePrice": 2550 }
] }
```
* A row is the price of one SKU in one delivery city. Send one row per city you serve.
* Prices are SAR per catalogue unit, **excluding VAT** (15 % is added at checkout).
* The response lists every row with `created` / `updated` / `error`; log the errors (unknown SKU, bad number) in the ERP and continue – the batch is never rolled back.
* Rows you stop sending are not deleted; send `"active": false` to pause an offer or `"stock": 0` to show it as out of stock.

Stock-only updates (cheaper, higher frequency):
```http
PUT /integrations/v1/stock
{ "rows": [ { "sku": "CEM-OPC-50", "city": "Riyadh", "stock": 11500 }, { "listingId": "lst_2", "stock": 0 } ] }
```
Each row is an absolute on-hand quantity (an `ADJUST` movement in the inventory ledger). Listings at or below the
company's low-stock threshold fire the `stock.low` webhook.

### 2.2 Supplier: pull orders by `since`
```http
GET /integrations/v1/orders?since=2026-09-25T09:12:44.000Z&pageSize=100
```
Orders are sorted by `updatedAt` ascending and `since` filters on `updatedAt`, so one loop catches **new orders and
status/payment changes**. Keep the last `serverTime` (or the last order's `updatedAt`) as the watermark and
de-duplicate on `reference` (ORD-2026-000123). Each order carries `poNumber` (buyer's PO), `buyer.company` (VAT and
CR numbers for the customer master), `shipTo`, line items with `sku`, and `einvoice.invoiceNumber` once issued.

Create the sales order in the ERP, then acknowledge:

### 2.3 Supplier: push status
```http
PATCH /integrations/v1/orders/ORD-2026-000123/status
{ "status": "CONFIRMED" }

PATCH /integrations/v1/orders/ORD-2026-000123/status
{ "status": "SHIPPED", "trackingNumber": "SMSA123456789", "carrierName": "SMSA", "note": "2 pallets" }

PATCH /integrations/v1/orders/ORD-2026-000123/status
{ "status": "DELIVERED" }
```
| ERP status | Marketplace status | Allowed from |
|---|---|---|
| `CONFIRMED` / `PROCESSING` | CONFIRMED | PENDING |
| `SHIPPED` / `IN_TRANSIT` | IN_TRANSIT | CONFIRMED |
| `DELIVERED` | DELIVERED | IN_TRANSIT |
| `CANCELLED` | CANCELLED | PENDING, CONFIRMED (reserved stock is released) |

Sending the current status again returns `changed: false` (safe to replay). Buyers are notified in-app / push / email
and every `order.status_changed` webhook subscriber is informed.

### 2.4 Buyer: pull purchases and invoices
```http
GET /integrations/v1/purchases?since=…          # orders placed by your company's users
GET /integrations/v1/invoices?side=purchases&since=…&includeXml=true
```
Invoices are ZATCA e-invoice records (`invoiceNumber`, `uuid`, hash chain, status) with the order totals; the UBL 2.1
XML can be embedded for archiving or AP automation. Suppliers pull the same endpoint with `side=sales`.

### 2.5 Buyer: create RFQs and read best offers
```http
GET  /integrations/v1/catalog/prices?sku=RB-12-G60,CEM-OPC-50&city=Riyadh   # cheapest active offers per SKU
POST /integrations/v1/rfqs                                                  # purchase requisition → RFQ
{ "title": "Tower B – steel", "deliveryCity": "Riyadh", "closesAt": "2026-10-05T12:00:00Z",
  "items": [ { "sku": "RB-12-G60", "quantity": 40 }, { "description": "Binding wire 1.2mm", "unit": "kg", "quantity": 500 } ] }
```
Bids arrive as `bid.received` webhooks (or poll `GET /integrations/v1/rfqs/:id`). Awarding is done by the buyer in
the dashboard (or `POST /bids/:id/accept` with a user JWT) and produces an order that appears in `/purchases`.

### 2.6 Supplier: bid on RFQs from the ERP
```http
GET  /integrations/v1/rfqs?city=Riyadh                       # open RFQs you can bid on (with myBid)
POST /integrations/v1/rfqs/RFQ-2026-000045/bids
{ "validUntil": "2026-10-12T00:00:00Z", "deliveryDays": 5, "items": [ { "rfqItemId": "rfqi_1", "unitPrice": 2590 } ] }
```

## 3. Webhooks (push to your ERP)

Register an https endpoint (JWT manager, or a key with `webhooks:manage`):
```http
POST /integrations/webhooks
{ "url": "https://erp.example.com/hooks/mysupplier", "events": ["order.created", "order.status_changed", "order.paid", "payment.refunded"], "description": "SAP PI inbound" }
```
The response contains the signing `secret` (`whsec_…`) **once**. Use `["*"]` to receive every event.
`POST /integrations/webhooks/:id/test` sends a `ping` immediately and returns the HTTP result;
`GET /integrations/webhooks/:id/deliveries` is the delivery log; `POST /integrations/deliveries/:id/retry` re-sends one.

| Event | Sent to | `data` |
|---|---|---|
| `order.created` | supplier + buyer company | `{ order }` |
| `order.status_changed` | supplier + buyer company | `{ order, previousStatus, note, trackingNumber }` |
| `order.paid` | supplier + buyer company | `{ order, payment }` |
| `order.cancelled` | supplier + buyer company | `{ order, previousStatus }` |
| `payment.refunded` | supplier + buyer company | `{ order, refund: { amount, reason, method } }` |
| `invoice.issued` | supplier + buyer company | `{ order, invoice }` |
| `rfq.created` | suppliers in the delivery city / listing the materials | `{ rfq }` |
| `bid.received` | buyer company | `{ bid, rfq }` |
| `bid.accepted` | winning supplier | `{ bid, rfq, order }` |
| `stock.low` | supplier | `{ threshold, listings[] }` |
| `return.requested` | supplier | `{ return, order }` |
| `ping` | the endpoint under test | `{ message }` |

### 3.1 Delivery format
```http
POST https://erp.example.com/hooks/mysupplier
Content-Type: application/json
User-Agent: MySupplier-Webhooks/1.0
X-MySupplier-Event: order.created
X-MySupplier-Delivery: dlv_01HZX…          # unique per delivery – de-duplicate on it
X-MySupplier-Timestamp: 1790326500          # unix seconds
X-MySupplier-Signature: sha256=3f1a…        # HMAC-SHA256(secret, timestamp + "." + rawBody)

{ "id": "dlv_01HZX…", "event": "order.created", "createdAt": "2026-09-25T09:15:00.000Z", "data": { "order": { … } } }
```
Reply with any **2xx within 10 seconds**. Do the ERP posting asynchronously (queue) if it may take longer.
Failures are retried after 1 min, 5 min, 30 min, 2 h and 12 h, then marked `FAILED` (visible in the log, retryable by hand).
The order of delivery is not guaranteed across events; compare `order.updatedAt` / `previousStatus` before applying.

### 3.2 Verify the signature – Node.js
```js
import crypto from "node:crypto";
import express from "express";

const app = express();
app.post("/hooks/mysupplier", express.raw({ type: "application/json" }), (req, res) => {
  const secret = process.env.MYSUPPLIER_WEBHOOK_SECRET;
  const ts = req.header("X-MySupplier-Timestamp");
  const sig = req.header("X-MySupplier-Signature") ?? "";
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(400).send("stale");
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${req.body}`).digest("hex");
  const ok = expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  if (!ok) return res.status(401).send("bad signature");

  const event = JSON.parse(req.body);          // { id, event, createdAt, data }
  if (alreadyProcessed(event.id)) return res.sendStatus(200);
  queue.push(event);                            // process asynchronously, answer fast
  res.sendStatus(202);
});
```
Important: verify against the **raw** body bytes, not a re-serialised object.

### 3.3 Verify the signature – Python
```python
import hmac, hashlib, json, time
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["MYSUPPLIER_WEBHOOK_SECRET"].encode()

@app.post("/hooks/mysupplier")
def hook():
    ts = request.headers.get("X-MySupplier-Timestamp", "")
    sig = request.headers.get("X-MySupplier-Signature", "")
    if abs(time.time() - float(ts or 0)) > 300:
        abort(400)
    expected = "sha256=" + hmac.new(SECRET, f"{ts}.".encode() + request.get_data(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        abort(401)
    event = json.loads(request.get_data())
    handle_async(event)          # event["event"], event["data"], event["id"]
    return "", 202
```

## 4. Field mapping

### 4.1 Product master → `PUT /integrations/v1/prices`
Our `sku` is the marketplace SKU (`GET /integrations/v1/catalog/materials`). Keep a cross-reference table in the ERP
(customer material number / vendor material info record) between your item code and our SKU.

| MySupplier | SAP (MARA/MAKT/MARM, VK11/A004-KONP) | Oracle Fusion (Item / Price List) | Dynamics 365 BC (Item / Sales Price) | Odoo (product.product / pricelist) | Zoho Inventory / Books |
|---|---|---|---|---|---|
| `sku` | `MARA-MATNR` (or `EINA-IDNLF` cross-ref) | `EgpSystemItems.ItemNumber` | `Item."No."` | `default_code` | `sku` |
| name (read only) | `MAKT-MAKTX` (SPRAS=EN) | `ItemDescription` | `Item.Description` | `name` | `name` |
| nameAr (read only) | `MAKT-MAKTX` (SPRAS=AR) | translated description | `Item Translation` | `name` (ar_001) | – |
| unit (read only) | `MARA-MEINS` | `PrimaryUOMCode` | `Item."Base Unit of Measure"` | `uom_id` | `unit` |
| `price` | `KONP-KBETR` (cond. type PR00/ZPR0, per `KONP-KPEIN`) | `PriceListItems.ListPrice` | `Sales Price."Unit Price"` | `pricelist item fixed_price` | `rate` / price list rate |
| `city` | `A004-VKORG/VTWEG` → plant `MARC-WERKS` → city | Price list name / inventory org | `Sales Price."Location Code"` | `pricelist name` / warehouse | warehouse name |
| `minQty` | `A004-KONP-KSTBM` scale from / `MARC-BSTMI` | `MinimumQuantity` | `Sales Price."Minimum Quantity"` | `min_quantity` | – |
| `leadTimeDays` | `MARC-PLIFZ` | `PlanningLeadTime` | `Item."Lead Time Calculation"` | `sale_delay` | lead time |
| `validUntil` | `A004-DATBI` | `EndDate` | `Sales Price."Ending Date"` | `date_end` | – |
| `stock` | `MARD-LABST` (unrestricted, per plant/SLoc) | `OnhandQuantity` | `Item.Inventory` (per location) | `qty_available` / `free_qty` | `available_stock` |
| `active` | `MARA-LVORM` = blank and `MVKE-VMSTA` sales status | `Item Status = Active` | `Item.Blocked = false` | `sale_ok` | `status = active` |

Materials are managed centrally; to add a product that is not in our catalogue use the supplier catalogue import
(`POST /supplier/catalog/import`, user JWT) or ask support.

### 4.2 Sales order ← `GET /integrations/v1/orders`
| MySupplier | SAP SD (VBAK/VBAP/VBPA) | Oracle Fusion Order Mgmt | Dynamics 365 BC Sales Header/Line | Odoo sale.order | Zoho salesorder |
|---|---|---|---|---|---|
| `reference` | `VBAK-BSTNK` / `VBKD-BSTKD` (customer PO no.) | `CustomerPONumber` / `SourceTransactionNumber` | `"External Document No."` | `client_order_ref` | `reference_number` |
| `poNumber` | `VBKD-BSTKD_E` (ship-to PO) | `CustomerPONumber` | `"Your Reference"` | `origin` | `reference_number` |
| `buyer.company.name` | `KNA1-NAME1` (sold-to `VBPA PARVW=AG`) | `Customer.PartyName` | `"Sell-to Customer Name"` | `partner_id` | `customer_name` |
| `buyer.company.vatNumber` | `KNA1-STCEG` / `STCD1` | `TaxRegistrationNumber` | `"VAT Registration No."` | `vat` | `gst_no` / tax id |
| `buyer.company.crNumber` | `KNA1-STCD2` | `RegistryId` | `"Registration Number"` | `company_registry` | `cf_cr_number` |
| `shipTo.*` | `VBPA PARVW=WE` → `ADRC` | `ShipToAddress` | `"Ship-to Address"` fields | `partner_shipping_id` | `shipping_address` |
| `items[].sku` | `VBAP-MATNR` (via cross-ref) | `ProductNumber` | `Sales Line."No."` | `product_id` | `item_id` / `sku` |
| `items[].quantity` / `unit` | `VBAP-KWMENG` / `VRKME` | `OrderedQuantity` / `OrderedUOM` | `Quantity` / `"Unit of Measure Code"` | `product_uom_qty` / `product_uom` | `quantity` / `unit` |
| `items[].unitPrice` | `KONV-KBETR` (PR00) | `UnitSellingPrice` | `"Unit Price"` | `price_unit` | `rate` |
| `subtotal` / `vat` / `total` | `VBAK-NETWR` / `MWSBK` / net+tax | `TotalAmount` | `Amount` / `"Amount Including VAT"` | `amount_untaxed` / `amount_tax` / `amount_total` | `sub_total` / `tax_total` / `total` |
| `deliveryFee` | condition `HD00` | freight charge line | `Item Charge` | delivery line (`is_delivery`) | `shipping_charge` |
| `discount` | condition `RA00`/`K007` | `DiscountAmount` | `"Line Discount Amount"` | `discount` | `discount` |
| `paymentMethod` | `VBKD-ZTERM` (COD/credit terms) | `PaymentTerms` | `"Payment Terms Code"` | `payment_term_id` | `payment_terms` |
| `status` → ERP | `VBUK-GBSTK` overall status | `StatusCode` | `Status` (Open/Released/Shipped) | `state` (sale/done/cancel) | `status` |
| `einvoice.invoiceNumber` | `VBRK-VBELN` (external no. `XBLNR`) | `TransactionNumber` | `Sales Invoice."No."` | `account.move.name` | `invoice_number` |

Status back to us (§2.3): SAP delivery `LIKP` PGI (`WBSTK = C`) → `SHIPPED`, proof of delivery → `DELIVERED`.
Oracle: shipment confirmed → `SHIPPED`. BC: posted shipment → `SHIPPED`. Odoo: `stock.picking` done → `SHIPPED`/`DELIVERED`.

### 4.3 Purchase side (buyer ERP) ← `GET /integrations/v1/purchases`
Map the same order fields onto `EKKO/EKPO` (SAP purchase order, vendor = `supplier.crNumber`/`vatNumber`),
Oracle `PurchaseOrder`, BC `Purchase Header`, Odoo `purchase.order`, Zoho `purchaseorder`. `einvoice` gives the
ZATCA-compliant supplier invoice for 3-way matching; `shipments[].trackingNumber` feeds inbound delivery monitoring.

### 4.4 RFQ ↔ ERP
| MySupplier RFQ | SAP MM | Oracle Fusion Sourcing | Dynamics 365 BC | Odoo |
|---|---|---|---|---|
| `POST /rfqs` from | `EBAN` purchase requisition / `EKKO BSTYP=A` RFQ | Negotiation / requisition | Purchase Quote | `purchase.order` state `draft` (RFQ) |
| `bid` → | `EKKO BSTYP=A` quotation (`ME47`) / vendor quotation | Supplier response | Purchase Quote lines | `purchase.order` from vendor |
| `bid.accepted` → | `ME21N` PO from quotation | Award → PO | Make Order | `button_confirm` |

## 5. CSV import formats

If your ERP exports files rather than calling APIs, convert the CSV to the JSON rows above (one API call per 1000
lines). Headers are matched case-insensitively; dates ISO `YYYY-MM-DD`; decimal point `.`; UTF-8.

**Prices** (`prices.csv`)
```csv
sku,city,price,minQty,leadTimeDays,validUntil,salePrice,stock,active
CEM-OPC-50,Riyadh,15.75,100,1,2026-12-31,,12000,true
RB-12-G60,Riyadh,2650,1,2,,,,true
RB-12-G60,Dammam,2590,1,1,,2550,300,true
```
**Stock** (`stock.csv`)
```csv
sku,city,stock
CEM-OPC-50,Riyadh,11500
RB-12-G60,Dammam,0
```
**Order status** (`status.csv` – one PATCH per line)
```csv
reference,status,trackingNumber,carrierName,note
ORD-2026-000123,SHIPPED,SMSA123456789,SMSA,2 pallets
ORD-2026-000124,CONFIRMED,,,
```
The supplier dashboard also accepts the price file directly (Catalogue → Import), and the AI importer
(`POST /imports`) reads unstructured PDF/XLSX price lists.

## 6. Idempotency and reliability notes
* **Prices / stock** are upserts keyed on `(sku, city)` per company – replaying a file is harmless. Send the full
  current list; rows are only changed when present.
* **Status** pushes are idempotent: repeating the current status returns `changed: false`; invalid transitions return
  `400` and should be logged, not retried blindly (fix the ERP state first).
* **Order pull**: use `since` on `updatedAt` plus de-duplication on `reference`; process pages until `data` is empty.
  Overlap the watermark by a minute to survive clock skew.
* **Webhooks**: de-duplicate on `X-MySupplier-Delivery` / `id`; retries reuse the same id. Treat webhooks as a
  trigger and confirm state with a `GET` if your process is sensitive to ordering.
* **Money**: SAR, 2 decimals, prices exclude VAT; `vat` and `total` on orders are authoritative for invoicing.
* **Time**: all timestamps are UTC ISO-8601; convert to Asia/Riyadh in the ERP presentation layer.
* **Keys**: rotate by creating a new key, switching the ERP, then revoking the old one. Set `expiresAt` for
  project/consultant keys. Every key action is in the audit log.
