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
* API keys work only on `/api/v1/integrations/*`, never carry the platform ADMIN role, and must not be sent together with a user `Authorization: Bearer` header (the request is rejected).
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

## 6. Payments (Moyasar + bank transfer)

MySupplier takes electronic payments through **Moyasar** (SAMA-licensed PSP, PCI-DSS level 1). Card data is
entered in Moyasar's hosted form and tokenised there – it never reaches MySupplier servers; the API only sees
payment ids, re-fetches each payment with the secret key and reconciles amount and currency against the order.

### 6.1 Account setup
1. Register at moyasar.com with the company's CR, VAT certificate and bank account (settlements are paid to this IBAN).
2. Dashboard → **API keys**: copy the **secret** and **publishable** keys of the *test* account first, later the *live* ones →
   `MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY`. Card payments switch on automatically when both are set
   (`GET /payments/config` → `cardPaymentsEnabled: true`).
3. Dashboard → **Webhooks** → add `https://<api-host>/api/v1/payments/webhook/moyasar` (exact path; the API is
   mounted under `/api/v1`). Subscribe to `payment_paid`, `payment_failed`, `payment_authorized`, `payment_captured`,
   `payment_refunded`, `payment_voided`. Copy the generated **secret token** → `MOYASAR_WEBHOOK_SECRET`. Moyasar
   sends it as `secret_token` in the JSON body; the API compares it in constant time and rejects everything else
   with 401. Deliveries are idempotent – retries of the same payment/status are no-ops.
4. Methods: `MOYASAR_METHODS="creditcard,applepay,stcpay"` (default). `creditcard` covers **mada**, Visa and
   Mastercard; remove `applepay` or `stcpay` to hide them. The web checkout, the `/pay/:orderId` page and the
   hosted mobile page all read the list from the API.
5. **Apple Pay**: enable it in the Moyasar dashboard (Apple Pay → add the web domain, e.g. `mysupplier.sa` and
   `www.mysupplier.sa`), download the *domain association file* and serve it unchanged at
   `https://<web-host>/.well-known/apple-developer-merchantid-domain-association` (put it in
   `apps/web/public/.well-known/`, no extension, served as plain text). Verify in the dashboard, then Apple Pay
   appears in the form on Safari/iOS. The hosted mobile page is served from the API host, so add that host too if
   you want Apple Pay inside the app's in-app browser.
6. Restart the API. `docs/API.md` lists the endpoints; the flow is: `POST /payments/:orderId/intent` →
   Moyasar form (`metadata.order_id`) → `on_completed`/callback → `POST /payments/:orderId/verify` (server re-fetch)
   → webhook (same sync) → order `paymentStatus: PAID`, buyer + supplier notified, `order.paid` ERP webhook.

### 6.2 Test cards (test keys only)
| Card | Number | Result |
|---|---|---|
| Visa | 4111 1111 1111 1111 | paid (3-D Secure page: choose *Success*) |
| Mastercard | 5105 1051 0510 5100 | paid |
| mada | 4464 0400 0000 0007 | paid (mada routing) |
| Any | 4000 0000 0000 0002 | declined (`failed`, source.message = *Declined*) |
Use any future expiry and any 3-digit CVC. STC Pay in test mode accepts any mobile number with OTP `1234`.
Refunds: `POST /payments/:orderId/refund` (full or partial) calls Moyasar and writes a `REFUNDED` ledger row; a
refund made in the Moyasar dashboard arrives through the webhook and does the same.

### 6.3 Bank transfer
Orders paid by bank transfer show the **supplier's** account (Company → bank name / IBAN / beneficiary; for the
house supplier this is the *MySupplier Direct* company profile) with the order reference to quote; when a supplier
has no IBAN the platform account from `BANK_NAME` / `BANK_IBAN` / `BANK_BENEFICIARY` is shown instead. The buyer
submits the transfer proof (`POST /orders/:id/payments/bank-transfer`: reference, amount, date, optional receipt
file) → a `SUBMITTED` row, the supplier team (or admins) is notified, and the supplier owner/manager or an admin
confirms with `PATCH /orders/:id/payment { paymentStatus: "PAID" }`. `/admin/payments` lists pending proofs with
the receipt and a confirm button.

### 6.4 Reconciliation
* Hourly job: gateway rows still `INITIATED`/`AUTHORIZED` after 1 h are re-fetched (lost webhook, closed tab);
  intents with no gateway payment after 24 h are marked `FAILED` (abandoned).
* Admin → Payments → **Reconcile** does the same for one row on demand (`POST /admin/payments/:id/reconcile`).
* Ledger states: `INITIATED → AUTHORIZED → CAPTURED/PAID → REFUNDED`, or `FAILED`; `SUBMITTED` = bank-transfer proof
  awaiting confirmation. A stale event never undoes a `PAID` record; amount or currency mismatches are stored as
  `FAILED` with the reason and never mark the order paid.

### 6.5 Go-live checklist
- [ ] Live keys set, test keys removed; `NODE_ENV=production`, `WEB_URL`/`API_URL` are the public HTTPS hosts (the
      callback URL is built from `WEB_URL`).
- [ ] Webhook URL points at the production API, secret set, a test payment shows `outcome: applied` in the API log.
- [ ] Apple Pay domain file served from the production web host and verified in the dashboard.
- [ ] `MOYASAR_METHODS` matches what the Moyasar account has enabled (mada requires the SAMA/mada activation on the
      Moyasar side; STC Pay requires the STC Pay merchant activation).
- [ ] PSP is SAMA-licensed (Moyasar is); card data never touches MySupplier servers – do not log request bodies
      of `/payments/*` or add card fields to any form. Our PCI scope is SAQ A (hosted form).
- [ ] Settlement IBAN in the Moyasar dashboard is the company account; refunds are funded from the Moyasar balance.
- [ ] Bank details (`BANK_*`) and every supplier's IBAN verified; invoices print them while unpaid.
- [ ] `/admin/payments` reviewed daily: pending bank transfers confirmed, INITIATED rows reconciled.

## 7. Idempotency and reliability notes
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

## 7. Carriers (shipping companies)

Shipments are booked, tracked, labelled and cancelled through carrier adapters in `apps/api/src/services/carriers/`.
Connecting a carrier is configuration only: set its environment variables on the API server and restart. The admin
page **Admin → Shipping → Carriers** shows each carrier's mode, which variables are set or missing, its webhook URL and a
**Test** button.

| Mode | When | Behaviour |
| --- | --- | --- |
| **Manual** | required env vars missing | Supplier types the tracking number; status is updated by hand or by the carrier webhook. Rate-card quoting still works. |
| **Sandbox** | env vars set + `CARRIER_SANDBOX=1` | Deterministic fake bookings (`SBX-<CARRIER>-…`), no network. Tracking walks BOOKED → PICKED_UP (2 min) → IN_TRANSIT (5) → OUT_FOR_DELIVERY (10) → DELIVERED (15). Label is a generated PDF. |
| **Live** | env vars set, sandbox off | Real carrier API. Point `<CARRIER>_API_URL` at the carrier's test host first, then at production. |

### 7.1 Environment variables

| Variable | Carrier | Required | Notes |
| --- | --- | --- | --- |
| `CARRIER_SANDBOX` | all | – | `1` = sandbox mode for every configured carrier (staging). |
| `CARRIER_POLL_LIMIT` | all | – | Open shipments refreshed per hourly poll (default 50). |
| `CARRIER_WEBHOOK_SECRET` | all | – | Legacy shared webhook token (`x-webhook-secret`), used when a carrier has no secret of its own. |
| `SMSA_API_KEY` | SMSA Express | yes | B2C REST `apikey` header. |
| `SMSA_API_URL` | SMSA | – | Default `https://ecomapis.smsaexpress.com`; SMSA provides a staging host for test keys. |
| `SMSA_CUSTOMER_CODE` | SMSA | – | Retail/customer id (`SMSARetailID`) when SMSA assigns one. |
| `SMSA_WEBHOOK_SECRET` | SMSA | – | Signature header `x-smsa-signature` (or `x-signature` / `x-webhook-token`). |
| `ARAMEX_USERNAME`, `ARAMEX_API_KEY` | Aramex | yes | Web-service user and password (`ClientInfo.UserName/Password`). |
| `ARAMEX_ACCOUNT_NUMBER`, `ARAMEX_ACCOUNT_PIN` | Aramex | yes | Account number and PIN. |
| `ARAMEX_ACCOUNT_ENTITY` | Aramex | – | Default `RUH`. `AccountCountryCode` is always `SA`. |
| `ARAMEX_API_URL` | Aramex | – | Default `https://ws.aramex.net/ShippingAPI.V2`; sandbox `https://ws.sbx.aramex.net/ShippingAPI.V2`. |
| `ARAMEX_WEBHOOK_SECRET` | Aramex | – | Signature header `x-aramex-signature`. |
| `SPL_API_KEY`, `SPL_CUSTOMER_ID` | Saudi Post SPL | yes | `x-api-key` and `x-customer-id` headers. |
| `SPL_API_URL`, `SPL_WEBHOOK_SECRET` | SPL | – | Gateway from onboarding; `x-spl-signature`. |
| `TRUKKER_API_KEY` / `TRELLA_API_KEY` | TruKKer / Trella | yes | Bearer token. |
| `TRUKKER_API_URL` / `TRELLA_API_URL` | TruKKer / Trella | – | Partner API base from onboarding (defaults in `trukker.ts` / `trella.ts`). |
| `TRUKKER_WEBHOOK_SECRET` / `TRELLA_WEBHOOK_SECRET` | TruKKer / Trella | – | `x-trukker-signature` / `x-trella-signature`. |

### 7.2 Per-carrier onboarding

**SMSA Express (parcels ≤ 70 kg)** – open a B2C e-commerce account with SMSA and request API access; SMSA issues an
`apikey` for staging and production. Set `SMSA_API_KEY` (+ `SMSA_API_URL` for staging). Booking calls
`POST /api/shipment/b2c/new` with `ContentDescription`, `ShipmentValue`, `CODAmount`, `Weight` (KG), `Parcels`,
`ConsigneeAddress`/`ShipperAddress` (`ContactName`, `ContactPhoneNumber`, `City`, `Country: "SA"`, `AddressLine1`); the
returned AWB is the tracking number and the base64 waybill is stored as the label. Tracking:
`GET /api/shipment/b2c/query/{awb}`; cancel: `POST /api/shipment/b2c/cancel`; label: `GET /api/shipment/b2c/label?awb=`.
Ask SMSA to push status updates to the webhook URL below with your secret.

**Aramex (parcels ≤ 70 kg)** – request Shipping API credentials from your Aramex account manager (username, password,
account number, PIN, entity). Set the five `ARAMEX_*` variables; use the `ws.sbx` host until certified. Booking uses
`CreateShipments` (domestic `DOM`/`OND`, prepaid, COD when the order is cash-on-delivery, label as URL), tracking
`TrackShipments`, label `PrintLabel`. Aramex has no cancel call: cancelling in MySupplier closes the shipment locally
and tells the supplier to cancel the waybill with Aramex. Tracking `UpdateCode`s are mapped in `aramex.ts`
(`SH014` = delivered etc.); unknown codes fall back to the description text – confirm the list with Aramex.

**Saudi Post | SPL (parcels ≤ 30 kg)** – business account at splonline.com.sa; SPL issues an API key and customer id
plus the gateway URL. Set `SPL_API_KEY`, `SPL_CUSTOMER_ID`, `SPL_API_URL`. The adapter uses a generic REST contract
(`POST /shipments`, `GET /shipments/{id}/tracking`, `POST /shipments/{id}/cancel`, `GET /shipments/{id}/label`) –
confirm field names with SPL onboarding and adjust `spl.ts` if your contract differs.

**TruKKer and Trella (heavy trucking, up to 40 t)** – shipper/partner API access from the marketplace's integration
team; set `<CARRIER>_API_KEY` and `<CARRIER>_API_URL`. A load is posted with pickup/dropoff stops, cargo weight/volume and
a truck type derived from the order weight (≤ 7 t dyna, ≤ 25 t flatbed, above that trailer). The load id is stored as
`externalId` and used for tracking/cancel; waybill/POD documents are returned as the "label" when the API has them.
Field names in `trucking.ts` are the common denominator of both partner APIs – **confirm them with carrier onboarding**.

### 7.3 Webhooks

Each carrier pushes status updates to `https://<api-host>/api/v1/shipping/webhooks/<carrier>` (`smsa`, `aramex`,
`spl`, `trukker`, `trella`; `supplier`/`other` accept pushes from a supplier's own TMS). Set `<CARRIER>_WEBHOOK_SECRET`
and give the carrier the same value. Requests are accepted when either:

* `x-signature` (or the carrier's own header) is the HMAC-SHA256 of the **raw request body** with the secret – hex or
  base64, optional `sha256=` prefix; or
* `x-webhook-token` carries the secret itself (for carriers that only support a static token).

Anything else is `401`. Payloads are parsed per carrier (SMSA `{ awb, Activity, Details, Location, Date }`, Aramex
`{ WaybillNumber, UpdateCode, UpdateDescription, UpdateLocation, UpdateDateTime }`, trucking/SPL
`{ id | tracking_number, status, description, location, timestamp }`); the generic
`{ trackingNumber, status, description?, location?, at? }` always works. Unknown tracking numbers return
`{ ignored: true }`; duplicates are harmless.

Besides webhooks the API polls open shipments (BOOKED → OUT_FOR_DELIVERY) of live/sandbox carriers once an hour
(`CARRIER_POLL_LIMIT` per run, oldest update first), and anyone with access to the order can press **Refresh tracking**
(`POST /shipments/:id/refresh`).

### 7.4 Sandbox test (staging)

1. Set `CARRIER_SANDBOX=1` and a dummy key for the carrier you want to exercise, e.g. `SMSA_API_KEY=sandbox`
   (`ARAMEX_*` needs all four account fields), restart the API.
2. **Admin → Shipping → Carriers**: the card shows *Sandbox*; press **Test** – it books, tracks, fetches a PDF label and
   cancels a throw-away shipment.
3. As a supplier open an order → **Create shipment**, pick the carrier (marked *Books online*) and leave the tracking
   number blank. The shipment gets an `SBX-…` tracking number and a **Download label** button.
4. Press **Refresh tracking** after a few minutes (or wait for the hourly poll) to watch the timeline advance; the buyer
   sees the same timeline with the ETA. **Cancel shipment** closes it.
5. Send a signed webhook to make sure the secret is wired:
   ```bash
   BODY='{"trackingNumber":"SBX-SMSA-…","status":"out_for_delivery","location":"Jeddah"}'
   SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SMSA_WEBHOOK_SECRET" | awk '{print $2}')
   curl -X POST https://<api-host>/api/v1/shipping/webhooks/smsa -H "content-type: application/json" -H "x-signature: $SIG" -d "$BODY"
   ```
6. Switch to live by removing `CARRIER_SANDBOX` and setting the real keys; shipments created in sandbox keep working
   (an `SBX-` reference never reaches a carrier API).

