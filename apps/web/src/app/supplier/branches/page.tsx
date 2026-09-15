"use client";

import React, { useState } from "react";
import { SAUDI_CITIES, type Branch } from "@mysupplier/shared";
import { api, errorMessage, type BranchPayload } from "@/lib/api";
import { canManageCompany, companyRoleOf, useAuth } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Select, Table, type Column } from "@/components/ui";
import { RoleGuard } from "@/components/RoleGuard";

interface BranchForm {
  name: string;
  city: string;
  address: string;
  phone: string;
  isDefault: boolean;
}

const emptyForm = (city: string): BranchForm => ({ name: "", city, address: "", phone: "", isDefault: false });

function BranchesInner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const role = companyRoleOf(user);
  const canEdit = user?.role === "ADMIN" || canManageCompany(role) || role === "WAREHOUSE";
  const defaultCity = user?.company?.city ?? "Riyadh";
  const state = useAsync(() => api.branches(), []);
  const [flash, setFlash] = useFlash();
  const [modal, setModal] = useState<{ open: boolean; editing: Branch | null }>({ open: false, editing: null });
  const [form, setForm] = useState<BranchForm>(emptyForm(defaultCity));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const branches = state.data ?? [];

  const openCreate = () => {
    setForm({ ...emptyForm(defaultCity), isDefault: branches.length === 0 });
    setErrors({});
    setModal({ open: true, editing: null });
  };
  const openEdit = (b: Branch) => {
    setForm({ name: b.name, city: b.city, address: b.address ?? "", phone: b.phone ?? "", isDefault: b.isDefault });
    setErrors({});
    setModal({ open: true, editing: b });
  };
  const close = () => setModal({ open: false, editing: null });

  const save = async () => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Branch name is required.";
    if (!form.city) next.city = "Select a city.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body: BranchPayload = { name: form.name.trim(), city: form.city, address: form.address.trim() || null, phone: form.phone.trim() || null, isDefault: form.isDefault };
    setSaving(true);
    try {
      if (modal.editing) {
        const updated = await api.updateBranch(modal.editing.id, body);
        state.setData((prev) => (prev ?? []).map((b) => (b.id === updated.id ? updated : updated.isDefault ? { ...b, isDefault: false } : b)));
        setFlash({ kind: "success", message: "Branch updated." });
      } else {
        const created = await api.createBranch(body);
        state.setData((prev) => [...(prev ?? []).map((b) => (created.isDefault ? { ...b, isDefault: false } : b)), created]);
        setFlash({ kind: "success", message: "Branch added." });
      }
      close();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: Branch) => {
    if (!window.confirm(`Delete branch "${b.name}"? Listings linked to it keep working without a branch.`)) return;
    setDeleting(b.id);
    try {
      await api.deleteBranch(b.id);
      state.setData((prev) => (prev ?? []).filter((x) => x.id !== b.id));
      setFlash({ kind: "success", message: "Branch deleted." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(null);
    }
  };

  const makeDefault = async (b: Branch) => {
    try {
      const updated = await api.updateBranch(b.id, { isDefault: true });
      state.setData((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : { ...x, isDefault: false })));
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    }
  };

  const columns: Column<Branch>[] = [
    { key: "name", header: "Branch", render: (b) => (
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-900">{b.name}</span>
        {b.isDefault && <Badge tone="green">Default</Badge>}
      </div>
    ) },
    { key: "city", header: t("common.city"), render: (b) => b.city },
    { key: "address", header: "Address", render: (b) => <span className="text-slate-600">{b.address || "—"}</span> },
    { key: "phone", header: "Phone", render: (b) => <span dir="ltr">{b.phone || "—"}</span> },
    { key: "created", header: "Added", render: (b) => <span className="text-slate-500">{formatDate(b.createdAt)}</span> },
    { key: "actions", header: "", align: "end", render: (b) => canEdit ? (
      <div className="flex justify-end gap-2">
        {!b.isDefault && <Button size="sm" variant="ghost" onClick={() => makeDefault(b)}>Make default</Button>}
        <Button size="sm" variant="outline" onClick={() => openEdit(b)}>Edit</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(b)} loading={deleting === b.id}>{t("common.delete")}</Button>
      </div>
    ) : null },
  ];

  return (
    <div>
      <PageHeader title={t("sup.branches")} subtitle="Warehouses and pick-up points. Stock is tracked per branch and the default branch is printed on delivery notes." action={canEdit && <Button variant="accent" onClick={openCreate}>+ Add branch</Button>} />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          <Table columns={columns} rows={branches} rowKey={(b) => b.id} empty={<EmptyState title="No branches yet" description="Add your main warehouse to start tracking stock per location." action={canEdit && <Button onClick={openCreate}>Add first branch</Button>} />} />
        </Card>
      )}

      <Modal open={modal.open} title={modal.editing ? "Edit branch" : "Add branch"} onClose={close} footer={<><Button variant="outline" onClick={close}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>{t("common.save")}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Branch name" name="branchName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} placeholder="Main warehouse" required className="sm:col-span-2" />
          <Select label="City" name="branchCity" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={errors.city} required />
          <Input label="Phone" name="branchPhone" type="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Address" name="branchAddress" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="sm:col-span-2" placeholder="Street, district" />
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            Default branch (used for new listings and delivery notes)
          </label>
        </div>
      </Modal>
    </div>
  );
}

export default function SupplierBranchesPage() {
  return (
    <RoleGuard area="branches">
      <BranchesInner />
    </RoleGuard>
  );
}
