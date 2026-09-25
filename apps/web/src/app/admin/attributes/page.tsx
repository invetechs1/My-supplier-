"use client";

import { useSearchParams } from "next/navigation";
import React, { Suspense, useMemo, useState } from "react";
import type { AttributeType, Category, CategoryAttribute, CategoryAttributePayload } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { ATTRIBUTE_TYPES, slugifyKey, supplierCommerceApi } from "@/lib/api/supplierCommerce";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Select, Table, Toggle, type Column } from "@/components/ui";

const TYPE_LABEL: Record<AttributeType, string> = { TEXT: "Text", NUMBER: "Number", SELECT: "Select (options)", BOOLEAN: "Yes / No" };
const TYPE_TONE: Record<AttributeType, "slate" | "blue" | "purple" | "green"> = { TEXT: "slate", NUMBER: "blue", SELECT: "purple", BOOLEAN: "green" };
const KEY_RE = /^[a-z0-9][a-z0-9_]*$/;

interface AttrForm {
  key: string;
  label: string;
  labelAr: string;
  type: AttributeType;
  unit: string;
  options: string;
  filterable: boolean;
  sortOrder: string;
}

const emptyForm = (sortOrder: number): AttrForm => ({ key: "", label: "", labelAr: "", type: "TEXT", unit: "", options: "", filterable: true, sortOrder: String(sortOrder) });
const formFor = (a: CategoryAttribute): AttrForm => ({ key: a.key, label: a.label, labelAr: a.labelAr, type: a.type, unit: a.unit ?? "", options: a.options.join(", "), filterable: a.filterable, sortOrder: String(a.sortOrder) });
const parseOptions = (s: string) => [...new Set(s.split(/[,\n]/).map((o) => o.trim()).filter(Boolean))];

/** How the storefront filter sidebar renders each definition (static preview, nothing is wired). */
function FacetPreview({ attribute, lang }: { attribute: CategoryAttribute; lang: "en" | "ar" }) {
  const label = lang === "ar" ? attribute.labelAr || attribute.label : attribute.label;
  const unit = attribute.unit ? ` (${attribute.unit})` : "";
  return (
    <fieldset className="rounded-xl border border-slate-200 px-3 py-2">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}{unit}</legend>
      {attribute.type === "NUMBER" ? (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <input readOnly placeholder="Min" className="h-7 w-20 rounded-lg border border-slate-200 px-2 text-xs" dir="ltr" />
          <span>–</span>
          <input readOnly placeholder="Max" className="h-7 w-20 rounded-lg border border-slate-200 px-2 text-xs" dir="ltr" />
          {attribute.unit && <span className="text-slate-400">{attribute.unit}</span>}
        </div>
      ) : attribute.type === "BOOLEAN" ? (
        <div className="flex gap-3 text-xs text-slate-700">
          {["Yes", "No"].map((v) => <label key={v} className="inline-flex items-center gap-1.5"><input type="checkbox" readOnly className="h-3.5 w-3.5 rounded border-slate-300" /> {v} <span className="text-slate-400">(12)</span></label>)}
        </div>
      ) : attribute.type === "SELECT" ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
          {(attribute.options.length ? attribute.options : ["Option"]).slice(0, 8).map((o) => <label key={o} className="inline-flex items-center gap-1.5"><input type="checkbox" readOnly className="h-3.5 w-3.5 rounded border-slate-300" /> {o} <span className="text-slate-400">(8)</span></label>)}
          {attribute.options.length > 8 && <span className="text-slate-400">+{attribute.options.length - 8} more</span>}
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
          {["Value A", "Value B", "Value C"].map((o) => <label key={o} className="inline-flex items-center gap-1.5"><input type="checkbox" readOnly className="h-3.5 w-3.5 rounded border-slate-300" /> {o} <span className="text-slate-400">(5)</span></label>)}
          <span className="w-full text-[11px] text-slate-400">Distinct values found in product specs</span>
        </div>
      )}
    </fieldset>
  );
}

function AdminAttributesInner() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [categoryId, setCategoryId] = useState(params.get("category") ?? "");
  const categories = useAsync(() => api.categories(), []);
  const attrs = useAsync(() => (categoryId ? supplierCommerceApi.categoryAttributes(categoryId) : Promise.resolve([] as CategoryAttribute[])), [categoryId]);
  const selected = categories.data?.find((c) => c.id === categoryId) ?? null;
  const publicAttrs = useAsync(() => (selected ? supplierCommerceApi.publicCategoryAttributes(selected.slug) : Promise.resolve([] as CategoryAttribute[])), [selected?.slug]);
  const [flash, setFlash] = useFlash(6000);

  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; attribute: CategoryAttribute } | null>(null);
  const [form, setForm] = useState<AttrForm>(emptyForm(0));
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof AttrForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryAttribute | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Parents first, children indented under them – the same tree the shop navigation uses.
  const categoryOptions = useMemo(() => {
    const all = categories.data ?? [];
    const children = new Map<string, Category[]>();
    all.forEach((c) => {
      if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
    });
    const name = (c: Category) => `${c.icon ? `${c.icon} ` : ""}${lang === "ar" ? c.nameAr || c.name : c.name}`;
    const out: Array<{ value: string; label: string }> = [];
    all.filter((c) => !c.parentId).forEach((p) => {
      out.push({ value: p.id, label: name(p) });
      (children.get(p.id) ?? []).forEach((ch) => out.push({ value: ch.id, label: `— ${name(ch)}` }));
    });
    all.filter((c) => c.parentId && !all.some((p) => p.id === c.parentId)).forEach((orphan) => out.push({ value: orphan.id, label: name(orphan) }));
    return out;
  }, [categories.data, lang]);

  const own = attrs.data ?? [];
  const inherited = (publicAttrs.data ?? []).filter((a) => a.categoryId !== categoryId && !own.some((o) => o.key === a.key));
  const filterable = [...own, ...inherited].filter((a) => a.filterable).sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));

  const openCreate = () => {
    const nextOrder = own.length ? Math.max(...own.map((a) => a.sortOrder)) + 10 : 10;
    setForm(emptyForm(nextOrder));
    setKeyTouched(false);
    setErrors({});
    setModal({ mode: "create" });
  };
  const openEdit = (a: CategoryAttribute) => {
    setForm(formFor(a));
    setKeyTouched(true);
    setErrors({});
    setModal({ mode: "edit", attribute: a });
  };
  const closeModal = () => {
    if (saving) return;
    setModal(null);
  };

  const setLabel = (label: string) => setForm((f) => ({ ...f, label, key: keyTouched ? f.key : slugifyKey(label) }));

  const submit = async () => {
    if (!modal || !categoryId) return;
    const next: Partial<Record<keyof AttrForm, string>> = {};
    const key = form.key.trim();
    const options = parseOptions(form.options);
    const sortOrder = Math.floor(Number(form.sortOrder));
    if (!form.label.trim()) next.label = "Label is required.";
    if (!form.labelAr.trim()) next.labelAr = "Arabic label is required.";
    if (!key) next.key = "Key is required.";
    else if (!KEY_RE.test(key)) next.key = "Use lowercase letters, digits and underscores (e.g. grade, thickness_mm).";
    else if (modal.mode === "create" && own.some((a) => a.key === key)) next.key = `"${key}" already exists in this category.`;
    if (form.type === "SELECT" && options.length === 0) next.options = "Add at least one option (comma separated).";
    if (form.sortOrder.trim() === "" || !Number.isFinite(sortOrder)) next.sortOrder = "Enter a whole number.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload: CategoryAttributePayload = {
      key,
      label: form.label.trim(),
      labelAr: form.labelAr.trim(),
      type: form.type,
      unit: form.type === "NUMBER" || form.type === "TEXT" ? form.unit.trim() || null : null,
      options: form.type === "SELECT" ? options : [],
      filterable: form.filterable,
      sortOrder,
    };
    setSaving(true);
    try {
      if (modal.mode === "create") {
        const created = await supplierCommerceApi.createAttribute(categoryId, payload);
        attrs.setData((prev) => [...(prev ?? []), created].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)));
        setFlash({ kind: "success", message: `Attribute "${created.label}" added to ${selected?.name ?? "the category"}.` });
      } else {
        const updated = await supplierCommerceApi.updateAttribute(modal.attribute.id, payload);
        attrs.setData((prev) => (prev ?? []).map((a) => (a.id === updated.id ? updated : a)).sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)));
        setFlash({ kind: "success", message: `Attribute "${updated.label}" updated.` });
      }
      publicAttrs.reload();
      setModal(null);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleFilterable = async (a: CategoryAttribute) => {
    try {
      const updated = await supplierCommerceApi.updateAttribute(a.id, { filterable: !a.filterable });
      attrs.setData((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
      publicAttrs.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supplierCommerceApi.deleteAttribute(deleteTarget.id);
      attrs.setData((prev) => (prev ?? []).filter((a) => a.id !== deleteTarget.id));
      publicAttrs.reload();
      setFlash({ kind: "success", message: `Attribute "${deleteTarget.label}" deleted.` });
      setDeleteTarget(null);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<CategoryAttribute>[] = [
    { key: "order", header: "#", align: "end", className: "w-12", render: (a) => <span className="tabular-nums text-slate-500">{a.sortOrder}</span> },
    { key: "key", header: "Key", render: (a) => <span className="font-mono text-xs text-slate-700" dir="ltr">{a.key}</span> },
    { key: "label", header: "Label", render: (a) => <div><p className="font-medium text-slate-900">{a.label}</p><p className="text-xs text-slate-500" dir="rtl">{a.labelAr}</p></div> },
    { key: "type", header: "Type", render: (a) => <Badge tone={TYPE_TONE[a.type] ?? "slate"}>{TYPE_LABEL[a.type] ?? a.type}</Badge> },
    { key: "unit", header: "Unit", render: (a) => a.unit ? <span dir="ltr">{a.unit}</span> : <span className="text-slate-400">—</span> },
    { key: "options", header: "Options", render: (a) => a.type === "SELECT" ? (
      <div className="flex max-w-[260px] flex-wrap gap-1">
        {a.options.slice(0, 5).map((o) => <span key={o} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{o}</span>)}
        {a.options.length > 5 && <span className="text-[11px] text-slate-500" title={a.options.join(", ")}>+{a.options.length - 5}</span>}
      </div>
    ) : <span className="text-slate-400">—</span> },
    { key: "filterable", header: "Filterable", render: (a) => <Toggle checked={a.filterable} onChange={() => toggleFilterable(a)} label={`${a.label} filterable`} /> },
    { key: "actions", header: "", align: "end", render: (a) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => openEdit(a)}>Edit</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(a)}>{t("common.delete")}</Button>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t("admin.attributes")}
        subtitle="Spec definitions per category. They drive the specification table on product pages and, when filterable, the facet sidebar in search. Values come from each product's specs by key."
        action={<Button onClick={openCreate} disabled={!categoryId}>+ New attribute</Button>}
      />
      <Card className="mb-4 p-4">
        {categories.loading && !categories.data ? <LoadingBlock className="py-2" /> : categories.error ? <Alert onRetry={categories.reload}>{categories.error}</Alert> : (
          <Select label="Category" name="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="Choose a category…" options={categoryOptions} className="max-w-md" />
        )}
      </Card>
      <FlashMessage flash={flash} className="mb-4" />

      {!categoryId ? (
        <Card><EmptyState title="Pick a category" description="Attributes are defined per category. Sub-categories inherit their parent's definitions." /></Card>
      ) : attrs.loading && !attrs.data ? <LoadingBlock /> : attrs.error ? <Alert onRetry={attrs.reload}>{attrs.error}</Alert> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title={`${selected?.name ?? "Category"} attributes`} subtitle={`${own.length} defined here${inherited.length ? ` · ${inherited.length} inherited from the parent` : ""}`} />
              <Table columns={columns} rows={own} rowKey={(a) => a.id} empty={<EmptyState title="No attributes yet" description="Add a spec definition, e.g. Grade (select), Thickness (number, mm) or Fire rated (yes/no)." action={<Button onClick={openCreate}>+ New attribute</Button>} />} />
            </Card>
            {inherited.length > 0 && (
              <Card>
                <CardHeader title="Inherited from parent" subtitle="Edit these on the parent category." />
                <ul className="divide-y divide-slate-100 px-5 text-sm">
                  {inherited.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="font-mono text-xs text-slate-600" dir="ltr">{a.key}</span>
                      <span className="font-medium text-slate-900">{a.label}</span>
                      <Badge tone={TYPE_TONE[a.type] ?? "slate"}>{TYPE_LABEL[a.type] ?? a.type}</Badge>
                      {a.unit && <span className="text-xs text-slate-500">{a.unit}</span>}
                      {a.filterable && <Badge tone="green">Filterable</Badge>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Filter preview" subtitle="How buyers see the facets for this category (counts are illustrative)." />
              <CardBody className="space-y-3">
                {filterable.length === 0 ? (
                  <p className="text-sm text-slate-500">No filterable attributes yet. Toggle &quot;Filterable&quot; on an attribute to show it in the search sidebar.</p>
                ) : (
                  filterable.map((a) => <FacetPreview key={a.id} attribute={a} lang={lang} />)
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="How keys are used" />
              <CardBody className="space-y-2 text-xs text-slate-600">
                <p>Each product stores its specs as <span className="font-mono">{"{ key: value }"}</span>. An attribute&apos;s <span className="font-mono">key</span> must match the spec key exactly (e.g. <span className="font-mono">thickness_mm</span>).</p>
                <p>Filters use <span className="font-mono">?spec.&lt;key&gt;=value</span>; NUMBER keys accept ranges like <span className="font-mono">10..50</span>.</p>
                <p>Type changes do not rewrite product data – re-check products after switching between TEXT and NUMBER.</p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      <Modal
        open={!!modal}
        title={modal?.mode === "edit" ? `Edit attribute · ${modal.attribute.label}` : `New attribute${selected ? ` · ${selected.name}` : ""}`}
        onClose={closeModal}
        footer={<><Button variant="outline" onClick={closeModal} disabled={saving}>{t("common.cancel")}</Button><Button onClick={submit} loading={saving}>{modal?.mode === "edit" ? t("common.save") : "Create attribute"}</Button></>}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Label" name="label" value={form.label} onChange={(e) => setLabel(e.target.value)} error={errors.label} placeholder="e.g. Thickness" autoFocus required />
            <Input label="Arabic label" name="labelAr" dir="rtl" value={form.labelAr} onChange={(e) => setForm({ ...form, labelAr: e.target.value })} error={errors.labelAr} placeholder="السماكة" required />
          </div>
          <Input label="Key" name="key" dir="ltr" value={form.key} onChange={(e) => { setKeyTouched(true); setForm({ ...form, key: e.target.value }); }} onBlur={() => setForm((f) => ({ ...f, key: slugifyKey(f.key) }))} error={errors.key} hint={modal?.mode === "edit" ? "Changing the key breaks the link to existing product specs using the old key." : "Auto-generated from the label; must match the product spec key."} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Type" name="type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AttributeType })} options={ATTRIBUTE_TYPES.map((tp) => ({ value: tp, label: TYPE_LABEL[tp] }))} />
            {form.type === "NUMBER" || form.type === "TEXT" ? (
              <Input label="Unit (optional)" name="unit" dir="ltr" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="mm, kg, MPa…" />
            ) : (
              <Input label="Sort order" name="sortOrder" type="number" step={1} dir="ltr" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} error={errors.sortOrder} hint="Lower numbers appear first." />
            )}
          </div>
          {form.type === "SELECT" && (
            <Input label="Options" name="options" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} error={errors.options} placeholder="Grade 40, Grade 60, Grade 75" hint={`Comma separated. ${parseOptions(form.options).length} option${parseOptions(form.options).length === 1 ? "" : "s"}.`} />
          )}
          {(form.type === "NUMBER" || form.type === "TEXT") && (
            <Input label="Sort order" name="sortOrder2" type="number" step={1} dir="ltr" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} error={errors.sortOrder} hint="Lower numbers appear first." className="max-w-[200px]" />
          )}
          <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-900">Filterable</span>
              <span className="block text-xs text-slate-500">Show this attribute as a facet in the search sidebar.</span>
            </span>
            <Toggle checked={form.filterable} onChange={(next) => setForm({ ...form, filterable: next })} label="Filterable" />
          </label>
          <div className={cn("rounded-xl border border-dashed border-slate-200 p-3", !form.filterable && "opacity-60")}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preview</p>
            <FacetPreview lang={lang} attribute={{ id: "preview", categoryId, key: form.key || "key", label: form.label || "Label", labelAr: form.labelAr || form.label || "Label", type: form.type, unit: form.unit || null, options: parseOptions(form.options), filterable: form.filterable, sortOrder: Number(form.sortOrder) || 0 }} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="Delete attribute"
        onClose={() => setDeleteTarget(null)}
        footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={remove} loading={deleting}>{t("common.delete")}</Button></>}
      >
        {deleteTarget && (
          <div className="space-y-2 text-sm text-slate-600">
            <p>Delete <span className="font-medium text-slate-900">{deleteTarget.label}</span> (<span className="font-mono text-xs">{deleteTarget.key}</span>) from {selected?.name ?? "this category"}?</p>
            <p className="text-xs text-slate-500">Product specs keep their values; the spec row and filter simply stop showing until an attribute with the same key exists again.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function AdminAttributesPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminAttributesInner />
    </Suspense>
  );
}
