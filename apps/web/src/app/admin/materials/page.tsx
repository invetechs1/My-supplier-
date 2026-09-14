"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UNITS, type Material } from "@mysupplier/shared";
import { api, errorMessage, type AdminMaterialPayload } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatSar, timeAgo } from "@/lib/format";
import { Alert, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Table, Textarea, type Column } from "@/components/ui";

interface MaterialForm {
  sku: string;
  name: string;
  nameAr: string;
  unit: string;
  categoryId: string;
  brand: string;
  description: string;
  specs: string;
}

const empty: MaterialForm = { sku: "", name: "", nameAr: "", unit: "ton", categoryId: "", brand: "", description: "", specs: "" };

function specsToText(specs: Material["specs"]): string {
  if (!specs) return "";
  return Object.entries(specs).map(([k, v]) => `${k}=${v}`).join("\n");
}
function textToSpecs(text: string): Record<string, string | number> | undefined {
  const out: Record<string, string | number> = {};
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const idx = line.indexOf("=");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    const num = Number(raw);
    out[key] = raw !== "" && !Number.isNaN(num) ? num : raw;
  });
  return Object.keys(out).length ? out : undefined;
}

export default function AdminMaterialsPage() {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const categories = useAsync(() => api.categories(), []);
  const state = useAsync(() => api.materials({ q: q || undefined, categoryId: categoryId || undefined, page, pageSize: 25, sort: "name" }), [q, categoryId, page]);
  const [flash, setFlash] = useFlash();

  const [modal, setModal] = useState<{ open: boolean; editing: Material | null }>({ open: false, editing: null });
  const [form, setForm] = useState<MaterialForm>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!form.categoryId && categories.data?.[0]) setForm((f) => ({ ...f, categoryId: categories.data![0].id }));
  }, [categories.data, form.categoryId]);

  const openCreate = () => {
    setForm({ ...empty, categoryId: categories.data?.[0]?.id ?? "" });
    setErrors({});
    setModal({ open: true, editing: null });
  };
  const openEdit = (m: Material) => {
    setForm({ sku: m.sku, name: m.name, nameAr: m.nameAr, unit: String(m.unit), categoryId: m.categoryId, brand: m.brand ?? "", description: m.description ?? "", specs: specsToText(m.specs) });
    setErrors({});
    setModal({ open: true, editing: m });
  };

  const save = async () => {
    const next: Record<string, string> = {};
    if (!form.sku.trim()) next.sku = "SKU is required.";
    if (!form.name.trim()) next.name = "Name is required.";
    if (!form.nameAr.trim()) next.nameAr = "Arabic name is required.";
    if (!form.unit) next.unit = "Select a unit.";
    if (!form.categoryId) next.categoryId = "Select a category.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const payload: AdminMaterialPayload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      nameAr: form.nameAr.trim(),
      unit: form.unit,
      categoryId: form.categoryId,
      brand: form.brand.trim() || undefined,
      description: form.description.trim() || undefined,
      specs: textToSpecs(form.specs),
    };
    setSaving(true);
    try {
      if (modal.editing) await api.adminUpdateMaterial(modal.editing.id, payload);
      else await api.adminCreateMaterial(payload);
      setFlash({ kind: "success", message: modal.editing ? "Material updated." : "Material created." });
      setModal({ open: false, editing: null });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: Material) => {
    if (!window.confirm(`Delete "${m.name}" (${m.sku})? Price listings for it may be removed.`)) return;
    setDeleting(m.id);
    try {
      await api.adminDeleteMaterial(m.id);
      setFlash({ kind: "success", message: "Material deleted." });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(null);
    }
  };

  const catOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const columns: Column<Material>[] = [
    { key: "sku", header: "SKU", render: (m) => <span className="font-mono text-xs text-slate-600">{m.sku}</span> },
    { key: "name", header: "Name", render: (m) => (
      <div>
        <Link href={`/materials/${m.id}`} className="font-medium text-slate-900 hover:text-brand-700">{m.name}</Link>
        <p className="text-xs text-slate-500">{m.nameAr}</p>
      </div>
    ) },
    { key: "category", header: "Category", render: (m) => m.category?.name ?? catOptions.find((c) => c.value === m.categoryId)?.label ?? "—" },
    { key: "unit", header: "Unit", render: (m) => m.unit },
    { key: "brand", header: "Brand", render: (m) => m.brand ?? <span className="text-slate-400">—</span> },
    { key: "avg", header: "Avg price", align: "end", render: (m) => <span className="tabular-nums">{formatSar(m.avgPrice, lang)}</span> },
    { key: "suppliers", header: "Suppliers", align: "end", render: (m) => m.supplierCount ?? 0 },
    { key: "updated", header: "Updated", render: (m) => <span className="text-slate-500">{timeAgo(m.lastUpdated)}</span> },
    { key: "actions", header: "", align: "end", render: (m) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => openEdit(m)}>Edit</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(m)} loading={deleting === m.id}>{t("common.delete")}</Button>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title={t("admin.materials")} action={<Button variant="accent" onClick={openCreate}>+ New material</Button>} />
      <Card className="mb-4 p-4">
        <form onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); setPage(1); }} className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or SKU…" />
          <Select name="categoryId" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} placeholder="All categories" options={catOptions} />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </Card>
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(m) => m.id} dense empty={<EmptyState title="No materials" action={<Button onClick={openCreate}>Create material</Button>} />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}

      <Modal open={modal.open} wide title={modal.editing ? `Edit ${modal.editing.sku}` : "New material"} onClose={() => setModal({ open: false, editing: null })} footer={<><Button variant="outline" onClick={() => setModal({ open: false, editing: null })}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>{t("common.save")}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="SKU" name="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} error={errors.sku} required dir="ltr" />
          <Select label="Category" name="categoryId" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} options={catOptions} error={errors.categoryId} placeholder="Select…" required />
          <Input label="Name (English)" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} required />
          <Input label="Name (Arabic)" name="nameAr" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} error={errors.nameAr} required />
          <Select label="Unit" name="unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} options={UNITS.map((u) => ({ value: u, label: u }))} error={errors.unit} required />
          <Input label="Brand" name="brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <Textarea label="Description" name="description" className="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          <Textarea label="Specs" name="specs" className="sm:col-span-2" hint="One per line as key=value, e.g. grade=60 or diameter_mm=12" value={form.specs} onChange={(e) => setForm({ ...form, specs: e.target.value })} rows={4} />
        </div>
      </Modal>
    </div>
  );
}
