import React, { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import type { InventoryItem, StockMovement, StockMovementType } from "@mysupplier/shared";
import { Screen, Button, Card, SectionHeader, KeyValue, TextField, LoadingView, ErrorView, RequireAuth, ProductImage } from "@/components";
import { api, getErrorMessage, type StockMovementInput } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatSar } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

type AdjustType = StockMovementInput["type"];
const ADJUST_TYPES: Array<{ value: AdjustType; label: string; hint: string }> = [
  { value: "IN", label: "Stock in", hint: "Received goods" },
  { value: "OUT", label: "Stock out", hint: "Sold / damaged" },
  { value: "ADJUST", label: "Adjust", hint: "Set a new level" },
];

const MOVEMENT_ICON: Record<StockMovementType, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  IN: { icon: "arrow-down-circle", color: colors.success, bg: colors.successLight },
  OUT: { icon: "arrow-up-circle", color: colors.danger, bg: colors.dangerLight },
  ADJUST: { icon: "options", color: colors.info, bg: colors.infoLight },
  RESERVE: { icon: "lock-closed", color: colors.warning, bg: colors.warningLight },
  RELEASE: { icon: "lock-open", color: colors.textSecondary, bg: colors.neutralLight },
};

interface Detail {
  item: InventoryItem | null;
  movements: StockMovement[];
}

async function loadDetail(listingId: string, q?: string): Promise<Detail> {
  // The contract has no single-item GET; find the listing in the inventory list
  // (narrowed by the product name when the list screen passed it along).
  const [movements, page] = await Promise.all([
    api.stockMovements(listingId),
    api.inventory({ q: q || undefined, page: 1 }).catch(() => null),
  ]);
  let item = page?.data.find((i) => i.listing.id === listingId) ?? null;
  if (!item && q) {
    const all = await api.inventory({ page: 1 }).catch(() => null);
    item = all?.data.find((i) => i.listing.id === listingId) ?? null;
  }
  if (!item && page && page.total > page.pageSize) {
    const pages = Math.min(Math.ceil(page.total / page.pageSize), 10);
    for (let p = 2; p <= pages && !item; p += 1) {
      const res = await api.inventory({ page: p });
      item = res.data.find((i) => i.listing.id === listingId) ?? null;
    }
  }
  return { item, movements };
}

function InventoryDetailContent() {
  const { listingId, q } = useLocalSearchParams<{ listingId: string; q?: string }>();
  const { t } = useI18n();
  const { data, loading, error, refreshing, reload, refresh, setData } = useApi(() => loadDetail(listingId, q), [listingId], Boolean(listingId));
  const [stockInput, setStockInput] = useState<string | null>(null);
  const [savingStock, setSavingStock] = useState(false);
  const [type, setType] = useState<AdjustType>("IN");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const item = data?.item ?? null;
  const currentStock = item?.stock ?? null;
  const stockValue = stockInput ?? (currentStock === null ? "" : String(currentStock));

  const applyItem = useCallback(
    (next: InventoryItem | null, movement?: StockMovement) => {
      setData((prev) => ({
        item: next ?? prev?.item ?? null,
        movements: movement ? [movement, ...(prev?.movements ?? [])] : prev?.movements ?? [],
      }));
    },
    [setData],
  );

  const saveStock = async () => {
    const trimmed = stockValue.trim();
    const stock = trimmed === "" ? null : Number(trimmed);
    if (stock !== null && (Number.isNaN(stock) || stock < 0)) {
      Alert.alert("Invalid stock", "Enter a whole number, or leave empty to stop tracking.");
      return;
    }
    setSavingStock(true);
    try {
      const updated = await api.setInventory(listingId, { stock });
      applyItem(updated);
      setStockInput(null);
      // The PATCH records an ADJUST movement server-side; reload history quietly.
      api.stockMovements(listingId).then((movements) => setData((prev) => (prev ? { ...prev, movements } : prev))).catch(() => undefined);
    } catch (err) {
      Alert.alert("Could not update stock", getErrorMessage(err));
    } finally {
      setSavingStock(false);
    }
  };

  const submitMovement = async () => {
    const quantity = Number(qty);
    if (!qty || Number.isNaN(quantity) || quantity < 0 || (type !== "ADJUST" && quantity === 0)) {
      Alert.alert("Invalid quantity", "Enter a quantity greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const movement = await api.addStockMovement(listingId, { type, quantity, reason: reason.trim() || undefined });
      const nextStock = movement.balanceAfter ?? (currentStock === null ? null : type === "IN" ? currentStock + quantity : type === "OUT" ? Math.max(0, currentStock - quantity) : quantity);
      applyItem(
        item
          ? { ...item, stock: nextStock, available: nextStock === null ? null : Math.max(0, nextStock - item.reserved) }
          : null,
        movement,
      );
      setQty("");
      setReason("");
    } catch (err) {
      Alert.alert("Could not record movement", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (error && !data) {
    return (
      <Screen>
        <ErrorView message={error} onRetry={reload} />
      </Screen>
    );
  }

  const listing = item?.listing;
  const title = listing?.material?.name ?? "Listing";

  return (
    <Screen scroll keyboard refreshing={refreshing} onRefresh={refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title }} />
      <Card style={{ marginTop: spacing.lg }}>
        <View style={styles.head}>
          {listing?.material ? <ProductImage material={listing.material} size={56} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>{title}</Text>
            <Text style={typography.caption}>
              {listing ? `${listing.branch ? `${listing.branch.name} · ` : ""}${listing.city} · ${formatSar(listing.price)} / ${listing.material?.unit ?? "unit"}` : `Listing ${listingId}`}
            </Text>
          </View>
          {item?.lowStock ? (
            <View style={styles.lowBadge}>
              <Text style={styles.lowBadgeText}>{t("lowStock")}</Text>
            </View>
          ) : null}
        </View>
        {item ? (
          <View style={styles.stats}>
            <Stat label={t("stock")} value={item.stock === null ? t("onRequest") : String(item.stock)} danger={item.lowStock} />
            <Stat label="Reserved" value={String(item.reserved)} />
            <Stat label="Available" value={item.available === null ? "—" : String(item.available)} />
            <Stat label="Sold 30d" value={String(item.soldLast30d)} />
          </View>
        ) : (
          <Text style={[typography.bodySmall, { marginTop: spacing.sm }]}>Listing details unavailable; you can still record movements below.</Text>
        )}
      </Card>

      <SectionHeader title="Set stock level" />
      <Card>
        <TextField
          label="Stock on hand"
          value={stockValue}
          onChangeText={(v) => setStockInput(v.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="Leave empty to stop tracking"
          hint="Saving records an ADJUST movement to the new level."
          right={
            stockInput !== null && stockInput !== (currentStock === null ? "" : String(currentStock)) ? (
              <Pressable onPress={() => setStockInput(null)} hitSlop={8}>
                <Ionicons name="refresh" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null
          }
        />
        <Button title="Save stock" loading={savingStock} onPress={saveStock} fullWidth disabled={stockInput === null || stockInput === (currentStock === null ? "" : String(currentStock))} />
      </Card>

      <SectionHeader title="Record movement" />
      <Card>
        <View style={styles.segment}>
          {ADJUST_TYPES.map((opt) => {
            const active = type === opt.value;
            return (
              <Pressable key={opt.value} onPress={() => setType(opt.value)} style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
                <Text style={[typography.caption, active && { color: "rgba(255,255,255,0.8)" }]}>{opt.hint}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextField
          label={type === "ADJUST" ? "New level" : "Quantity"}
          value={qty}
          onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="0"
        />
        <TextField label="Reason (optional)" value={reason} onChangeText={setReason} placeholder={type === "IN" ? "Delivery from factory" : type === "OUT" ? "Damaged / manual sale" : "Stock count"} />
        <Button title={`Record ${type === "IN" ? "stock in" : type === "OUT" ? "stock out" : "adjustment"}`} icon="add-circle-outline" loading={saving} onPress={submitMovement} fullWidth />
      </Card>

      <SectionHeader title="Movement history" />
      <Card style={{ paddingVertical: spacing.xs }}>
        {data?.movements.length ? (
          data.movements.map((m, i) => {
            const meta = MOVEMENT_ICON[m.type] ?? MOVEMENT_ICON.ADJUST;
            const sign = m.type === "IN" || m.type === "RELEASE" ? "+" : m.type === "OUT" || m.type === "RESERVE" ? "−" : "=";
            return (
              <View key={m.id} style={[styles.movement, i > 0 && styles.movementBorder]}>
                <View style={[styles.movementIcon, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.movementTitle}>
                    {m.type.charAt(0) + m.type.slice(1).toLowerCase()}
                    {m.order?.reference ? ` · ${m.order.reference}` : ""}
                  </Text>
                  <Text style={typography.caption} numberOfLines={2}>
                    {formatDateTime(m.createdAt)}
                    {m.user?.name ? ` · ${m.user.name}` : ""}
                    {m.reason ? ` · ${m.reason}` : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.movementQty, { color: meta.color }]}>
                    {sign}
                    {m.quantity}
                  </Text>
                  {m.balanceAfter !== null && m.balanceAfter !== undefined ? <Text style={typography.caption}>bal. {m.balanceAfter}</Text> : null}
                </View>
              </View>
            );
          })
        ) : (
          <Text style={[typography.bodySmall, { paddingVertical: spacing.sm }]}>No movements recorded yet.</Text>
        )}
      </Card>
      {listing ? (
        <View style={{ marginTop: spacing.sm }}>
          <KeyValue label="Listing id" value={listing.id} />
          {listing.material?.sku ? <KeyValue label="SKU" value={listing.material.sku} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[styles.statValue, danger && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}

export default function InventoryDetailScreen() {
  return (
    <RequireAuth roles={["SUPPLIER"]} message="Only supplier accounts can manage inventory.">
      <InventoryDetailContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stats: { flexDirection: "row", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  statValue: { fontSize: 17, fontWeight: "700", color: colors.text, marginTop: 2 },
  lowBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.dangerLight },
  lowBadgeText: { fontSize: 11, fontWeight: "700", color: colors.danger },
  segment: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  segmentBtn: { flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.neutralLight, alignItems: "center" },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  segmentTextActive: { color: "#fff" },
  movement: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  movementBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  movementIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  movementTitle: { ...typography.body, fontWeight: "600" },
  movementQty: { fontSize: 16, fontWeight: "800" },
});
