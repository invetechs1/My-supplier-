"use client";

import React, { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Alert, Button, Card, CardBody, CardHeader, FlashMessage, Input, LoadingBlock, PageHeader, Select } from "@/components/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function AdminSettingsPage() {
  const { t } = useI18n();
  const state = useAsync(() => api.adminSettings(), []);
  const [form, setForm] = useState({ commissionPct: "", payoutDayOfWeek: "1", lowStockThresholdDefault: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useFlash();

  useEffect(() => {
    if (state.data) setForm({ commissionPct: String(state.data.commissionPct), payoutDayOfWeek: String(state.data.payoutDayOfWeek), lowStockThresholdDefault: String(state.data.lowStockThresholdDefault) });
  }, [state.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const pct = Number(form.commissionPct);
    if (form.commissionPct === "" || Number.isNaN(pct) || pct < 0 || pct > 100) next.commissionPct = "Between 0 and 100.";
    const low = Number(form.lowStockThresholdDefault);
    if (form.lowStockThresholdDefault === "" || Number.isNaN(low) || low < 0) next.lowStockThresholdDefault = "Must be 0 or more.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      const updated = await api.adminUpdateSettings({ commissionPct: pct, payoutDayOfWeek: Number(form.payoutDayOfWeek), lowStockThresholdDefault: Math.floor(low) });
      state.setData(updated);
      setFlash({ kind: "success", message: "Settings saved." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (state.loading) return <LoadingBlock />;
  if (state.error) return <Alert onRetry={state.reload}>{state.error}</Alert>;

  return (
    <div>
      <PageHeader title={t("admin.settings")} subtitle="Platform-wide defaults. Per-company commission overrides live on each company's page." />
      <FlashMessage flash={flash} className="mb-4" />
      <form onSubmit={save} noValidate className="max-w-2xl space-y-6">
        <Card>
          <CardHeader title="Commission & payouts" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input label="Platform commission (%)" name="commissionPct" type="number" min={0} max={100} step="0.1" dir="ltr" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} error={errors.commissionPct} hint="Deducted from paid orders before payout." required />
            <Select label="Weekly payout day" name="payoutDayOfWeek" value={form.payoutDayOfWeek} onChange={(e) => setForm({ ...form, payoutDayOfWeek: e.target.value })} options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Inventory" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input label="Default low-stock threshold" name="lowStockThresholdDefault" type="number" min={0} step={1} dir="ltr" value={form.lowStockThresholdDefault} onChange={(e) => setForm({ ...form, lowStockThresholdDefault: e.target.value })} error={errors.lowStockThresholdDefault} hint="Used for suppliers that have not set their own." required />
          </CardBody>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>{t("common.save")}</Button>
        </div>
      </form>
    </div>
  );
}
