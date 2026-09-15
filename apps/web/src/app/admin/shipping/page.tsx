"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SAUDI_CITIES, type Carrier, type CarrierCode, type DeliveryQuote, type Material, type ShippingRate } from "@mysupplier/shared";
import { api, errorMessage, type ShippingRatePayload } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Select, Table, Toggle, type Column } from "@/components/ui";
import { MaterialAutocomplete } from "@/components/MaterialAutocomplete";
import { QuoteOptionList, ZONE_LABEL, etaLabel } from "@/components/shop/DeliveryOptions";

const CARRIER_CODES: CarrierCode[] = ["SUPPLIER", "TRUKKER", "TRELLA", "SMSA", "ARAMEX", "SPL", "OTHER"];
const ZONES: ShippingRate["zone"][] = ["SAME_CITY", "SAME_REGION", "NATIONAL"];
const KIND_LABEL: Record<Carrier["kind"], string> = { OWN_FLEET: "Own fleet", HEAVY_TRUCKING: "Heavy trucking", PARCEL: "Parcel" };

interface RateForm {
  carrier: CarrierCode;
  zone: ShippingRate["zone"];
  service: string;
  baseFee: string;
  includedKg: string;
  perKg: string;
  perM3: string;
  minFee: string;
  maxWeightKg: string;
  etaDays: string;
  enabled: boolean;
}

const emptyRate = (carrier: CarrierCode = "SUPPLIER"): RateForm => ({ carrier, zone: "SAME_CITY", service: "", baseFee: "", includedKg: "0", perKg: "0", perM3: "0", minFee: "0", maxWeightKg: "", etaDays: "1", enabled: true });

function rateToForm(r: ShippingRate): RateForm {
  return {
    carrier: r.carrier,
    zone: r.zone,
    service: r.service,
    baseFee: String(r.baseFee),
    includedKg: String(r.includedKg),
    perKg: String(r.perKg),
    perM3: String(r.perM3),
    minFee: String(r.minFee),
    maxWeightKg: r.maxWeightKg === null || r.maxWeightKg === undefined ? "" : String(r.maxWeightKg),
    etaDays: String(r.etaDays),
    enabled: r.enabled,
  };
}

function num(v: string): number {
  return Number(v.trim());
}

/** Inline widget: pick a material + quantity and a route, call POST /shipping/quote and list the resulting options. */
function TestQuoteWidget({ carriers }: { carriers: Carrier[] }) {
  const { lang } = useI18n();
  const [material, setMaterial] = useState<Material | null>(null);
  const [quantity, setQuantity] = useState("10");
  const [pickupCity, setPickupCity] = useState("Riyadh");
  const [deliveryCity, setDeliveryCity] = useState("Jeddah");
  const [result, setResult] = useState<DeliveryQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<CarrierCode | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return setError("Pick a material to quote.");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return setError("Quantity must be greater than zero.");
    setBusy(true);
    setError(null);
    try {
      const quotes = await api.shippingQuote({ items: [{ materialId: material.id, quantity: qty }], deliveryCity, pickupCity: pickupCity || undefined });
      setResult(quotes);
      setSelected(quotes[0]?.carrier ?? null);
    } catch (err) {
      setError(errorMessage(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const weight = result?.[0]?.weightKg ?? null;
  const volume = result?.[0]?.volumeM3 ?? null;
  const zone = result?.[0]?.zone ?? null;
  const disabledCarriers = carriers.filter((c) => !c.enabled).map((c) => c.name);

  return (
    <Card>
      <CardHeader title="Test quote" subtitle="Runs the real quoting engine (rate cards × material weight/volume × zone) for a material and route." />
      <CardBody>
        <form onSubmit={run} className="grid gap-4 sm:grid-cols-2" noValidate>
          <MaterialAutocomplete label="Material" value={material} onChange={setMaterial} className="sm:col-span-2" required />
          <Input label={`Quantity${material ? ` (${material.unit})` : ""}`} name="testQty" type="number" min={0.01} step="0.01" dir="ltr" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Pickup city" name="testPickup" value={pickupCity} onChange={(e) => setPickupCity(e.target.value)} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} />
            <Select label="Delivery city" name="testDelivery" value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} />
          </div>
          {error && <Alert className="sm:col-span-2">{error}</Alert>}
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy}>Get quotes</Button>
          </div>
        </form>
        {result && (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {zone && <Badge tone="slate">{ZONE_LABEL[zone]}</Badge>}
              {weight !== null && <Badge tone="slate">{Math.round(weight)} kg</Badge>}
              {volume !== null && <Badge tone="slate">{volume.toFixed(3)} m³</Badge>}
              {result.length === 0 && <span>No rate card matched this route/load — check zones, max weight and enabled flags below.</span>}
              {weight === 0 && result.length > 0 && <span className="text-amber-700">Weight is 0 kg: set weightKg on the material so per-kg pricing applies.</span>}
            </div>
            {result.length > 0 && <QuoteOptionList quotes={result} selected={selected} onSelect={setSelected} />}
            {disabledCarriers.length > 0 && <p className="text-xs text-slate-400">Disabled carriers never quote: {disabledCarriers.join(", ")}.</p>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function AdminShippingPage() {
  const { t, lang } = useI18n();
  const carriers = useAsync(() => api.carriers(), []);
  const rates = useAsync(() => api.adminShippingRates(), []);
  const [flash, setFlash] = useFlash();
  const [modal, setModal] = useState<{ open: boolean; editing: ShippingRate | null }>({ open: false, editing: null });
  const [form, setForm] = useState<RateForm>(emptyRate());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [carrierFilter, setCarrierFilter] = useState<CarrierCode | "">("");

  const carrierName = useMemo(() => {
    const map: Record<string, string> = {};
    (carriers.data ?? []).forEach((c) => {
      map[c.code] = c.name;
    });
    return (code: CarrierCode) => map[code] ?? code;
  }, [carriers.data]);

  useEffect(() => {
    if (!modal.open) return;
    setForm(modal.editing ? rateToForm(modal.editing) : emptyRate(carriers.data?.[0]?.code ?? "SUPPLIER"));
    setErrors({});
  }, [modal, carriers.data]);

  const close = () => setModal({ open: false, editing: null });

  const save = async () => {
    const next: Record<string, string> = {};
    if (!form.service.trim()) next.service = "Service name is required (e.g. Flatbed trailer).";
    (["baseFee", "includedKg", "perKg", "perM3", "minFee"] as const).forEach((k) => {
      if (form[k].trim() === "" || Number.isNaN(num(form[k])) || num(form[k]) < 0) next[k] = "Enter 0 or more.";
    });
    if (form.maxWeightKg.trim() !== "" && (Number.isNaN(num(form.maxWeightKg)) || num(form.maxWeightKg) <= 0)) next.maxWeightKg = "Leave blank for no limit, or a positive number.";
    if (form.etaDays.trim() === "" || Number.isNaN(num(form.etaDays)) || num(form.etaDays) < 0) next.etaDays = "Enter the ETA in days (0 = same day).";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const payload: ShippingRatePayload = {
      carrier: form.carrier,
      zone: form.zone,
      service: form.service.trim(),
      baseFee: num(form.baseFee),
      includedKg: num(form.includedKg),
      perKg: num(form.perKg),
      perM3: num(form.perM3),
      minFee: num(form.minFee),
      maxWeightKg: form.maxWeightKg.trim() === "" ? null : num(form.maxWeightKg),
      etaDays: Math.round(num(form.etaDays)),
      enabled: form.enabled,
    };
    setSaving(true);
    try {
      if (modal.editing) {
        const updated = await api.adminUpdateShippingRate(modal.editing.id, payload);
        rates.setData((prev) => (prev ?? []).map((r) => (r.id === updated.id ? updated : r)));
        setFlash({ kind: "success", message: "Rate card updated." });
      } else {
        const created = await api.adminCreateShippingRate(payload);
        rates.setData((prev) => [created, ...(prev ?? [])]);
        setFlash({ kind: "success", message: "Rate card created." });
      }
      close();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (r: ShippingRate) => {
    setBusyId(r.id);
    try {
      const updated = await api.adminUpdateShippingRate(r.id, { enabled: !r.enabled });
      rates.setData((prev) => (prev ?? []).map((x) => (x.id === r.id ? { ...x, ...updated } : x)));
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: ShippingRate) => {
    if (!window.confirm(`Delete the ${carrierName(r.carrier)} · ${r.service} · ${ZONE_LABEL[r.zone]} rate card?`)) return;
    setBusyId(r.id);
    try {
      await api.adminDeleteShippingRate(r.id);
      rates.setData((prev) => (prev ?? []).filter((x) => x.id !== r.id));
      setFlash({ kind: "success", message: "Rate card deleted." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const carrierColumns: Column<Carrier>[] = [
    { key: "name", header: "Carrier", render: (c) => <div><p className="font-medium text-slate-900">{c.name}</p><p className="text-xs text-slate-500" dir="rtl">{c.nameAr}</p></div> },
    { key: "code", header: "Code", render: (c) => <span className="font-mono text-xs text-slate-600">{c.code}</span> },
    { key: "kind", header: "Type", render: (c) => <Badge tone={c.kind === "HEAVY_TRUCKING" ? "purple" : c.kind === "PARCEL" ? "blue" : "slate"}>{KIND_LABEL[c.kind] ?? c.kind}</Badge> },
    { key: "tracking", header: "Tracking", render: (c) => (c.supportsTracking ? <Badge tone="green">API tracking</Badge> : <span className="text-xs text-slate-500">Manual</span>) },
    { key: "max", header: "Max weight", align: "end", render: (c) => (c.maxWeightKg ? `${c.maxWeightKg} kg` : "—") },
    { key: "enabled", header: t("common.status"), render: (c) => (c.enabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="slate">Disabled</Badge>) },
    { key: "rates", header: "Rate cards", align: "end", render: (c) => (rates.data ?? []).filter((r) => r.carrier === c.code).length },
  ];

  const visibleRates = (rates.data ?? []).filter((r) => !carrierFilter || r.carrier === carrierFilter);
  const rateColumns: Column<ShippingRate>[] = [
    { key: "carrier", header: "Carrier", render: (r) => <div><p className="font-medium text-slate-900">{carrierName(r.carrier)}</p><p className="text-xs text-slate-500">{r.service}</p></div> },
    { key: "zone", header: "Zone", render: (r) => <Badge tone="slate">{ZONE_LABEL[r.zone]}</Badge> },
    { key: "base", header: "Base fee", align: "end", render: (r) => <span className="tabular-nums">{formatSar(r.baseFee, lang)}</span> },
    { key: "kg", header: "Included / per kg", align: "end", render: (r) => <span className="tabular-nums">{r.includedKg} kg · {formatSar(r.perKg, lang)}</span> },
    { key: "m3", header: "Per m³", align: "end", render: (r) => <span className="tabular-nums">{formatSar(r.perM3, lang)}</span> },
    { key: "min", header: "Min fee", align: "end", render: (r) => <span className="tabular-nums">{formatSar(r.minFee, lang)}</span> },
    { key: "max", header: "Max weight", align: "end", render: (r) => (r.maxWeightKg ? `${r.maxWeightKg} kg` : "—") },
    { key: "eta", header: "ETA", align: "end", render: (r) => etaLabel(r.etaDays) },
    { key: "enabled", header: "Enabled", render: (r) => <Toggle checked={r.enabled} onChange={() => toggleEnabled(r)} disabled={busyId === r.id} label={`Enable ${r.service}`} /> },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setModal({ open: true, editing: r })}>Edit</Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r)} loading={busyId === r.id}>{t("common.delete")}</Button>
        </div>
      ),
    },
  ];

  const carrierOptions = (carriers.data?.length ? carriers.data.map((c) => c.code) : CARRIER_CODES).map((code) => ({ value: code, label: carrierName(code) }));

  return (
    <div>
      <PageHeader title={t("admin.shipping")} subtitle="Carriers and rate cards that price delivery at checkout: fee = max(minFee, baseFee + perKg × (kg − includedKg) + perM3 × m³) per zone." action={<Button variant="accent" onClick={() => setModal({ open: true, editing: null })}>+ New rate card</Button>} />
      <FlashMessage flash={flash} className="mb-4" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Carriers" subtitle="Integrated through the API's carrier adapters. Booking/tracking calls the carrier when its credentials are configured; otherwise suppliers manage shipments manually." />
            {carriers.loading ? <LoadingBlock /> : carriers.error ? <div className="p-5"><Alert onRetry={carriers.reload}>{carriers.error}</Alert></div> : <Table columns={carrierColumns} rows={carriers.data ?? []} rowKey={(c) => c.code} dense empty={<EmptyState title="No carriers" description="The API returned no carriers." />} />}
          </Card>

          <Card>
            <CardHeader
              title="Rate cards"
              subtitle={`${visibleRates.length} of ${(rates.data ?? []).length} cards`}
              action={<Select name="carrierFilter" value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value as CarrierCode | "")} placeholder="All carriers" options={carrierOptions} className="w-48" />}
            />
            {rates.loading ? <LoadingBlock /> : rates.error ? <div className="p-5"><Alert onRetry={rates.reload}>{rates.error}</Alert></div> : <Table columns={rateColumns} rows={visibleRates} rowKey={(r) => r.id} dense empty={<EmptyState title="No rate cards" description="Create a card per carrier, zone and service." action={<Button onClick={() => setModal({ open: true, editing: null })}>New rate card</Button>} />} />}
          </Card>
        </div>

        <div className="xl:sticky xl:top-24 xl:h-fit">
          <TestQuoteWidget carriers={carriers.data ?? []} />
        </div>
      </div>

      <Modal open={modal.open} wide title={modal.editing ? `Edit rate card · ${carrierName(modal.editing.carrier)}` : "New rate card"} onClose={close} footer={<><Button variant="outline" onClick={close} disabled={saving}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>{t("common.save")}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Carrier" name="rateCarrier" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value as CarrierCode })} options={carrierOptions} required />
          <Select label="Zone" name="rateZone" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value as ShippingRate["zone"] })} options={ZONES.map((z) => ({ value: z, label: ZONE_LABEL[z] }))} required />
          <Input label="Service" name="rateService" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} error={errors.service} placeholder="Flatbed trailer, Same-day parcel…" className="sm:col-span-2" required />
          <Input label="Base fee (SAR)" name="rateBase" type="number" min={0} step="0.01" dir="ltr" value={form.baseFee} onChange={(e) => setForm({ ...form, baseFee: e.target.value })} error={errors.baseFee} required />
          <Input label="Min fee (SAR)" name="rateMin" type="number" min={0} step="0.01" dir="ltr" value={form.minFee} onChange={(e) => setForm({ ...form, minFee: e.target.value })} error={errors.minFee} required />
          <Input label="Included kg" name="rateIncluded" type="number" min={0} step="1" dir="ltr" value={form.includedKg} onChange={(e) => setForm({ ...form, includedKg: e.target.value })} error={errors.includedKg} hint="Weight covered by the base fee" required />
          <Input label="Per kg above included (SAR)" name="ratePerKg" type="number" min={0} step="0.01" dir="ltr" value={form.perKg} onChange={(e) => setForm({ ...form, perKg: e.target.value })} error={errors.perKg} required />
          <Input label="Per m³ (SAR)" name="ratePerM3" type="number" min={0} step="0.01" dir="ltr" value={form.perM3} onChange={(e) => setForm({ ...form, perM3: e.target.value })} error={errors.perM3} required />
          <Input label="Max weight (kg)" name="rateMax" type="number" min={0} step="1" dir="ltr" value={form.maxWeightKg} onChange={(e) => setForm({ ...form, maxWeightKg: e.target.value })} error={errors.maxWeightKg} hint="Blank = no limit" />
          <Input label="ETA (days)" name="rateEta" type="number" min={0} step="1" dir="ltr" value={form.etaDays} onChange={(e) => setForm({ ...form, etaDays: e.target.value })} error={errors.etaDays} required />
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 sm:mt-6">
            <span className="text-sm font-medium text-slate-700">Enabled</span>
            <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Enabled" />
          </label>
        </div>
      </Modal>
    </div>
  );
}
