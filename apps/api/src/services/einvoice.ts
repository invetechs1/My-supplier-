/**
 * ZATCA phase-2 groundwork: UBL 2.1 simplified tax invoice XML, SHA-256 invoice hash chained to the
 * previous invoice (PIH), UUID and invoice counter (ICV), plus the phase-1 QR.
 *
 * What is still needed for full compliance (requires ZATCA onboarding credentials):
 *  - XAdES signature with the EGS certificate/private key (CSID) and the signed QR (tags 6–9)
 *  - Reporting/clearance calls to the Fatoora API (simplified invoices are *reported* within 24h)
 * The reporting client below is wired behind ZATCA_* env vars and returns PENDING_CONFIG until then.
 */
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { emitOrderWebhook } from "./webhooks";
import { env } from "../lib/env";
import { zatcaTlvBase64 } from "./zatca";

const esc = (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const money = (n: number) => n.toFixed(2);
const GENESIS_PIH = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ=="; // base64(sha256("0")) per ZATCA spec

type OrderForInvoice = Prisma.OrderGetPayload<{ include: { company: true; items: { include: { material: true } }; buyer: { include: { company: true } } } }>;

export function buildUblXml(o: OrderForInvoice, meta: { invoiceNumber: string; uuid: string; counter: number; previousHash: string; issuedAt: Date; qr: string }) {
  const vatRate = Math.round(env.vatRate * 100);
  const subtotal = Number(o.subtotal), fee = Number(o.deliveryFee), vat = Number(o.vat), total = Number(o.total);
  const taxable = subtotal + fee;
  const lines = [
    ...o.items.map((i, idx) => ({ id: idx + 1, name: i.name, qty: i.quantity, unit: i.unit, price: Number(i.unitPrice), amount: Number(i.lineTotal) })),
    ...(fee > 0 ? [{ id: o.items.length + 1, name: "Delivery", qty: 1, unit: "service", price: fee, amount: fee }] : []),
  ];
  const lineXml = lines.map((l) => `
  <cac:InvoiceLine>
    <cbc:ID>${l.id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(l.unit)}">${l.qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${money(l.amount)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${money(l.amount * env.vatRate)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="SAR">${money(l.amount * (1 + env.vatRate))}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${esc(l.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${vatRate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="SAR">${money(l.price)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`).join("");
  const d = meta.issuedAt;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${esc(meta.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${meta.uuid}</cbc:UUID>
  <cbc:IssueDate>${d.toISOString().slice(0, 10)}</cbc:IssueDate>
  <cbc:IssueTime>${d.toISOString().slice(11, 19)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${meta.counter}</cbc:UUID></cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${meta.previousHash}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${meta.qr}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(o.company.crNumber ?? "")}</cbc:ID></cac:PartyIdentification>
    <cac:PostalAddress><cbc:CityName>${esc(o.company.city)}</cbc:CityName><cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>${esc(o.company.vatNumber ?? env.seller.vatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${esc(o.company.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PostalAddress><cbc:CityName>${esc(o.deliveryCity ?? "")}</cbc:CityName><cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    ${o.buyer.company?.vatNumber ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(o.buyer.company.vatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
    <cac:PartyLegalEntity><cbc:RegistrationName>${esc(o.buyer.company?.name ?? o.buyer.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans><cbc:PaymentMeansCode>${o.paymentMethod === "CARD" ? "48" : o.paymentMethod === "BANK_TRANSFER" ? "42" : "10"}</cbc:PaymentMeansCode></cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${money(vat)}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">${money(taxable)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="SAR">${money(vat)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${vatRate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${money(vat)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${money(taxable)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${money(taxable)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${money(total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${money(total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lineXml}
</Invoice>`;
}

export const invoiceHash = (xml: string) => crypto.createHash("sha256").update(xml, "utf8").digest("base64");

/** Generates (once) the e-invoice record for an order. Serialised per process to keep the hash chain consistent. */
let chain: Promise<unknown> = Promise.resolve();
export function ensureEInvoice(orderId: string) {
  const run = chain.then(async () => {
    const existing = await prisma.eInvoiceRecord.findUnique({ where: { orderId } });
    if (existing) return existing;
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { company: true, items: { include: { material: true } }, buyer: { include: { company: true } } } });
    if (order.status === "CANCELLED" && order.paymentStatus !== "PAID") throw new Error("No invoice is issued for a cancelled, unpaid order");
    const last = await prisma.eInvoiceRecord.findFirst({ orderBy: { counter: "desc" } });
    const counter = (last?.counter ?? 0) + 1;
    const previousHash = last?.invoiceHash ?? GENESIS_PIH;
    const uuid = crypto.randomUUID();
    const invoiceNumber = `INV-${order.reference.replace(/^ORD-/, "")}`;
    const issuedAt = new Date();
    const total = Number(order.total), vat = Number(order.vat);
    const qr = zatcaTlvBase64({ sellerName: order.company.name, vatNumber: order.company.vatNumber ?? env.seller.vatNumber, timestamp: issuedAt, total, vat });
    const xml = buildUblXml(order, { invoiceNumber, uuid, counter, previousHash, issuedAt, qr });
    const rec = await prisma.eInvoiceRecord.create({ data: { orderId, invoiceNumber, uuid, counter, previousInvoiceHash: previousHash, invoiceHash: invoiceHash(xml), xml, status: "GENERATED" } });
    void emitOrderWebhook("invoice.issued", orderId, { invoice: { id: rec.id, invoiceNumber: rec.invoiceNumber, uuid: rec.uuid, invoiceHash: rec.invoiceHash, issuedAt } });
    return rec;
  });
  chain = run.catch(() => undefined);
  return run;
}

export const zatcaConfigured = () => Boolean(process.env.ZATCA_API_BASE && process.env.ZATCA_BINARY_TOKEN && process.env.ZATCA_SECRET);

/** Reports a simplified invoice to ZATCA (Fatoora reporting API). Requires CSID credentials from onboarding. */
export async function reportToZatca(recordId: string) {
  const rec = await prisma.eInvoiceRecord.findUniqueOrThrow({ where: { id: recordId } });
  if (!zatcaConfigured()) {
    return prisma.eInvoiceRecord.update({ where: { id: rec.id }, data: { status: "PENDING_CONFIG", zatcaResponse: { note: "Set ZATCA_API_BASE, ZATCA_BINARY_TOKEN and ZATCA_SECRET after Fatoora onboarding; the XML must be XAdES-signed with the EGS certificate before reporting." } } });
  }
  const auth = Buffer.from(`${process.env.ZATCA_BINARY_TOKEN}:${process.env.ZATCA_SECRET}`).toString("base64");
  const resp = await fetch(`${process.env.ZATCA_API_BASE}/invoices/reporting/single`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/json", accept: "application/json", "Accept-Version": "V2", "Clearance-Status": "0" },
    body: JSON.stringify({ invoiceHash: rec.invoiceHash, uuid: rec.uuid, invoice: Buffer.from(rec.xml, "utf8").toString("base64") }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await resp.json().catch(() => ({}))) as { reportingStatus?: string };
  const status = resp.ok && json.reportingStatus === "REPORTED" ? "REPORTED" : "REJECTED";
  return prisma.eInvoiceRecord.update({ where: { id: rec.id }, data: { status, zatcaResponse: json as Prisma.InputJsonValue } });
}
