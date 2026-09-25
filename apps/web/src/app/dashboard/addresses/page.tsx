"use client";

import { useState } from "react";
import type { Address } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { commerceApi, formatAddressLine } from "@/lib/api/commerce";
import { useAuth } from "@/lib/auth";
import { useAsync, useFlash, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, LoadingBlock, PageHeader } from "@/components/ui";
import { AddressFormModal } from "./AddressFormModal";

export default function AddressesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  usePageTitle(t("dash.addresses"));
  const state = useAsync(() => commerceApi.addresses(), []);
  const [flash, setFlash] = useFlash();
  const [editing, setEditing] = useState<Address | null | undefined>(undefined); // undefined = closed, null = new
  const [busyId, setBusyId] = useState<string | null>(null);
  const addresses = state.data ?? [];

  const upsert = (saved: Address) => {
    state.setData((prev) => {
      const list = (prev ?? []).map((a) => (saved.isDefault ? { ...a, isDefault: false } : a));
      const idx = list.findIndex((a) => a.id === saved.id);
      if (idx >= 0) list[idx] = saved;
      else list.push(saved);
      return list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    });
    setEditing(undefined);
    setFlash({ kind: "success", message: "Address saved." });
  };

  const makeDefault = async (a: Address) => {
    setBusyId(a.id);
    try {
      await commerceApi.setDefaultAddress(a.id);
      state.setData((prev) => (prev ?? []).map((x) => ({ ...x, isDefault: x.id === a.id })).sort((x, y) => Number(y.isDefault) - Number(x.isDefault)));
      setFlash({ kind: "success", message: `${a.label} is now your default address.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (a: Address) => {
    if (!window.confirm(`Delete "${a.label}"?`)) return;
    setBusyId(a.id);
    try {
      await commerceApi.deleteAddress(a.id);
      state.reload();
      setFlash({ kind: "success", message: "Address deleted." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("dash.addresses")}
        subtitle="Delivery sites you can pick at checkout and for recurring orders."
        action={<Button onClick={() => setEditing(null)}>Add address</Button>}
      />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : addresses.length === 0 ? (
        <Card>
          <EmptyState title="No saved addresses" description="Save your sites and warehouses once and pick them in one click at checkout." action={<Button onClick={() => setEditing(null)}>Add your first address</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {addresses.map((a) => (
            <Card key={a.id} className={cn("flex flex-col p-5", a.isDefault && "ring-1 ring-brand-600")}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">{a.label}</h3>
                {a.isDefault && <Badge tone="blue">Default</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-800">{a.recipient}</p>
              <p className="text-sm text-slate-600">{formatAddressLine(a)}</p>
              <p className="text-sm text-slate-600" dir="ltr">{a.phone}</p>
              {a.notes && <p className="mt-2 text-xs text-slate-500">{a.notes}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <Button size="sm" variant="outline" onClick={() => setEditing(a)} disabled={busyId === a.id}>Edit</Button>
                {!a.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => makeDefault(a)} loading={busyId === a.id}>Set default</Button>
                )}
                <Button size="sm" variant="ghost" className="ms-auto text-red-600" onClick={() => remove(a)} disabled={busyId === a.id}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <AddressFormModal
        open={editing !== undefined}
        address={editing ?? null}
        onClose={() => setEditing(undefined)}
        onSaved={upsert}
        defaults={{ recipient: user?.name ?? "", phone: user?.phone ?? user?.company?.phone ?? "", city: user?.company?.city ?? "", isDefault: addresses.length === 0 }}
      />
    </div>
  );
}
