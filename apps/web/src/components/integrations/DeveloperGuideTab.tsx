"use client";

import React, { useMemo, useState } from "react";
import { API_SCOPES, WEBHOOK_EVENTS } from "@mysupplier/shared";
import { INTEGRATION_API_URL } from "@/lib/api/integrations";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { CodeBlock, EVENT_META, INTEGRATIONS_GUIDE_URL, Mono, OPENAPI_RAW_URL, OPENAPI_URL, SCOPE_META, Tabs, relevantTo, scopeTone, type Perspective } from "./shared";

type Method = "GET" | "POST" | "PUT" | "PATCH";
type Language = "curl" | "node" | "python";

interface Sample {
  id: string;
  title: string;
  method: Method;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  scope: string;
  note: string;
}

const SUPPLIER_SAMPLES: Sample[] = [
  {
    id: "prices",
    title: "Push prices",
    method: "PUT",
    path: "/prices",
    scope: "prices:write",
    body: { rows: [
      { sku: "CEM-OPC-50", city: "Riyadh", price: 15.75, minQty: 100, leadTimeDays: 1, stock: 12000 },
      { sku: "RB-12-G60", city: "Riyadh", price: 2650, minQty: 1, leadTimeDays: 2, validUntil: "2026-12-31" },
      { sku: "RB-12-G60", city: "Dammam", price: 2590, salePrice: 2550 },
    ] },
    note: "One row = one SKU in one delivery city, SAR excluding VAT. Upsert on (sku, city); up to 1000 rows per call; each row gets its own created / updated / error result and the batch is never rolled back.",
  },
  {
    id: "stock",
    title: "Push stock",
    method: "PUT",
    path: "/stock",
    scope: "stock:write",
    body: { rows: [{ sku: "CEM-OPC-50", city: "Riyadh", stock: 11500 }, { listingId: "lst_2", stock: 0 }] },
    note: "Absolute on-hand quantities (recorded as ADJUST movements). Cheaper than a full price push, so run it more often. Listings at or below your low-stock threshold fire stock.low.",
  },
  {
    id: "orders",
    title: "Pull orders since…",
    method: "GET",
    path: "/orders",
    query: { since: "2026-09-25T09:12:44.000Z", pageSize: "100" },
    scope: "orders:read",
    note: "Sorted by updatedAt ascending and filtered on updatedAt, so one loop catches new orders and status / payment changes. Keep the last serverTime (from /ping) as the watermark and de-duplicate on reference.",
  },
  {
    id: "status",
    title: "Push order status",
    method: "PATCH",
    path: "/orders/ORD-2026-000123/status",
    scope: "orders:write",
    body: { status: "SHIPPED", trackingNumber: "SMSA123456789", carrierName: "SMSA", note: "2 pallets" },
    note: "Transitions: PENDING → CONFIRMED | CANCELLED, CONFIRMED → IN_TRANSIT | CANCELLED, IN_TRANSIT → DELIVERED. Aliases PROCESSING = CONFIRMED, SHIPPED = IN_TRANSIT. Re-sending the current status returns changed: false.",
  },
];

const BUYER_SAMPLES: Sample[] = [
  {
    id: "catalog-prices",
    title: "Best offers per SKU",
    method: "GET",
    path: "/catalog/prices",
    query: { sku: "RB-12-G60,CEM-OPC-50", city: "Riyadh" },
    scope: "catalog:read",
    note: "Cheapest active offers per SKU (max 50 SKUs per call, limit up to 20 offers each). Use it to price purchase requisitions before raising an RFQ or an order.",
  },
  {
    id: "rfq",
    title: "Create an RFQ",
    method: "POST",
    path: "/rfqs",
    scope: "rfqs:write",
    body: {
      title: "Tower B – structural steel, phase 2",
      deliveryCity: "Riyadh",
      deliveryAddress: "King Fahd Rd, site gate 3",
      deliveryDate: "2026-10-20",
      closesAt: "2026-10-05T12:00:00Z",
      items: [{ sku: "RB-12-G60", quantity: 40 }, { description: "Binding wire 1.2mm", unit: "kg", quantity: 500 }],
    },
    note: "Items may reference a catalogue sku (description and unit are then optional) or be free text. Bids arrive as bid.received webhooks or by polling GET /rfqs/:id. Awarding is done in the dashboard.",
  },
  {
    id: "purchases",
    title: "Pull purchases since…",
    method: "GET",
    path: "/purchases",
    query: { since: "2026-09-25T09:12:44.000Z", pageSize: "100" },
    scope: "orders:read",
    note: "Orders placed by your company's users, in the ERP shape (supplier company with VAT / CR numbers, items with sku, totals, shipments, e-invoice ids). Same since / paging pattern as the supplier order pull.",
  },
  {
    id: "invoices",
    title: "Pull invoices",
    method: "GET",
    path: "/invoices",
    query: { side: "purchases", since: "2026-09-01T00:00:00.000Z", includeXml: "true" },
    scope: "invoices:read",
    note: "ZATCA e-invoice records (invoiceNumber, uuid, hash chain, status) with the order totals. includeXml=true embeds the UBL 2.1 XML for archiving or AP automation / 3-way matching.",
  },
];

// ---------------------------------------------------------------------------
// Code generators
// ---------------------------------------------------------------------------
function sampleUrl(s: Sample): string {
  const qs = s.query ? `?${new URLSearchParams(s.query).toString()}` : "";
  return `${INTEGRATION_API_URL}${s.path}${qs}`;
}

function toPythonLiteral(value: unknown, indent = 0): string {
  const pad = "    ".repeat(indent);
  const padIn = "    ".repeat(indent + 1);
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((v) => `${padIn}${toPythonLiteral(v, indent + 1)}`).join(",\n")},\n${pad}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, v]) => `${padIn}${JSON.stringify(k)}: ${toPythonLiteral(v, indent + 1)}`).join(",\n")},\n${pad}}`;
}

function toCurl(s: Sample): string {
  const lines = [`curl -X ${s.method} "${sampleUrl(s)}" \\`, `  -H "X-API-Key: $MYSUPPLIER_API_KEY"`];
  if (s.body !== undefined) {
    lines[lines.length - 1] += " \\";
    lines.push(`  -H "Content-Type: application/json" \\`);
    lines.push(`  -d '${JSON.stringify(s.body)}'`);
  }
  return lines.join("\n");
}

function toNode(s: Sample): string {
  const headers = s.body !== undefined ? `{ "X-API-Key": process.env.MYSUPPLIER_API_KEY, "Content-Type": "application/json" }` : `{ "X-API-Key": process.env.MYSUPPLIER_API_KEY }`;
  const body = s.body !== undefined ? `\n  body: JSON.stringify(${JSON.stringify(s.body, null, 2).replace(/\n/g, "\n  ")}),` : "";
  return `// Node 18+ (built-in fetch)
const res = await fetch("${sampleUrl(s)}", {
  method: "${s.method}",
  headers: ${headers},${body}
});
if (!res.ok) throw new Error(\`MySupplier \${res.status}: \${await res.text()}\`);
const data = await res.json();
console.log(data);`;
}

function toPython(s: Sample): string {
  const fn = s.method.toLowerCase();
  const json = s.body !== undefined ? `\n    json=${toPythonLiteral(s.body, 1)},` : "";
  return `import os
import requests

res = requests.${fn}(
    "${sampleUrl(s)}",
    headers={"X-API-Key": os.environ["MYSUPPLIER_API_KEY"]},${json}
    timeout=30,
)
res.raise_for_status()
data = res.json()
print(data)`;
}

const LANGUAGES: Array<{ key: Language; label: string; title: string }> = [
  { key: "curl", label: "curl", title: "bash" },
  { key: "node", label: "Node.js", title: "javascript" },
  { key: "python", label: "Python", title: "python" },
];

// Copied verbatim from docs/INTEGRATIONS.md §3.2 / §3.3.
const NODE_VERIFY = `import crypto from "node:crypto";
import express from "express";

const app = express();
app.post("/hooks/mysupplier", express.raw({ type: "application/json" }), (req, res) => {
  const secret = process.env.MYSUPPLIER_WEBHOOK_SECRET;
  const ts = req.header("X-MySupplier-Timestamp");
  const sig = req.header("X-MySupplier-Signature") ?? "";
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(400).send("stale");
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(\`\${ts}.\${req.body}\`).digest("hex");
  const ok = expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  if (!ok) return res.status(401).send("bad signature");

  const event = JSON.parse(req.body);          // { id, event, createdAt, data }
  if (alreadyProcessed(event.id)) return res.sendStatus(200);
  queue.push(event);                            // process asynchronously, answer fast
  res.sendStatus(202);
});`;

const PYTHON_VERIFY = `import hmac, hashlib, json, time
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
    return "", 202`;

// ---------------------------------------------------------------------------
// Field mapping summary (docs/INTEGRATIONS.md §4)
// ---------------------------------------------------------------------------
interface MappingRow {
  field: string;
  sap: string;
  oracle: string;
  dynamics: string;
  odoo: string;
}

const SUPPLIER_MAPPING: MappingRow[] = [
  { field: "sku", sap: "MARA-MATNR (or EINA-IDNLF cross-ref)", oracle: "EgpSystemItems.ItemNumber", dynamics: 'Item."No."', odoo: "default_code" },
  { field: "price", sap: "KONP-KBETR (PR00/ZPR0)", oracle: "PriceListItems.ListPrice", dynamics: 'Sales Price."Unit Price"', odoo: "pricelist item fixed_price" },
  { field: "city", sap: "A004-VKORG/VTWEG → plant MARC-WERKS → city", oracle: "Price list name / inventory org", dynamics: 'Sales Price."Location Code"', odoo: "pricelist name / warehouse" },
  { field: "minQty", sap: "KONP-KSTBM scale / MARC-BSTMI", oracle: "MinimumQuantity", dynamics: 'Sales Price."Minimum Quantity"', odoo: "min_quantity" },
  { field: "leadTimeDays", sap: "MARC-PLIFZ", oracle: "PlanningLeadTime", dynamics: 'Item."Lead Time Calculation"', odoo: "sale_delay" },
  { field: "stock", sap: "MARD-LABST (per plant / SLoc)", oracle: "OnhandQuantity", dynamics: "Item.Inventory (per location)", odoo: "qty_available / free_qty" },
  { field: "order.reference", sap: "VBAK-BSTNK / VBKD-BSTKD", oracle: "CustomerPONumber", dynamics: '"External Document No."', odoo: "client_order_ref" },
  { field: "order.buyer.company.vatNumber", sap: "KNA1-STCEG / STCD1", oracle: "TaxRegistrationNumber", dynamics: '"VAT Registration No."', odoo: "vat" },
  { field: "order.items[].sku / quantity", sap: "VBAP-MATNR / KWMENG", oracle: "ProductNumber / OrderedQuantity", dynamics: 'Sales Line."No." / Quantity', odoo: "product_id / product_uom_qty" },
  { field: "status → ERP", sap: "LIKP PGI (WBSTK = C) → SHIPPED", oracle: "Shipment confirmed → SHIPPED", dynamics: "Posted shipment → SHIPPED", odoo: "stock.picking done → SHIPPED / DELIVERED" },
];

const BUYER_MAPPING: MappingRow[] = [
  { field: "purchase.reference", sap: "EKKO-EBELN (PO) / EKKO-IHREZ", oracle: "PurchaseOrder.OrderNumber", dynamics: 'Purchase Header."No."', odoo: "purchase.order name" },
  { field: "purchase.poNumber", sap: "EKKO-UNSEZ (our reference)", oracle: "CustomerPONumber", dynamics: '"Vendor Order No."', odoo: "partner_ref" },
  { field: "supplier.company.vatNumber / crNumber", sap: "LFA1-STCEG / STCD2 (vendor master)", oracle: "Supplier.TaxRegistrationNumber", dynamics: 'Vendor."VAT Registration No."', odoo: "res.partner vat / company_registry" },
  { field: "items[].sku / quantity / unitPrice", sap: "EKPO-MATNR / MENGE / NETPR", oracle: "ItemNumber / Quantity / Price", dynamics: 'Purchase Line."No." / Quantity / "Direct Unit Cost"', odoo: "product_id / product_qty / price_unit" },
  { field: "subtotal / vat / total", sap: "EKPO-NETWR / tax code MWSKZ", oracle: "TotalAmount", dynamics: 'Amount / "Amount Including VAT"', odoo: "amount_untaxed / amount_tax / amount_total" },
  { field: "einvoice.invoiceNumber", sap: "RBKP-XBLNR (MIRO reference)", oracle: "Invoice.InvoiceNumber", dynamics: 'Purchase Invoice."Vendor Invoice No."', odoo: "account.move ref" },
  { field: "shipments[].trackingNumber", sap: "Inbound delivery LIKP-LIFEX", oracle: "ASN / ShipmentNumber", dynamics: '"Package Tracking No."', odoo: "stock.picking carrier_tracking_ref" },
  { field: "POST /rfqs from", sap: "EBAN requisition / EKKO BSTYP=A", oracle: "Negotiation / requisition", dynamics: "Purchase Quote", odoo: "purchase.order state draft (RFQ)" },
  { field: "bid.accepted →", sap: "ME21N PO from quotation", oracle: "Award → PO", dynamics: "Make Order", odoo: "button_confirm" },
];

// ---------------------------------------------------------------------------
export function DeveloperGuideTab({ perspective }: { perspective: Perspective }) {
  const samples = perspective === "supplier" ? SUPPLIER_SAMPLES : BUYER_SAMPLES;
  const [sampleId, setSampleId] = useState(samples[0].id);
  const [language, setLanguage] = useState<Language>("curl");
  const [verifyLang, setVerifyLang] = useState<"node" | "python">("node");
  const sample = samples.find((s) => s.id === sampleId) ?? samples[0];
  const code = useMemo(() => (language === "curl" ? toCurl(sample) : language === "node" ? toNode(sample) : toPython(sample)), [sample, language]);
  const mapping = perspective === "supplier" ? SUPPLIER_MAPPING : BUYER_MAPPING;

  const steps = perspective === "supplier"
    ? [
        { title: "Create an API key", text: "In the API keys tab, with prices:write, stock:write, orders:read and orders:write. Store it in your ERP's credential vault." },
        { title: "Ping", text: "Call GET /ping with X-API-Key. It returns your company, the key's scopes and serverTime – the safest watermark for incremental pulls." },
        { title: "Map SKUs", text: "Pull GET /catalog/materials and keep a cross-reference between your item codes and our SKUs (customer material info record)." },
        { title: "Push prices and stock", text: "Schedule PUT /prices every 15–60 minutes (or on change) and PUT /stock more often. Log per-row errors in the ERP." },
        { title: "Pull orders and push status", text: "Poll GET /orders?since=<watermark> or subscribe to order.created webhooks; create the sales order, then PATCH the status as it ships." },
      ]
    : [
        { title: "Create an API key", text: "In the API keys tab, with catalog:read, orders:read, invoices:read, rfqs:read and rfqs:write. Store it in your procurement system's credential vault." },
        { title: "Ping", text: "Call GET /ping with X-API-Key. It returns your company, the key's scopes and serverTime – keep it as the watermark for incremental pulls." },
        { title: "Price requisitions", text: "GET /catalog/prices?sku=…&city=… returns the cheapest active offers per SKU for purchase requisitions." },
        { title: "Raise RFQs", text: "POST /rfqs from a purchase requisition; bids arrive as bid.received webhooks. Award in the dashboard – the resulting order shows up in /purchases." },
        { title: "Pull purchases and invoices", text: "Poll GET /purchases?since=… and GET /invoices?side=purchases for ZATCA e-invoices (UBL XML optional) to drive 3-way matching." },
      ];

  return (
    <div className="space-y-6">
      {/* Quick start */}
      <Card>
        <CardHeader title="Quick start" subtitle={`Connect ${perspective === "supplier" ? "your ERP as a supplier" : "your procurement system as a buyer"} in five steps.`} />
        <CardBody>
          <ol className="grid gap-3 md:grid-cols-5">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                <p className="mt-0.5 text-xs text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <a href={OPENAPI_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">OpenAPI 3.0 spec (docs/openapi.yaml)</a>
            <a href={OPENAPI_RAW_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Raw YAML for Postman / SAP CPI / Logic Apps</a>
            <a href={INTEGRATIONS_GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Full integration guide (docs/INTEGRATIONS.md)</a>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Limits: 600 requests / minute per key, 1000 rows per bulk call, JSON bodies up to 2 MB. Errors are <Mono>{'{ "error", "details" }'}</Mono>: 401 key problem, 403 missing scope or wrong company type, 400 validation, 404 not yours, 429 rate limited.
          </p>
        </CardBody>
      </Card>

      {/* Code samples */}
      <Card>
        <CardHeader title="Code samples" subtitle="The four calls most ERPs need first. Replace $MYSUPPLIER_API_KEY with a key from the API keys tab." />
        <CardBody className="space-y-3">
          <Tabs tabs={samples.map((s) => ({ key: s.id, label: <><span className="font-mono text-[11px] text-slate-400">{s.method}</span> {s.title}</> }))} value={sample.id} onChange={setSampleId} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="slate"><span dir="ltr" className="font-mono">{sample.method} {sample.path}</span></Badge>
            <Badge tone={scopeTone(sample.scope as (typeof API_SCOPES)[number])} title="Required scope"><span dir="ltr" className="font-mono">{sample.scope}</span></Badge>
            <Tabs tabs={LANGUAGES.map((l) => ({ key: l.key, label: l.label }))} value={language} onChange={setLanguage} size="sm" className="ms-auto" />
          </div>
          <CodeBlock title={LANGUAGES.find((l) => l.key === language)?.title} code={code} />
          <p className="text-xs text-slate-600">{sample.note}</p>
        </CardBody>
      </Card>

      {/* Webhook verification */}
      <Card>
        <CardHeader title="Verify webhook signatures" subtitle="Every delivery is signed: X-MySupplier-Signature = sha256=HMAC-SHA256(secret, timestamp + '.' + rawBody). Verify against the raw body bytes, reject stale timestamps, de-duplicate on the delivery id and answer 2xx within 10 seconds." action={<Tabs tabs={[{ key: "node", label: "Node.js (Express)" }, { key: "python", label: "Python (Flask)" }]} value={verifyLang} onChange={setVerifyLang} size="sm" />} />
        <CardBody className="space-y-3">
          <CodeBlock title={verifyLang === "node" ? "javascript" : "python"} code={verifyLang === "node" ? NODE_VERIFY : PYTHON_VERIFY} />
          <details className="rounded-xl border border-slate-200">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-700">Events reference</summary>
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-start text-slate-500">
                  <tr><th className="px-4 py-2 text-start font-semibold">Event</th><th className="px-4 py-2 text-start font-semibold">When</th><th className="px-4 py-2 text-start font-semibold">Sent to</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <tr key={ev} className={relevantTo(EVENT_META[ev].audience, perspective) ? "" : "text-slate-400"}>
                      <td className="px-4 py-1.5"><span dir="ltr" className="font-mono text-slate-800">{ev}</span></td>
                      <td className="px-4 py-1.5 text-slate-600">{EVENT_META[ev].description}</td>
                      <td className="px-4 py-1.5 text-slate-500">{EVENT_META[ev].sentTo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="rounded-xl border border-slate-200">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-700">Scopes reference</summary>
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr><th className="px-4 py-2 text-start font-semibold">Scope</th><th className="px-4 py-2 text-start font-semibold">Allows</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {API_SCOPES.map((s) => (
                    <tr key={s} className={relevantTo(SCOPE_META[s].audience, perspective) ? "" : "text-slate-400"}>
                      <td className="px-4 py-1.5"><span dir="ltr" className="font-mono text-slate-800">{s}</span></td>
                      <td className="px-4 py-1.5 text-slate-600">{SCOPE_META[s].description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </CardBody>
      </Card>

      {/* Field mapping */}
      <Card>
        <CardHeader title="Field mapping summary" subtitle={perspective === "supplier" ? "Where the price / stock rows and the pulled sales orders live in common ERPs. The full tables (incl. Zoho) are in INTEGRATIONS.md §4." : "Where pulled purchases, invoices and RFQs land in common ERPs. The full tables (incl. Zoho) are in INTEGRATIONS.md §4."} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-2 text-start font-semibold">MySupplier</th>
                <th className="whitespace-nowrap px-4 py-2 text-start font-semibold">SAP</th>
                <th className="whitespace-nowrap px-4 py-2 text-start font-semibold">Oracle Fusion</th>
                <th className="whitespace-nowrap px-4 py-2 text-start font-semibold">Dynamics 365 BC</th>
                <th className="whitespace-nowrap px-4 py-2 text-start font-semibold">Odoo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mapping.map((r) => (
                <tr key={r.field}>
                  <td className="px-4 py-2"><span dir="ltr" className="font-mono text-slate-900">{r.field}</span></td>
                  <td dir="ltr" className="px-4 py-2 text-start text-slate-600">{r.sap}</td>
                  <td dir="ltr" className="px-4 py-2 text-start text-slate-600">{r.oracle}</td>
                  <td dir="ltr" className="px-4 py-2 text-start text-slate-600">{r.dynamics}</td>
                  <td dir="ltr" className="px-4 py-2 text-start text-slate-600">{r.odoo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="border-t border-slate-100 text-xs text-slate-500">
          Money is SAR with 2 decimals and prices exclude VAT (15 % is added at checkout); <Mono>vat</Mono> and <Mono>total</Mono> on orders are authoritative for invoicing. Timestamps are UTC ISO-8601 – convert to Asia/Riyadh in the ERP presentation layer.
        </CardBody>
      </Card>
    </div>
  );
}
