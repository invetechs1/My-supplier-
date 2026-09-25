import { Router } from "express";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { userFromToken, requireAuth, type AuthUser } from "../middleware/auth";
import { forbidden, notFound, unauthorized } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { qrSvg, zatcaTlvBase64 } from "../services/zatca";

const router = Router();
const include = {
  company: true,
  items: { include: { material: true } },
  buyer: { select: { id: true, name: true, email: true, phone: true, company: true } },
} satisfies Prisma.OrderInclude;

async function invoiceFor(orderId: string, user: Pick<AuthUser, "id" | "role" | "companyId">) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include });
  if (!order) throw notFound("Order not found");
  if (!(user.role === "ADMIN" || order.buyerId === user.id || order.companyId === user.companyId)) throw forbidden();
  const seller = order.company;
  const total = Number(order.total);
  const vat = Number(order.vat) || Math.round((total - total / (1 + env.vatRate)) * 100) / 100;
  const issuedAt = order.createdAt;
  const sellerVat = seller.vatNumber ?? env.seller.vatNumber;
  const zatca = zatcaTlvBase64({ sellerName: seller.name, vatNumber: sellerVat, timestamp: issuedAt, total, vat });
  return {
    order,
    seller,
    buyer: order.buyer,
    invoiceNumber: `INV-${order.reference.replace(/^ORD-/, "")}`,
    issuedAt,
    zatcaQr: zatca,
    qrSvg: await qrSvg(zatca),
    sellerVatNumber: sellerVat,
    vatAmount: vat,
  };
}

router.get(
  "/orders/:id/invoice",
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(serialize(await invoiceFor(req.params.id, req.user!)));
  }),
);

router.get(
  "/orders/:id/invoice.html",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const user = await userFromToken(token);
    if (!user) throw unauthorized("Invalid or expired token");
    const inv = await invoiceFor(req.params.id, user);
    const o = inv.order;
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const money = (n: unknown) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = o.items.length
      ? o.items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${esc(i.name)}<div class="muted">${esc(i.material?.nameAr ?? "")}</div></td><td>${esc(i.unit)}</td><td class="r">${i.quantity}</td><td class="r">${money(i.unitPrice)}</td><td class="r">${money(i.lineTotal)}</td></tr>`).join("")
      : `<tr><td>1</td><td>Order ${esc(o.reference)}</td><td>lot</td><td class="r">1</td><td class="r">${money(o.subtotal)}</td><td class="r">${money(o.subtotal)}</td></tr>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${inv.invoiceNumber}</title>
<style>body{font-family:Inter,Arial,sans-serif;color:#111827;margin:0;padding:32px;max-width:900px;margin:0 auto}h1{color:#0B6E4F;margin:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}.box{border:1px solid #e5e7eb;border-radius:12px;padding:16px}.muted{color:#6b7280;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:14px;vertical-align:top}th{background:#f4f6f5;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.r{text-align:right}.totals{margin-left:auto;width:320px;margin-top:16px}.totals td{border:none;padding:6px 8px}.grand td{font-weight:700;font-size:16px;border-top:2px solid #0B6E4F}.badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${o.paymentStatus === "PAID" ? "#dcfce7;color:#166534" : "#fef3c7;color:#92400e"}}.qr svg{width:140px;height:140px}@media print{.noprint{display:none}body{padding:0}}</style></head>
<body><div class="noprint" style="text-align:right;margin-bottom:12px"><button onclick="window.print()" style="background:#0B6E4F;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer">Print / Save as PDF</button></div>
<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-weight:700;color:#0B6E4F">MySupplier <span style="font-weight:600;color:#D18F00;font-size:12px">· Build for less · البناء بأقل تكلفة</span></div><h1>Tax Invoice · فاتورة ضريبية</h1><div class="muted">Simplified tax invoice (ZATCA phase 1)</div></div><div style="text-align:right"><div style="font-size:20px;font-weight:700">${inv.invoiceNumber}</div><div class="muted">Issued ${esc(inv.issuedAt.toISOString().slice(0, 10))} · Order ${esc(o.reference)}</div><div style="margin-top:6px"><span class="badge">${esc(o.paymentStatus)}${o.paymentMethod ? ` · ${esc(o.paymentMethod.replace("_", " "))}` : ""}</span></div></div></div>
<div class="grid"><div class="box"><div class="muted">Seller / البائع</div><strong>${esc(inv.seller.name)}</strong><div>${esc(inv.seller.nameAr ?? "")}</div><div>VAT: ${esc(inv.sellerVatNumber)}${inv.seller.crNumber ? ` · CR: ${esc(inv.seller.crNumber)}` : ""}</div><div>${esc(inv.seller.city)}, Saudi Arabia</div></div>
<div class="box"><div class="muted">Buyer / المشتري</div><strong>${esc(inv.buyer.company?.name ?? inv.buyer.name)}</strong><div>${esc(inv.buyer.name)} · ${esc(inv.buyer.phone ?? o.contactPhone ?? "")}</div>${inv.buyer.company?.vatNumber ? `<div>VAT: ${esc(inv.buyer.company.vatNumber)}</div>` : ""}<div>${esc(o.deliveryAddress ?? "")}${o.deliveryCity ? `, ${esc(o.deliveryCity)}` : ""}</div></div></div>
<table><thead><tr><th>#</th><th>Item</th><th>Unit</th><th class="r">Qty</th><th class="r">Unit price (SAR)</th><th class="r">Total (SAR)</th></tr></thead><tbody>${rows}</tbody></table>
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px"><div class="qr">${inv.qrSvg}<div class="muted">Scan to verify (ZATCA)</div></div>
<table class="totals"><tr><td>Subtotal (excl. VAT)</td><td class="r">${money(o.subtotal)}</td></tr><tr><td>Delivery</td><td class="r">${money(o.deliveryFee)}</td></tr><tr><td>VAT ${Math.round(env.vatRate * 100)}%</td><td class="r">${money(inv.vatAmount)}</td></tr><tr class="grand"><td>Total (SAR)</td><td class="r">${money(o.total)}</td></tr></table></div>
<p class="muted" style="margin-top:32px">Issued via MySupplier (${esc(env.seller.name)}, VAT ${esc(env.seller.vatNumber)}) on behalf of the seller. Bank transfer: ${esc(env.bank.name)} · IBAN ${esc(env.bank.iban)} · Beneficiary ${esc(env.bank.beneficiary)} · Reference ${esc(o.reference)}.</p>
</body></html>`);
  }),
);

export default router;
