import React, { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import type { Branch, Carrier, CarrierCode, CreateShipmentPayload, Shipment, ShipmentStatus } from "@mysupplier/shared";
import { api, getErrorMessage } from "@/lib/api";
import { formatDate, formatDateTime, formatSar, isValidYmd } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";
import { Button } from "./Button";
import { Card, SectionHeader } from "./Card";
import { PickerField, PickerModal } from "./PickerModal";
import { StatusBadge, statusLabel } from "./StatusBadge";
import { TextField } from "./TextField";

const STEPS: Array<{ status: ShipmentStatus; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { status: "PENDING", label: "Pending", icon: "time-outline" },
  { status: "BOOKED", label: "Booked", icon: "calendar-outline" },
  { status: "PICKED_UP", label: "Picked up", icon: "cube-outline" },
  { status: "IN_TRANSIT", label: "In transit", icon: "car-outline" },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery", icon: "navigate-outline" },
  { status: "DELIVERED", label: "Delivered", icon: "home-outline" },
];
const TERMINAL: ShipmentStatus[] = ["DELIVERED", "FAILED", "CANCELLED"];
const STATUS_OPTIONS: Array<{ value: ShipmentStatus; label: string }> = [
  ...STEPS.filter((s) => s.status !== "PENDING").map((s) => ({ value: s.status, label: s.label })),
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];
const FALLBACK_CARRIERS: Array<{ value: CarrierCode; label: string }> = [
  { value: "SUPPLIER", label: "Own fleet (supplier)" },
  { value: "TRUKKER", label: "Trukker" },
  { value: "TRELLA", label: "Trella" },
  { value: "SMSA", label: "SMSA" },
  { value: "ARAMEX", label: "Aramex" },
  { value: "SPL", label: "SPL" },
  { value: "OTHER", label: "Other" },
];

type TKey = "delivery" | "trackShipment" | "createShipment" | "updateStatus" | "callDriver" | "deliveredBySupplier";

interface Props {
  orderId: string;
  /** Re-fetch shipments when this changes (order status / updatedAt). */
  version: string;
  /** Supplier of this order: may create shipments and update status. */
  canManage: boolean;
  /** Called after a shipment is created or moves to a status that changes the order (e.g. DELIVERED). */
  onOrderChanged: () => void;
  t: (k: TKey) => string;
}

function openUrl(url: string) {
  if (/^https?:/i.test(url)) WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
  else Linking.openURL(url).catch(() => undefined);
}

function callPhone(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => undefined);
}

function toNumber(v: string): number | undefined {
  const n = Number(v.replace(/,/g, "").trim());
  return Number.isFinite(n) && v.trim() !== "" ? n : undefined;
}

/** Vertical stepper for one shipment (FAILED / CANCELLED are terminal and shown as a banner). */
function ShipmentStepper({ shipment }: { shipment: Shipment }) {
  const terminalFailure = shipment.status === "FAILED" || shipment.status === "CANCELLED";
  const lastProgress = useMemo(() => {
    if (!terminalFailure) return STEPS.findIndex((s) => s.status === shipment.status);
    // Show progress up to the last non-failure status recorded in the events.
    const reached = shipment.events?.map((e) => STEPS.findIndex((s) => s.status === e.status)).filter((i) => i >= 0) ?? [];
    return reached.length ? Math.max(...reached) : 0;
  }, [shipment, terminalFailure]);

  return (
    <View>
      {terminalFailure ? (
        <View style={styles.failBanner}>
          <Ionicons name="close-circle" size={20} color={colors.danger} />
          <Text style={[typography.body, { color: colors.danger, fontWeight: "600" }]}>Shipment {statusLabel(shipment.status).toLowerCase()}</Text>
        </View>
      ) : null}
      <View style={styles.stepperRow}>
        {STEPS.map((step, i) => {
          const done = i <= lastProgress;
          const active = !terminalFailure && i === lastProgress;
          return (
            <View key={step.status} style={styles.stepCol}>
              <View style={styles.stepLineWrap}>
                <View style={[styles.stepLine, i === 0 && { opacity: 0 }, i > 0 && done && styles.stepLineDone]} />
                <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                  <Ionicons name={step.icon} size={12} color={done ? "#fff" : colors.textMuted} />
                </View>
                <View style={[styles.stepLine, i === STEPS.length - 1 && { opacity: 0 }, i < lastProgress && styles.stepLineDone]} />
              </View>
              <Text style={[styles.stepLabel, done && { color: colors.text }, active && { color: colors.primary, fontWeight: "700" }]} numberOfLines={2}>
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ShipmentCard({ shipment, canManage, onUpdate, t }: { shipment: Shipment; canManage: boolean; onUpdate: () => void; t: Props["t"] }) {
  const terminal = TERMINAL.includes(shipment.status);
  const events = [...(shipment.events ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.carrier}>
            {shipment.carrier === "SUPPLIER" ? t("deliveredBySupplier") : shipment.carrierName}
            {shipment.service ? <Text style={styles.service}> · {shipment.service}</Text> : null}
          </Text>
          {shipment.trackingNumber ? <Text style={typography.caption}>Tracking {shipment.trackingNumber}</Text> : null}
        </View>
        <StatusBadge status={shipment.status} small />
      </View>

      <ShipmentStepper shipment={shipment} />

      <View style={styles.meta}>
        {shipment.scheduledAt ? <MetaRow icon="calendar-outline" label="Scheduled" value={formatDate(shipment.scheduledAt)} /> : null}
        {shipment.deliveredAt ? <MetaRow icon="checkmark-done-outline" label="Delivered" value={formatDateTime(shipment.deliveredAt)} /> : null}
        {shipment.pickupBranch ? <MetaRow icon="storefront-outline" label="Pickup" value={`${shipment.pickupBranch.name} · ${shipment.pickupBranch.city}`} /> : null}
        {shipment.driverName || shipment.driverPhone ? <MetaRow icon="person-outline" label="Driver" value={[shipment.driverName, shipment.driverPhone].filter(Boolean).join(" · ")} /> : null}
        {shipment.vehicle ? <MetaRow icon="bus-outline" label="Vehicle" value={shipment.vehicle} /> : null}
        {typeof shipment.cost === "number" && canManage ? <MetaRow icon="cash-outline" label="Cost" value={formatSar(shipment.cost)} /> : null}
        {shipment.weightKg ? <MetaRow icon="scale-outline" label="Weight" value={`${Math.round(shipment.weightKg)} kg${shipment.volumeM3 ? ` · ${shipment.volumeM3} m³` : ""}`} /> : null}
      </View>

      <View style={styles.actions}>
        {shipment.trackingUrl ? <Button title={t("trackShipment")} icon="open-outline" variant="outline" size="sm" onPress={() => openUrl(shipment.trackingUrl as string)} /> : null}
        {shipment.driverPhone ? <Button title={t("callDriver")} icon="call-outline" variant="secondary" size="sm" onPress={() => callPhone(shipment.driverPhone as string)} /> : null}
        {canManage && !terminal ? <Button title={t("updateStatus")} icon="sync-outline" size="sm" onPress={onUpdate} /> : null}
      </View>

      {events.length ? (
        <View style={styles.timeline}>
          {events.map((e, i) => (
            <View key={e.id} style={styles.event}>
              <View style={styles.eventIndicator}>
                <View style={[styles.eventDot, i === 0 && { backgroundColor: colors.primary }]} />
                {i < events.length - 1 ? <View style={styles.eventLine} /> : null}
              </View>
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle}>{statusLabel(e.status)}</Text>
                {e.description ? <Text style={typography.bodySmall}>{e.description}</Text> : null}
                <Text style={typography.caption}>
                  {formatDateTime(e.createdAt)}
                  {e.location ? ` · ${e.location}` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function MetaRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={typography.bodySmall}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** Bottom-sheet style form modal shared by create / update. */
function FormModal({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <View style={styles.modalHeader}>
          <Text style={typography.h3}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function CreateShipmentForm({ orderId, onCreated, onClose }: { orderId: string; onCreated: (s: Shipment) => void; onClose: () => void }) {
  const carriers = useApi(() => api.carriers(), []);
  const branches = useApi(() => api.supplierBranches(), []);
  const [carrier, setCarrier] = useState<CarrierCode>("SUPPLIER");
  const [service, setService] = useState("");
  const [branchId, setBranchId] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [cost, setCost] = useState("");
  const [carrierOpen, setCarrierOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const carrierOptions = useMemo(
    () =>
      carriers.data?.length
        ? carriers.data.filter((c: Carrier) => c.enabled).map((c) => ({ value: c.code, label: c.name, subtitle: c.kind.replace(/_/g, " ").toLowerCase() + (c.supportsTracking ? " · tracking" : "") }))
        : FALLBACK_CARRIERS,
    [carriers.data],
  );
  const branchOptions = useMemo(() => (branches.data ?? []).map((b: Branch) => ({ value: b.id, label: b.name, subtitle: [b.city, b.address].filter(Boolean).join(" · ") })), [branches.data]);

  // Default the pickup branch to the company's default branch.
  useEffect(() => {
    if (!branchId && branches.data?.length) setBranchId((branches.data.find((b) => b.isDefault) ?? branches.data[0]).id);
  }, [branches.data, branchId]);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (scheduledAt.trim() && !isValidYmd(scheduledAt.trim())) next.scheduledAt = "Use YYYY-MM-DD";
    if (cost.trim() && toNumber(cost) === undefined) next.cost = "Enter a number";
    if (trackingUrl.trim() && !/^https?:\/\//i.test(trackingUrl.trim())) next.trackingUrl = "Must start with http(s)://";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    setServerError(null);
    const payload: CreateShipmentPayload = {
      carrier,
      service: service.trim() || undefined,
      trackingNumber: trackingNumber.trim() || undefined,
      trackingUrl: trackingUrl.trim() || undefined,
      pickupBranchId: branchId || undefined,
      driverName: driverName.trim() || undefined,
      driverPhone: driverPhone.trim() || undefined,
      vehicle: vehicle.trim() || undefined,
      scheduledAt: scheduledAt.trim() || undefined,
      cost: toNumber(cost),
    };
    try {
      const created = await api.createShipment(orderId, payload);
      onCreated(created);
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PickerField label="Carrier" value={carrierOptions.find((c) => c.value === carrier)?.label ?? carrier} onPress={() => setCarrierOpen(true)} />
      <TextField label="Service (optional)" value={service} onChangeText={setService} placeholder="Flatbed trailer, same-day parcel…" />
      <PickerField label="Pickup branch" value={branchOptions.find((b) => b.value === branchId)?.label} placeholder={branches.loading ? "Loading branches…" : branchOptions.length ? "Select branch" : "No branches"} onPress={() => branchOptions.length && setBranchOpen(true)} />
      <TextField label="Tracking number (optional)" value={trackingNumber} onChangeText={setTrackingNumber} autoCapitalize="characters" />
      <TextField label="Tracking URL (optional)" value={trackingUrl} onChangeText={setTrackingUrl} autoCapitalize="none" keyboardType="url" placeholder="https://" error={errors.trackingUrl} />
      <View style={styles.row2}>
        <TextField label="Driver name" value={driverName} onChangeText={setDriverName} containerStyle={{ flex: 1 }} />
        <TextField label="Driver phone" value={driverPhone} onChangeText={setDriverPhone} keyboardType="phone-pad" placeholder="05xxxxxxxx" containerStyle={{ flex: 1 }} />
      </View>
      <TextField label="Vehicle (optional)" value={vehicle} onChangeText={setVehicle} placeholder="Trailer · plate 1234 ABC" />
      <View style={styles.row2}>
        <TextField label="Scheduled date" value={scheduledAt} onChangeText={setScheduledAt} placeholder="YYYY-MM-DD" autoCapitalize="none" error={errors.scheduledAt} containerStyle={{ flex: 1 }} />
        <TextField label="Cost (SAR)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0.00" error={errors.cost} containerStyle={{ flex: 1 }} />
      </View>
      {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
      <Button title="Create shipment" icon="cube-outline" size="lg" fullWidth loading={submitting} onPress={submit} />
      <Button title="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.sm }} />

      <PickerModal visible={carrierOpen} title="Carrier" options={carrierOptions} value={carrier} onSelect={setCarrier} onClose={() => setCarrierOpen(false)} />
      <PickerModal visible={branchOpen} title="Pickup branch" options={branchOptions} value={branchId} onSelect={setBranchId} onClose={() => setBranchOpen(false)} />
    </>
  );
}

function UpdateStatusForm({ shipment, onUpdated, onClose }: { shipment: Shipment; onUpdated: (s: Shipment) => void; onClose: () => void }) {
  const currentIdx = STEPS.findIndex((s) => s.status === shipment.status);
  const suggested = STEPS[Math.min(currentIdx + 1, STEPS.length - 1)]?.status ?? "IN_TRANSIT";
  const [status, setStatus] = useState<ShipmentStatus>(suggested);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setServerError(null);
    try {
      const updated = await api.updateShipment(shipment.id, { status, description: description.trim() || undefined, location: location.trim() || undefined });
      onUpdated(updated);
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Text style={[typography.bodySmall, { marginBottom: spacing.md }]}>
        {shipment.carrierName}
        {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""} · currently {statusLabel(shipment.status).toLowerCase()}
      </Text>
      <PickerField label="New status" value={STATUS_OPTIONS.find((o) => o.value === status)?.label} onPress={() => setStatusOpen(true)} />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Left the warehouse, buyer notified…" multiline />
      <TextField label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Riyadh, Exit 18" />
      {status === "DELIVERED" ? <Text style={[typography.caption, { marginBottom: spacing.md }]}>Marking as delivered also completes the order and notifies the buyer.</Text> : null}
      {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
      <Button title="Save status" icon="checkmark-outline" size="lg" fullWidth loading={submitting} onPress={submit} variant={status === "FAILED" || status === "CANCELLED" ? "danger" : "primary"} />
      <Button title="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.sm }} />
      <PickerModal visible={statusOpen} title="Shipment status" options={STATUS_OPTIONS} value={status} onSelect={setStatus} onClose={() => setStatusOpen(false)} />
    </>
  );
}

/** "Delivery" card on the order screen: shipments with tracking, plus supplier tools. */
export function DeliverySection({ orderId, version, canManage, onOrderChanged, t }: Props) {
  const shipments = useApi(() => api.orderShipments(orderId), [orderId, version], Boolean(orderId));
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<Shipment | null>(null);
  const { setData } = shipments;

  const list = shipments.data ?? [];
  const hasOpen = list.some((s) => !TERMINAL.includes(s.status));

  return (
    <>
      <SectionHeader title={t("delivery")} actionTitle={canManage && list.length > 0 && !hasOpen ? t("createShipment") : undefined} onAction={() => setCreating(true)} />
      {list.length ? (
        list.map((s) => <ShipmentCard key={s.id} shipment={s} canManage={canManage} onUpdate={() => setUpdating(s)} t={t} />)
      ) : (
        <Card>
          {shipments.loading ? (
            <Text style={typography.bodySmall}>Loading delivery details…</Text>
          ) : shipments.error ? (
            <Text style={typography.bodySmall}>{shipments.error}</Text>
          ) : (
            <View style={styles.emptyRow}>
              <View style={styles.emptyIcon}>
                <Ionicons name="car-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { fontWeight: "600" }]}>{t("deliveredBySupplier")}</Text>
                <Text style={typography.caption}>{canManage ? "Create a shipment to share carrier, driver and tracking details with the buyer." : "Tracking details appear here once the supplier books the shipment."}</Text>
              </View>
            </View>
          )}
          {canManage && !shipments.loading ? <Button title={t("createShipment")} icon="add-circle-outline" fullWidth onPress={() => setCreating(true)} style={{ marginTop: spacing.md }} /> : null}
        </Card>
      )}

      <FormModal visible={creating} title={t("createShipment")} onClose={() => setCreating(false)}>
        {creating ? (
          <CreateShipmentForm
            orderId={orderId}
            onClose={() => setCreating(false)}
            onCreated={(created) => {
              setData((prev) => [created, ...(prev ?? []).filter((s) => s.id !== created.id)]);
              setCreating(false);
              onOrderChanged();
            }}
          />
        ) : null}
      </FormModal>

      <FormModal visible={Boolean(updating)} title={t("updateStatus")} onClose={() => setUpdating(null)}>
        {updating ? (
          <UpdateStatusForm
            shipment={updating}
            onClose={() => setUpdating(null)}
            onUpdated={(updated) => {
              setData((prev) => (prev ?? []).map((s) => (s.id === updated.id ? updated : s)));
              setUpdating(null);
              if (updated.status === "DELIVERED" || updated.status === "IN_TRANSIT" || updated.status === "PICKED_UP") onOrderChanged();
              if (updated.status === "DELIVERED") Alert.alert("Delivered", "The order is now marked as delivered and the buyer has been notified.");
            }}
          />
        ) : null}
      </FormModal>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.md },
  carrier: { ...typography.body, fontWeight: "700" },
  service: { ...typography.bodySmall, fontWeight: "400" },
  failBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.dangerLight, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.sm },
  stepperRow: { flexDirection: "row", alignItems: "flex-start" },
  stepCol: { flex: 1, alignItems: "center" },
  stepLineWrap: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border },
  stepLineDone: { backgroundColor: colors.primary },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.neutralLight, alignItems: "center", justifyContent: "center" },
  stepDotDone: { backgroundColor: colors.primary },
  stepDotActive: { borderWidth: 3, borderColor: colors.primaryLight, width: 28, height: 28, borderRadius: 14 },
  stepLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center", marginTop: 4, fontWeight: "500" },
  meta: { marginTop: spacing.md, gap: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaValue: { ...typography.body, fontWeight: "500", flex: 1, textAlign: "right" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  timeline: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  event: { flexDirection: "row", gap: spacing.md, minHeight: 40 },
  eventIndicator: { alignItems: "center", width: 16, paddingTop: 5 },
  eventDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  eventLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  eventBody: { flex: 1, paddingBottom: spacing.md },
  eventTitle: { ...typography.body, fontWeight: "600" },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  modalBody: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row2: { flexDirection: "row", gap: spacing.md },
  error: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.sm, textAlign: "center" },
});
