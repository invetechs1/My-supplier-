"use client";

import React, { useEffect, useState } from "react";
import type { Branch, Carrier, CarrierCode, CreateShipmentPayload, Shipment, ShipmentStatus } from "@mysupplier/shared";
import { api, errorMessage, type ShipmentPatch } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate, formatDateTime, formatSar, toDateTimeLocal } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, Input, LoadingBlock, Modal, Select, Textarea } from "./ui";

export const SHIPMENT_FLOW: ShipmentStatus[] = ["PENDING", "BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];
const TERMINAL: ShipmentStatus[] = ["FAILED", "CANCELLED"];
const ALL_STATUSES: ShipmentStatus[] = [...SHIPMENT_FLOW, ...TERMINAL];

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING: "Pending",
  BOOKED: "Booked",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<ShipmentStatus, "green" | "amber" | "red" | "blue" | "slate" | "purple"> = {
  PENDING: "amber",
  BOOKED: "blue",
  PICKED_UP: "blue",
  IN_TRANSIT: "purple",
  OUT_FOR_DELIVERY: "purple",
  DELIVERED: "green",
  FAILED: "red",
  CANCELLED: "red",
};

/** Fallback carrier list when GET /shipping/carriers is unavailable (codes from the shared contract). */
const FALLBACK_CARRIERS: Carrier[] = [
  { code: "SUPPLIER", name: "Supplier own fleet", nameAr: "أسطول المورد", kind: "OWN_FLEET", enabled: true, supportsTracking: false, maxWeightKg: null },
  { code: "TRUKKER", name: "Trukker", nameAr: "تراكر", kind: "HEAVY_TRUCKING", enabled: true, supportsTracking: true, maxWeightKg: null },
  { code: "TRELLA", name: "Trella", nameAr: "تريلا", kind: "HEAVY_TRUCKING", enabled: true, supportsTracking: true, maxWeightKg: null },
  { code: "SMSA", name: "SMSA Express", nameAr: "سمسا", kind: "PARCEL", enabled: true, supportsTracking: true, maxWeightKg: 30 },
  { code: "ARAMEX", name: "Aramex", nameAr: "أرامكس", kind: "PARCEL", enabled: true, supportsTracking: true, maxWeightKg: 30 },
  { code: "SPL", name: "Saudi Post (SPL)", nameAr: "سبل", kind: "PARCEL", enabled: true, supportsTracking: true, maxWeightKg: 30 },
  { code: "OTHER", name: "Other carrier", nameAr: "ناقل آخر", kind: "OWN_FLEET", enabled: true, supportsTracking: false, maxWeightKg: null },
];

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus | string }) {
  const key = status as ShipmentStatus;
  return <Badge tone={STATUS_TONE[key] ?? "slate"}>{SHIPMENT_STATUS_LABEL[key] ?? String(status).replace(/_/g, " ")}</Badge>;
}

/** Horizontal stepper PENDING → … → DELIVERED; FAILED / CANCELLED render as a terminal badge. */
export function ShipmentStepper({ status }: { status: ShipmentStatus }) {
  const terminal = TERMINAL.includes(status);
  const idx = SHIPMENT_FLOW.indexOf(status);
  return (
    <ol className="flex items-start gap-1 overflow-x-auto">
      {SHIPMENT_FLOW.map((s, i) => {
        const done = !terminal && i <= idx;
        const current = !terminal && i === idx;
        return (
          <li key={s} className="flex min-w-0 flex-1 items-start gap-1">
            <div className="flex min-w-[56px] flex-col items-center">
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ring-2", done ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-400 ring-slate-200", current && "ring-amber-500")}>
                {done && !current ? "✓" : i + 1}
              </span>
              <span className={cn("mt-1 text-center text-[10px] font-medium leading-tight", done ? "text-brand-700" : "text-slate-400")}>{SHIPMENT_STATUS_LABEL[s]}</span>
            </div>
            {i < SHIPMENT_FLOW.length - 1 && <span className={cn("mt-3 h-0.5 flex-1 rounded", !terminal && i < idx ? "bg-brand-600" : "bg-slate-200")} />}
          </li>
        );
      })}
      {terminal && (
        <li className="ms-2 mt-1">
          <ShipmentStatusBadge status={status} />
        </li>
      )}
    </ol>
  );
}

interface ShipmentForm {
  carrier: CarrierCode;
  service: string;
  pickupBranchId: string;
  trackingNumber: string;
  trackingUrl: string;
  driverName: string;
  driverPhone: string;
  vehicle: string;
  scheduledAt: string;
  cost: string;
}

const emptyForm = (carrier: CarrierCode = "SUPPLIER"): ShipmentForm => ({ carrier, service: "", pickupBranchId: "", trackingNumber: "", trackingUrl: "", driverName: "", driverPhone: "", vehicle: "", scheduledAt: "", cost: "" });

function toPayload(f: ShipmentForm): CreateShipmentPayload {
  const cost = f.cost.trim() === "" ? undefined : Number(f.cost);
  return {
    carrier: f.carrier,
    service: f.service.trim() || undefined,
    pickupBranchId: f.pickupBranchId || undefined,
    trackingNumber: f.trackingNumber.trim() || undefined,
    trackingUrl: f.trackingUrl.trim() || undefined,
    driverName: f.driverName.trim() || undefined,
    driverPhone: f.driverPhone.trim() || undefined,
    vehicle: f.vehicle.trim() || undefined,
    scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : undefined,
    cost: cost !== undefined && Number.isFinite(cost) ? cost : undefined,
  };
}

/** Create / edit booking details (supplier). */
function ShipmentFormModal({ open, editing, orderId, carriers, branches, onClose, onSaved }: { open: boolean; editing: Shipment | null; orderId: string; carriers: Carrier[]; branches: Branch[]; onClose: () => void; onSaved: (s: Shipment) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<ShipmentForm>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        carrier: editing.carrier,
        service: editing.service ?? "",
        pickupBranchId: editing.pickupBranchId ?? "",
        trackingNumber: editing.trackingNumber ?? "",
        trackingUrl: editing.trackingUrl ?? "",
        driverName: editing.driverName ?? "",
        driverPhone: editing.driverPhone ?? "",
        vehicle: editing.vehicle ?? "",
        scheduledAt: toDateTimeLocal(editing.scheduledAt),
        cost: editing.cost === null || editing.cost === undefined ? "" : String(editing.cost),
      });
    } else {
      const defaultBranch = branches.find((b) => b.isDefault) ?? branches[0];
      setForm({ ...emptyForm(carriers[0]?.code ?? "SUPPLIER"), pickupBranchId: defaultBranch?.id ?? "" });
    }
    setErrors({});
    setError(null);
  }, [open, editing, carriers, branches]);

  const carrier = carriers.find((c) => c.code === form.carrier);

  const save = async () => {
    const next: Record<string, string> = {};
    if (!form.carrier) next.carrier = "Choose a carrier.";
    if (form.cost.trim() !== "" && (Number.isNaN(Number(form.cost)) || Number(form.cost) < 0)) next.cost = "Enter a valid amount.";
    if (form.trackingUrl.trim() && !/^https?:\/\//i.test(form.trackingUrl.trim())) next.trackingUrl = "Must start with http:// or https://";
    if (form.driverPhone.trim() && !/^\+?\d[\d\s-]{6,}$/.test(form.driverPhone.trim())) next.driverPhone = "Enter a valid phone number.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(form);
      const saved = editing ? await api.updateShipment(editing.id, payload) : await api.createShipment(orderId, payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} wide title={editing ? "Edit shipment" : "Create shipment"} onClose={onClose} footer={<><Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>{editing ? t("common.save") : "Create shipment"}</Button></>}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Carrier" name="carrier" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value as CarrierCode })} options={carriers.map((c) => ({ value: c.code, label: `${c.name}${c.kind === "OWN_FLEET" ? " (own fleet)" : c.kind === "HEAVY_TRUCKING" ? " (trucking)" : " (parcel)"}` }))} error={errors.carrier} required />
          <Input label="Service" name="service" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder={carrier?.kind === "HEAVY_TRUCKING" ? "Flatbed trailer, 6-wheel truck…" : carrier?.kind === "PARCEL" ? "Same-day parcel, Express…" : "Own truck, crane truck…"} />
          <Select label="Pickup branch" name="pickupBranchId" value={form.pickupBranchId} onChange={(e) => setForm({ ...form, pickupBranchId: e.target.value })} placeholder={branches.length ? "Select branch" : "No branches"} options={branches.map((b) => ({ value: b.id, label: `${b.name} · ${b.city}${b.isDefault ? " (default)" : ""}` }))} />
          <Input label="Scheduled pickup / delivery" name="scheduledAt" type="datetime-local" dir="ltr" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          <Input label="Tracking number" name="trackingNumber" dir="ltr" value={form.trackingNumber} onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })} hint={carrier?.supportsTracking ? `${carrier.name} tracking reference` : "Optional for own-fleet deliveries"} />
          <Input label="Tracking URL" name="trackingUrl" type="url" dir="ltr" value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} error={errors.trackingUrl} placeholder="https://…" />
          <Input label="Driver name" name="driverName" value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
          <Input label="Driver phone" name="driverPhone" type="tel" dir="ltr" value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} error={errors.driverPhone} placeholder="+9665XXXXXXXX" />
          <Input label="Vehicle" name="vehicle" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="Plate number, truck type" />
          <Input label="Cost (SAR, excl. VAT)" name="cost" type="number" min={0} step="0.01" dir="ltr" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} error={errors.cost} />
        </div>
      </div>
    </Modal>
  );
}

/** Status transition with an event (description + location). */
function StatusModal({ shipment, onClose, onSaved }: { shipment: Shipment | null; onClose: () => void; onSaved: (s: Shipment) => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ShipmentStatus>("BOOKED");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!shipment) return;
    const idx = SHIPMENT_FLOW.indexOf(shipment.status);
    setStatus(idx >= 0 && idx < SHIPMENT_FLOW.length - 1 ? SHIPMENT_FLOW[idx + 1] : shipment.status);
    setDescription("");
    setLocation("");
    setError(null);
  }, [shipment]);

  const save = async () => {
    if (!shipment) return;
    setSaving(true);
    setError(null);
    try {
      const body: ShipmentPatch = { status, description: description.trim() || undefined, location: location.trim() || undefined };
      onSaved(await api.updateShipment(shipment.id, body));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!shipment} title="Update shipment status" onClose={onClose} footer={<><Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>Update</Button></>}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {shipment && <p className="text-sm text-slate-600">Current status: <ShipmentStatusBadge status={shipment.status} /></p>}
        <Select label="New status" name="shipmentStatus" value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus)} options={ALL_STATUSES.map((s) => ({ value: s, label: SHIPMENT_STATUS_LABEL[s] }))} />
        {status === "DELIVERED" && <Alert kind="info">Marking the shipment delivered also marks the order DELIVERED and notifies the buyer.</Alert>}
        <Input label="Location" name="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Riyadh – Exit 18 warehouse" />
        <Textarea label="Description" name="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown to the buyer on the tracking timeline (optional)" />
      </div>
    </Modal>
  );
}

function trackingHref(s: Shipment): string | null {
  if (s.trackingUrl) return s.trackingUrl;
  return null;
}

function ShipmentCard({ shipment, canManage, onEdit, onStatus }: { shipment: Shipment; canManage: boolean; onEdit: () => void; onStatus: () => void }) {
  const { lang } = useI18n();
  const s = shipment;
  const href = trackingHref(s);
  const events = [...(s.events ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const terminal = TERMINAL.includes(s.status) || s.status === "DELIVERED";
  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{s.carrierName || s.carrier}</span>
          {s.service && <span className="text-sm text-slate-500">· {s.service}</span>}
          <ShipmentStatusBadge status={s.status} />
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>Edit details</Button>
            {!terminal && <Button size="sm" onClick={onStatus}>Update status</Button>}
          </div>
        )}
      </div>
      <ShipmentStepper status={s.status} />
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-slate-500">Tracking number</dt>
          <dd className="font-medium text-slate-900" dir="ltr">
            {s.trackingNumber ? (
              href ? (
                <a href={href} target="_blank" rel="noreferrer" className="font-mono text-brand-700 hover:underline">{s.trackingNumber} ↗</a>
              ) : (
                <span className="font-mono">{s.trackingNumber}</span>
              )
            ) : href ? (
              <a href={href} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Track shipment ↗</a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div><dt className="text-slate-500">Driver</dt><dd className="font-medium text-slate-900">{s.driverName ?? "—"}{s.driverPhone && <a href={`tel:${s.driverPhone}`} className="ms-2 font-normal text-brand-700 hover:underline" dir="ltr">{s.driverPhone}</a>}</dd></div>
        <div><dt className="text-slate-500">Vehicle</dt><dd className="font-medium text-slate-900">{s.vehicle ?? "—"}</dd></div>
        <div><dt className="text-slate-500">Scheduled</dt><dd className="font-medium text-slate-900">{s.scheduledAt ? formatDateTime(s.scheduledAt, lang) : "—"}</dd></div>
        <div><dt className="text-slate-500">Pickup from</dt><dd className="font-medium text-slate-900">{s.pickupBranch ? `${s.pickupBranch.name} · ${s.pickupBranch.city}` : "—"}</dd></div>
        <div><dt className="text-slate-500">{s.deliveredAt ? "Delivered" : "Cost"}</dt><dd className="font-medium text-slate-900">{s.deliveredAt ? formatDateTime(s.deliveredAt, lang) : s.cost !== null && s.cost !== undefined ? formatSar(s.cost, lang) : "—"}</dd></div>
        {(s.weightKg || s.volumeM3) && <div><dt className="text-slate-500">Load</dt><dd className="font-medium text-slate-900">{s.weightKg ? `${Math.round(s.weightKg)} kg` : ""}{s.weightKg && s.volumeM3 ? " · " : ""}{s.volumeM3 ? `${s.volumeM3.toFixed(2)} m³` : ""}</dd></div>}
      </dl>
      {events.length > 0 && (
        <ol className="mt-4 space-y-0 border-t border-slate-100 pt-4">
          {events.map((e, i) => (
            <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
              {i < events.length - 1 && <span className="absolute start-[5px] top-4 h-[calc(100%-0.5rem)] w-px bg-slate-200" aria-hidden />}
              <span className={cn("relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-2 ring-white", i === 0 ? "bg-brand-600" : "bg-slate-300")} aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-slate-900">
                  {SHIPMENT_STATUS_LABEL[e.status] ?? e.status}
                  {e.location && <span className="font-normal text-slate-500"> · {e.location}</span>}
                </p>
                {e.description && <p className="text-slate-600">{e.description}</p>}
                <p className="text-xs text-slate-400" title={formatDateTime(e.createdAt, lang)}>{formatDate(e.createdAt, lang)} · {new Date(e.createdAt).toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * "Delivery" card on the order page: shipments from GET /orders/:id/shipments with tracking and a timeline.
 * Suppliers can create shipments and update their status; buyers and admins see read-only tracking.
 */
export function OrderShipments({ orderId, canManage, onDelivered, onChanged }: { orderId: string; canManage: boolean; onDelivered?: () => void; onChanged?: () => void }) {
  const { t } = useI18n();
  const state = useAsync(() => api.orderShipments(orderId), [orderId]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [statusTarget, setStatusTarget] = useState<Shipment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    api
      .carriers()
      .then((list) => {
        if (!active) return;
        const enabled = list.filter((c) => c.enabled);
        setCarriers(enabled.length ? enabled : FALLBACK_CARRIERS);
      })
      .catch(() => {
        if (active) setCarriers(FALLBACK_CARRIERS);
      });
    api
      .branches()
      .then((b) => {
        if (active) setBranches(b);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [canManage]);

  const upsert = (saved: Shipment) => {
    state.setData((prev) => {
      const list = prev ?? [];
      return list.some((s) => s.id === saved.id) ? list.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...list];
    });
    onChanged?.();
    if (saved.status === "DELIVERED") {
      setNotice("Shipment delivered — the order has been marked delivered.");
      onDelivered?.();
    } else {
      setNotice(null);
    }
  };

  const shipments = state.data ?? [];

  return (
    <Card>
      <CardHeader
        title={t("order.delivery")}
        subtitle={shipments.length ? `${shipments.length} ${shipments.length === 1 ? "shipment" : "shipments"}` : canManage ? "Book a carrier or dispatch with your own fleet." : "Tracking appears here once the supplier dispatches."}
        action={
          canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              + Create shipment
            </Button>
          ) : undefined
        }
      />
      {notice && (
        <div className="px-5 pt-4">
          <Alert kind="success">{notice}</Alert>
        </div>
      )}
      {state.loading ? (
        <LoadingBlock className="py-6" />
      ) : state.error ? (
        <div className="px-5 py-4">
          <Alert kind="info" onRetry={state.reload}>{state.error}</Alert>
        </div>
      ) : shipments.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">No shipments yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {shipments.map((s) => (
            <ShipmentCard
              key={s.id}
              shipment={s}
              canManage={canManage}
              onEdit={() => {
                setEditing(s);
                setFormOpen(true);
              }}
              onStatus={() => setStatusTarget(s)}
            />
          ))}
        </div>
      )}
      {canManage && <ShipmentFormModal open={formOpen} editing={editing} orderId={orderId} carriers={carriers.length ? carriers : FALLBACK_CARRIERS} branches={branches} onClose={() => setFormOpen(false)} onSaved={upsert} />}
      {canManage && <StatusModal shipment={statusTarget} onClose={() => setStatusTarget(null)} onSaved={upsert} />}
    </Card>
  );
}
