"use client";

import React, { useEffect, useState } from "react";
import { SAUDI_CITIES, type Address, type AddressPayload } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { commerceApi } from "@/lib/api/commerce";
import { Alert, Button, Input, Modal, Select, Textarea } from "@/components/ui";

export type AddressFormState = { label: string; recipient: string; phone: string; city: string; district: string; street: string; building: string; notes: string; isDefault: boolean };

const EMPTY: AddressFormState = { label: "", recipient: "", phone: "", city: "", district: "", street: "", building: "", notes: "", isDefault: false };

function toForm(a: Address | null, defaults: Partial<AddressFormState>): AddressFormState {
  if (!a) return { ...EMPTY, ...defaults };
  return { label: a.label, recipient: a.recipient, phone: a.phone, city: a.city, district: a.district ?? "", street: a.street, building: a.building ?? "", notes: a.notes ?? "", isDefault: a.isDefault };
}

function toPayload(f: AddressFormState): AddressPayload {
  return {
    label: f.label.trim(),
    recipient: f.recipient.trim(),
    phone: f.phone.trim(),
    city: f.city,
    district: f.district.trim() || null,
    street: f.street.trim(),
    building: f.building.trim() || null,
    notes: f.notes.trim() || null,
    isDefault: f.isDefault,
  };
}

export function AddressFormModal({ open, address, onClose, onSaved, defaults }: { open: boolean; address: Address | null; onClose: () => void; onSaved: (a: Address) => void; defaults?: Partial<AddressFormState> }) {
  const [form, setForm] = useState<AddressFormState>(() => toForm(address, defaults ?? {}));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(toForm(address, defaults ?? {}));
      setErrors({});
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, address]);

  const set = (patch: Partial<AddressFormState>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.label.trim()) next.label = "Name this address (e.g. Main site).";
    if (!form.recipient.trim()) next.recipient = "Who receives deliveries here?";
    if (!/^\+?\d[\d\s-]{6,}$/.test(form.phone.trim())) next.phone = "Enter a valid phone number.";
    if (!form.city) next.city = "Choose a city.";
    if (form.street.trim().length < 3) next.street = "Enter the street / site address.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const saved = address ? await commerceApi.updateAddress(address.id, toPayload(form)) : await commerceApi.createAddress(toPayload(form));
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={address ? `Edit ${address.label}` : "New address"}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="address-form" loading={saving}>{address ? "Save changes" : "Add address"}</Button>
        </>
      }
    >
      <form id="address-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Input label="Address name" name="label" value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="Main site, Warehouse, Head office…" error={errors.label} required />
        <Input label="Recipient" name="recipient" value={form.recipient} onChange={(e) => set({ recipient: e.target.value })} placeholder="Site manager" error={errors.recipient} required />
        <Input label="Phone" name="phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+966 5x xxx xxxx" dir="ltr" error={errors.phone} required />
        <Select label="City" name="city" value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="Select city" options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={errors.city} required />
        <Input label="District" name="district" value={form.district} onChange={(e) => set({ district: e.target.value })} placeholder="Al Olaya" />
        <Input label="Building / unit" name="building" value={form.building} onChange={(e) => set({ building: e.target.value })} placeholder="Gate 3, Plot 12" />
        <Input label="Street / site address" name="street" value={form.street} onChange={(e) => set({ street: e.target.value })} placeholder="King Fahd Rd, next to …" className="sm:col-span-2" error={errors.street} required />
        <Textarea label="Delivery notes" name="notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Gate access, receiving hours, crane on site…" rows={2} className="sm:col-span-2" />
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
          Use as my default delivery address
        </label>
        {error && <Alert className="sm:col-span-2">{error}</Alert>}
      </form>
    </Modal>
  );
}

