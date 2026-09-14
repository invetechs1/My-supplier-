"use client";

import Link from "next/link";
import { useState } from "react";
import type { Category } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Select, Table, type Column } from "@/components/ui";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function AdminCategoriesPage() {
  const { t } = useI18n();
  const state = useAsync(() => api.categories(), []);
  const [flash, setFlash] = useFlash();
  const [form, setForm] = useState({ name: "", nameAr: "", slug: "", parentId: "", icon: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!form.nameAr.trim()) next.nameAr = "Arabic name is required.";
    if (!form.slug.trim()) next.slug = "Slug is required.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await api.adminCreateCategory({ slug: form.slug.trim(), name: form.name.trim(), nameAr: form.nameAr.trim(), parentId: form.parentId || undefined, icon: form.icon.trim() || undefined });
      setFlash({ kind: "success", message: `Category "${form.name}" created.` });
      setForm({ name: "", nameAr: "", slug: "", parentId: "", icon: "" });
      setSlugTouched(false);
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const byId = new Map((state.data ?? []).map((c) => [c.id, c]));
  const columns: Column<Category>[] = [
    { key: "icon", header: "", render: (c) => <span className="text-lg">{c.icon ?? "▦"}</span>, className: "w-10" },
    { key: "name", header: "Name", render: (c) => (
      <div>
        <Link href={`/materials?categoryId=${c.id}`} className="font-medium text-slate-900 hover:text-brand-700">{c.name}</Link>
        <p className="text-xs text-slate-500">{c.nameAr}</p>
      </div>
    ) },
    { key: "slug", header: "Slug", render: (c) => <span className="font-mono text-xs text-slate-600">{c.slug}</span> },
    { key: "parent", header: "Parent", render: (c) => (c.parentId ? byId.get(c.parentId)?.name ?? c.parentId : <span className="text-slate-400">—</span>) },
    { key: "count", header: "Materials", align: "end", render: (c) => c.materialCount ?? 0 },
  ];

  return (
    <div>
      <PageHeader title={t("admin.categories")} />
      <FlashMessage flash={flash} className="mb-4" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {state.loading ? <LoadingBlock /> : state.error ? <div className="p-5"><Alert onRetry={state.reload}>{state.error}</Alert></div> : (
            <Table columns={columns} rows={state.data ?? []} rowKey={(c) => c.id} empty={<EmptyState title="No categories yet" />} />
          )}
        </Card>
        <Card>
          <CardHeader title="New category" />
          <CardBody>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Input label="Name (English)" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })} error={errors.name} required />
              <Input label="Name (Arabic)" name="nameAr" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} error={errors.nameAr} required />
              <Input label="Slug" name="slug" dir="ltr" value={form.slug} onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: slugify(e.target.value) }); }} error={errors.slug} required />
              <Select label="Parent category" name="parentId" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} placeholder="None (top level)" options={(state.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
              <Input label="Icon (emoji)" name="icon" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🧱" />
              <Button type="submit" className="w-full" loading={saving}>Create category</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
