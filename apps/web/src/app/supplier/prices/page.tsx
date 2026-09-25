"use client";

import Link from "next/link";
import { useState } from "react";
import { SAUDI_CITIES, type Material, type PriceListing, type UpsertPricePayload } from "@mysupplier/shared";
import { ApiRequestError, api, errorMessage, type SupplierListing } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatSar, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LinkButton, LoadingBlock, Modal, PageHeader, Pagination, Select, Table, Textarea, type Column } from "@/components/ui";
import { MaterialAutocomplete } from "@/components/MaterialAutocomplete";

interface PriceForm {
  material: Material | null;
  price: string;
  city: string;
  minQty: string;
  leadTimeDays: string;
  validUntil: string;
}

const emptyForm = (city: string): PriceForm => ({ material: null, price: "", city, minQty: "1", leadTimeDays: "3", validUntil: "" });

export default function SupplierPricesPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const defaultCity = user?.company?.city ?? "Riyadh";
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.supplierPrices(page), [page]);
  const [flash, setFlash] = useFlash(6000);

  // Inline price / stock editing (PATCH /supplier/prices/:id)
  const [inline, setInline] = useState<{ id: string; price: string; stock: string } | null>(null);
  const [inlineSaving, setInlineSaving] = useState(false);
  const startInline = (l: SupplierListing) => setInline({ id: l.id, price: String(l.price), stock: l.stock === null || l.stock === undefined ? "" : String(l.stock) });
  const saveInline = async () => {
    if (!inline) return;
    const price = Number(inline.price);
    if (!inline.price || Number.isNaN(price) || price <= 0) {
      setFlash({ kind: "error", message: "Enter a valid price." });
      return;
    }
    const stock = inline.stock.trim() === "" ? null : Math.max(0, Math.floor(Number(inline.stock)));
    if (stock !== null && Number.isNaN(stock)) {
      setFlash({ kind: "error", message: "Stock must be a number (leave blank for on request)." });
      return;
    }
    setInlineSaving(true);
    try {
      const updated = await api.updateSupplierPrice(inline.id, { price, stock });
      state.setData((prev) => (prev ? { ...prev, data: prev.data.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)) } : prev));
      setInline(null);
      setFlash({ kind: "success", message: "Listing updated." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setInlineSaving(false);
    }
  };

  const [modal, setModal] = useState<{ open: boolean; editing: PriceListing | null }>({ open: false, editing: null });
  const [form, setForm] = useState<PriceForm>(emptyForm(defaultCity));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [bulk, setBulk] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<{ rows: UpsertPricePayload[]; errors: string[] } | null>(null);

  const openCreate = () => {
    setForm(emptyForm(defaultCity));
    setErrors({});
    setModal({ open: true, editing: null });
  };
  const openEdit = (l: PriceListing) => {
    setForm({
      material: l.material ?? ({ id: l.materialId, sku: "", name: l.materialId, nameAr: "", unit: "", categoryId: "" } as Material),
      price: String(l.price),
      city: l.city,
      minQty: String(l.minQty),
      leadTimeDays: String(l.leadTimeDays),
      validUntil: l.validUntil ? l.validUntil.slice(0, 10) : "",
    });
    setErrors({});
    setModal({ open: true, editing: l });
  };

  const save = async () => {
    const next: Record<string, string> = {};
    if (!form.material) next.material = "Select a material.";
    const price = Number(form.price);
    if (!form.price || Number.isNaN(price) || price <= 0) next.price = "Enter a valid price.";
    if (!form.city) next.city = "Select a city.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !form.material) return;
    setSaving(true);
    try {
      const payload: UpsertPricePayload = {
        materialId: form.material.id,
        price,
        city: form.city,
        minQty: Number(form.minQty) || 1,
        leadTimeDays: Number(form.leadTimeDays) || 0,
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
      };
      try {
        await api.upsertPrice({ ...payload, overwrite: Boolean(modal.editing) });
      } catch (err) {
        // The API refuses to silently replace a live offer for the same material + city; ask before overwriting.
        if (!(err instanceof ApiRequestError && err.status === 409) || modal.editing) throw err;
        if (!window.confirm(`${errorMessage(err)}\n\nReplace the existing offer with SAR ${price}?`)) return;
        await api.upsertPrice({ ...payload, overwrite: true });
      }
      setFlash({ kind: "success", message: modal.editing ? "Price updated." : "Price listing added." });
      setModal({ open: false, editing: null });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: PriceListing) => {
    if (!window.confirm(`Delete price for ${l.material?.name ?? l.materialId} in ${l.city}?`)) return;
    setDeleting(l.id);
    try {
      await api.deletePrice(l.id);
      setFlash({ kind: "success", message: "Listing deleted." });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(null);
    }
  };

  const parseBulk = () => {
    const rows: UpsertPricePayload[] = [];
    const errs: string[] = [];
    bulk
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line, i) => {
        if (i === 0 && /^materialId/i.test(line)) return;
        const [materialId, price, city, minQty, leadTimeDays] = line.split(",").map((s) => s.trim());
        const p = Number(price);
        if (!materialId || !price || Number.isNaN(p) || p <= 0) {
          errs.push(`Line ${i + 1}: needs materialId and a positive price.`);
          return;
        }
        rows.push({
          materialId,
          price: p,
          city: city || defaultCity,
          minQty: minQty ? Number(minQty) || 1 : undefined,
          leadTimeDays: leadTimeDays ? Number(leadTimeDays) || 0 : undefined,
        });
      });
    setBulkPreview({ rows, errors: errs });
  };

  const submitBulk = async () => {
    if (!bulkPreview || bulkPreview.rows.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await api.bulkPrices(bulkPreview.rows);
      setFlash({ kind: "success", message: `${res.upserted} listings upserted.` });
      setBulk("");
      setBulkPreview(null);
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBulkBusy(false);
    }
  };

  const columns: Column<SupplierListing>[] = [
    { key: "material", header: "Material", render: (l) => (
      <div>
        <p className="font-medium text-slate-900">{l.material ? <Link href={`/shop/products/${l.material.id}`} className="hover:text-brand-700">{l.material.name}</Link> : l.materialId}</p>
        <p className="text-xs text-slate-500">{l.material?.sku}{l.material ? ` · per ${l.material.unit}` : ""}</p>
      </div>
    ) },
    { key: "city", header: t("common.city"), render: (l) => l.city },
    { key: "price", header: "Price", align: "end", render: (l) =>
      inline?.id === l.id ? (
        <Input name={`price-${l.id}`} type="number" min={0} step="0.01" value={inline.price} onChange={(e) => setInline({ ...inline, price: e.target.value })} className="w-28" dir="ltr" aria-label="Price" autoFocus />
      ) : (
        <span className="font-semibold tabular-nums">{formatSar(l.price, lang)}</span>
      ) },
    { key: "stock", header: "Stock", align: "end", render: (l) =>
      inline?.id === l.id ? (
        <Input name={`stock-${l.id}`} type="number" min={0} value={inline.stock} onChange={(e) => setInline({ ...inline, stock: e.target.value })} className="w-24" dir="ltr" placeholder="—" aria-label="Stock" />
      ) : l.stock === null || l.stock === undefined ? (
        <Badge tone="slate">On request</Badge>
      ) : l.stock > 0 ? (
        <span className="tabular-nums text-emerald-700">{l.stock}</span>
      ) : (
        <Badge tone="red">Out of stock</Badge>
      ) },
    { key: "minQty", header: "Min qty", align: "end", render: (l) => l.minQty },
    { key: "lead", header: "Lead time", align: "end", render: (l) => `${l.leadTimeDays} d` },
    { key: "updated", header: "Updated", render: (l) => <span className="text-slate-500">{timeAgo(l.updatedAt)}</span> },
    { key: "actions", header: "", align: "end", render: (l) => (
      inline?.id === l.id ? (
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={saveInline} loading={inlineSaving}>{t("common.save")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setInline(null)} disabled={inlineSaving}>{t("common.cancel")}</Button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => startInline(l)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => openEdit(l)} title="Lead time, min qty, validity">More</Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(l)} loading={deleting === l.id}>{t("common.delete")}</Button>
        </div>
      )
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t("sup.prices")}
        subtitle="Published prices appear in the shop and on material pages, and feed the market index. Click Edit to change price and stock inline."
        action={
          <>
            <LinkButton href="/supplier/catalog" variant="outline">{t("sup.catalog")}</LinkButton>
            <LinkButton href="/supplier/imports" variant="primary" className="gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Import from PDF / Excel / photo
            </LinkButton>
            <Button variant="accent" onClick={openCreate}>+ Add price</Button>
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(l) => l.id} empty={<EmptyState title="No prices published" description="Add prices one by one or paste a CSV below." action={<Button onClick={openCreate}>Add first price</Button>} />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Bulk upload" subtitle="One listing per line: materialId,price,city,minQty,leadTimeDays (city and the last two are optional)." />
        <CardBody className="space-y-3">
          <Textarea name="bulk" value={bulk} onChange={(e) => { setBulk(e.target.value); setBulkPreview(null); }} placeholder={`materialId,price,city,minQty,leadTimeDays\nclx123abc,18.5,Riyadh,50,3\nclx456def,2650,Jeddah,1,7`} className="font-mono text-xs" rows={6} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={parseBulk} disabled={!bulk.trim()}>Preview</Button>
            {bulkPreview && (
              <>
                <span className="text-sm text-slate-600">{bulkPreview.rows.length} valid rows{bulkPreview.errors.length ? `, ${bulkPreview.errors.length} skipped` : ""}</span>
                <Button onClick={submitBulk} loading={bulkBusy} disabled={bulkPreview.rows.length === 0}>Upload {bulkPreview.rows.length} rows</Button>
              </>
            )}
          </div>
          {bulkPreview && bulkPreview.errors.length > 0 && (
            <Alert kind="warning"><ul className="list-disc ps-4">{bulkPreview.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}{bulkPreview.errors.length > 5 && <li>…and {bulkPreview.errors.length - 5} more</li>}</ul></Alert>
          )}
        </CardBody>
      </Card>

      <Modal open={modal.open} title={modal.editing ? "Edit price" : "Add price"} onClose={() => setModal({ open: false, editing: null })} footer={<><Button variant="outline" onClick={() => setModal({ open: false, editing: null })}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>{t("common.save")}</Button></>}>
        <div className="space-y-4">
          {modal.editing ? (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">Material:</span> <span className="font-medium text-slate-900">{form.material?.name}</span></div>
          ) : (
            <MaterialAutocomplete label="Material" value={form.material} onChange={(m) => setForm({ ...form, material: m })} error={errors.material} required />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={`Price (SAR${form.material?.unit ? ` / ${form.material.unit}` : ""})`} name="price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} error={errors.price} required dir="ltr" />
            <Select label="City" name="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={errors.city} disabled={!!modal.editing} required />
            <Input label="Minimum quantity" name="minQty" type="number" min={1} value={form.minQty} onChange={(e) => setForm({ ...form, minQty: e.target.value })} dir="ltr" />
            <Input label="Lead time (days)" name="leadTimeDays" type="number" min={0} value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} dir="ltr" />
            <Input label="Valid until" name="validUntil" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className="sm:col-span-2" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
