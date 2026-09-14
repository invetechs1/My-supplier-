"use client";
import React from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SAUDI_CITIES, UNITS, type CreateRfqPayload, type Material } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toDateTimeLocal } from "@/lib/format";
import { Alert, Button, Card, CardBody, CardHeader, Input, LoadingBlock, PageHeader, Select, Textarea } from "@/components/ui";
import { MaterialAutocomplete } from "@/components/MaterialAutocomplete";

interface ItemRow {
  key: number;
  material: Material | null;
  description: string;
  quantity: string;
  unit: string;
  notes: string;
}

let rowSeq = 1;
const newRow = (material: Material | null = null): ItemRow => ({
  key: rowSeq++,
  material,
  description: material ? material.name : "",
  quantity: "",
  unit: material ? String(material.unit) : "ton",
  notes: "",
});

function NewRfqInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const materialId = params.get("materialId");

  const defaultCloses = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const [form, setForm] = useState({
    title: "",
    deliveryCity: user?.company?.city ?? "Riyadh",
    deliveryAddress: "",
    deliveryDate: "",
    closesAt: toDateTimeLocal(defaultCloses.toISOString()),
    notes: "",
  });
  const [items, setItems] = useState<ItemRow[]>([newRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [prefilling, setPrefilling] = useState(!!materialId);

  useEffect(() => {
    if (!materialId) return;
    let active = true;
    api
      .material(materialId)
      .then((m) => {
        if (!active) return;
        setItems([newRow(m)]);
        setForm((f) => ({ ...f, title: f.title || `Quotation request: ${m.name}` }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setPrefilling(false);
      });
    return () => {
      active = false;
    };
  }, [materialId]);

  const updateItem = (key: number, patch: Partial<ItemRow>) => setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (form.title.trim().length < 3) next.title = "Give the RFQ a descriptive title.";
    if (!form.deliveryCity) next.deliveryCity = "Select a delivery city.";
    if (!form.closesAt) next.closesAt = "Set a closing date and time.";
    else if (new Date(form.closesAt).getTime() <= Date.now()) next.closesAt = "Closing time must be in the future.";
    if (items.length === 0) next.items = "Add at least one item.";
    items.forEach((it) => {
      if (!it.description.trim() && !it.material) next[`item-${it.key}-description`] = "Describe the item or select a material.";
      const qty = Number(it.quantity);
      if (!it.quantity || Number.isNaN(qty) || qty <= 0) next[`item-${it.key}-quantity`] = "Enter a quantity > 0.";
      if (!it.unit) next[`item-${it.key}-unit`] = "Select a unit.";
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    const payload: CreateRfqPayload = {
      title: form.title.trim(),
      deliveryCity: form.deliveryCity,
      deliveryAddress: form.deliveryAddress.trim() || undefined,
      deliveryDate: form.deliveryDate ? new Date(form.deliveryDate).toISOString() : undefined,
      closesAt: new Date(form.closesAt).toISOString(),
      notes: form.notes.trim() || undefined,
      items: items.map((it) => ({
        materialId: it.material?.id,
        description: it.description.trim() || it.material?.name || "",
        quantity: Number(it.quantity),
        unit: it.unit,
        notes: it.notes.trim() || undefined,
      })),
    };
    setSubmitting(true);
    try {
      const rfq = await api.createRfq(payload);
      router.push(`/dashboard/rfqs/${rfq.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not create the RFQ"));
      setSubmitting(false);
    }
  };

  if (prefilling) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title={t("dash.newRfq")} subtitle="Suppliers in the delivery city will be notified and can bid until the closing time." />
      <form onSubmit={submit} className="space-y-6" noValidate>
        {error && <Alert>{error}</Alert>}
        <Card>
          <CardHeader title="Request details" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input label="Title" name="title" className="sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} placeholder="e.g. Structural steel for villa project, phase 2" required />
            <Select label="Delivery city" name="deliveryCity" value={form.deliveryCity} onChange={(e) => setForm({ ...form, deliveryCity: e.target.value })} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={errors.deliveryCity} required />
            <Input label="Delivery address" name="deliveryAddress" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} placeholder="District, street, site reference" />
            <Input label="Requested delivery date" name="deliveryDate" type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} />
            <Input label="Bidding closes at" name="closesAt" type="datetime-local" value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} error={errors.closesAt} required />
            <Textarea label="Notes for suppliers" name="notes" className="sm:col-span-2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment terms, site access, certifications required…" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Items"
            subtitle="Search the catalogue to link a material, or describe the item freely."
            action={<Button type="button" variant="secondary" size="sm" onClick={() => setItems((r) => [...r, newRow()])}>+ Add item</Button>}
          />
          {errors.items && <div className="px-5 pt-4"><Alert>{errors.items}</Alert></div>}
          <div className="divide-y divide-slate-100">
            {items.map((it, idx) => (
              <div key={it.key} className="grid gap-3 px-5 py-4 md:grid-cols-12">
                <div className="md:col-span-5">
                  <MaterialAutocomplete
                    label={`Item ${idx + 1} — material`}
                    value={it.material}
                    onChange={(m) => updateItem(it.key, { material: m, description: m ? m.name : it.description, unit: m ? String(m.unit) : it.unit })}
                  />
                  <Input
                    name={`description-${it.key}`}
                    className="mt-2"
                    placeholder="Description / specification"
                    value={it.description}
                    onChange={(e) => updateItem(it.key, { description: e.target.value })}
                    error={errors[`item-${it.key}-description`]}
                  />
                </div>
                <Input label="Quantity" name={`quantity-${it.key}`} type="number" min={0} step="any" className="md:col-span-2" value={it.quantity} onChange={(e) => updateItem(it.key, { quantity: e.target.value })} error={errors[`item-${it.key}-quantity`]} required />
                <Select label="Unit" name={`unit-${it.key}`} className="md:col-span-2" value={it.unit} onChange={(e) => updateItem(it.key, { unit: e.target.value })} error={errors[`item-${it.key}-unit`]}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  {!UNITS.includes(it.unit as (typeof UNITS)[number]) && it.unit && <option value={it.unit}>{it.unit}</option>}
                </Select>
                <Input label="Notes" name={`notes-${it.key}`} className="md:col-span-2" value={it.notes} onChange={(e) => updateItem(it.key, { notes: e.target.value })} placeholder="Grade, brand…" />
                <div className="flex items-end md:col-span-1">
                  <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => setItems((rows) => rows.filter((r) => r.key !== it.key))} disabled={items.length === 1}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
          <Button type="submit" loading={submitting} size="lg">Publish RFQ</Button>
        </div>
      </form>
    </div>
  );
}

export default function NewRfqPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewRfqInner />
    </Suspense>
  );
}
