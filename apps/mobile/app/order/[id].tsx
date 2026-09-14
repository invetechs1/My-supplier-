import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { OrderStatus } from "@mysupplier/shared";
import { Screen, Button, StatusBadge, Card, SectionHeader, KeyValue, LoadingView, ErrorView, RequireAuth } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, formatSar } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, spacing, typography } from "@/theme";

const STEPS: Array<{ status: OrderStatus; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { status: "PENDING", label: "Order placed", icon: "receipt-outline" },
  { status: "CONFIRMED", label: "Confirmed by supplier", icon: "checkmark-circle-outline" },
  { status: "IN_TRANSIT", label: "In transit", icon: "car-outline" },
  { status: "DELIVERED", label: "Delivered", icon: "home-outline" },
];

const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  PENDING: { status: "CONFIRMED", label: "Confirm order" },
  CONFIRMED: { status: "IN_TRANSIT", label: "Mark in transit" },
  IN_TRANSIT: { status: "DELIVERED", label: "Mark delivered" },
};

function OrderDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isSupplier } = useAuth();
  const { data, loading, error, refreshing, reload, refresh, setData } = useApi(() => api.order(id), [id], Boolean(id));
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (error || !data) {
    return (
      <Screen>
        <ErrorView message={error ?? "Order not found"} onRetry={reload} />
      </Screen>
    );
  }

  const order = data;
  const cancelled = order.status === "CANCELLED";
  const currentIdx = STEPS.findIndex((s) => s.status === order.status);
  const isBuyer = user?.id === order.buyerId;
  const isOrderSupplier = isSupplier && user?.companyId === order.companyId;

  const changeStatus = (status: OrderStatus, confirmText: string) => {
    Alert.alert("Update order", confirmText, [
      { text: "Back", style: "cancel" },
      {
        text: "Confirm",
        style: status === "CANCELLED" ? "destructive" : "default",
        onPress: async () => {
          setBusy(true);
          try {
            const updated = await api.updateOrderStatus(order.id, status);
            setData(updated);
          } catch (err) {
            Alert.alert("Error", getErrorMessage(err));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const next = NEXT[order.status];

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: order.reference }} />
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.caption}>{order.reference}</Text>
          <Text style={styles.title}>{order.rfq?.title ?? "Order"}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      <Card style={{ backgroundColor: colors.primary }}>
        <Text style={styles.totalLabel}>Order total</Text>
        <Text style={styles.total}>{formatSar(order.total)}</Text>
        <Text style={styles.totalSub}>
          {order.company?.name ?? "Supplier"} · placed {formatDate(order.createdAt)}
        </Text>
      </Card>

      <SectionHeader title="Status" />
      <Card>
        {cancelled ? (
          <View style={styles.cancelled}>
            <Ionicons name="close-circle" size={22} color={colors.danger} />
            <Text style={[typography.body, { color: colors.danger, fontWeight: "600" }]}>Order cancelled</Text>
          </View>
        ) : null}
        {STEPS.map((step, i) => {
          const done = !cancelled && i <= currentIdx;
          const active = !cancelled && i === currentIdx;
          const isLast = i === STEPS.length - 1;
          return (
            <View key={step.status} style={styles.step}>
              <View style={styles.stepIndicator}>
                <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                  <Ionicons name={step.icon} size={14} color={done ? "#fff" : colors.textMuted} />
                </View>
                {!isLast ? <View style={[styles.line, done && i < currentIdx && styles.lineDone]} /> : null}
              </View>
              <View style={styles.stepBody}>
                <Text style={[styles.stepLabel, done && { color: colors.text }, active && { color: colors.primary }]}>
                  {step.label}
                </Text>
                {active ? <Text style={typography.caption}>Updated {formatDateTime(order.updatedAt)}</Text> : null}
              </View>
            </View>
          );
        })}
      </Card>

      {isOrderSupplier && next && !cancelled ? (
        <Button
          title={next.label}
          size="lg"
          fullWidth
          loading={busy}
          onPress={() => changeStatus(next.status, `Set this order to "${next.label.replace(/^Mark |^Confirm /, "")}"?`)}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
      {isBuyer && order.status === "PENDING" ? (
        <Button
          title="Cancel order"
          variant="danger"
          fullWidth
          loading={busy}
          onPress={() => changeStatus("CANCELLED", "Cancel this order? The supplier will be notified.")}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <SectionHeader title="Details" />
      <Card>
        <KeyValue label="Supplier" value={order.company?.name ?? "—"} />
        {order.company?.city ? <KeyValue label="Supplier city" value={order.company.city} /> : null}
        {order.company?.phone ? <KeyValue label="Supplier phone" value={order.company.phone} /> : null}
        {order.rfq ? <KeyValue label="Delivery city" value={order.rfq.deliveryCity} /> : null}
        {order.rfq?.deliveryDate ? <KeyValue label="Requested delivery" value={formatDate(order.rfq.deliveryDate)} /> : null}
        {order.bid ? <KeyValue label="Delivery lead" value={`${order.bid.deliveryDays} days`} /> : null}
        <KeyValue label="Last update" value={formatDateTime(order.updatedAt)} />
      </Card>

      {order.bid?.items.length ? (
        <>
          <SectionHeader title="Items" />
          <Card style={{ paddingVertical: spacing.xs }}>
            {order.bid.items.map((bi, i) => {
              const rfqItem = order.rfq?.items.find((ri) => ri.id === bi.rfqItemId);
              return (
                <View key={bi.id} style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemDesc}>{rfqItem?.description ?? "Item"}</Text>
                    <Text style={typography.caption}>
                      {bi.quantity} {rfqItem?.unit ?? ""} × {formatSar(bi.unitPrice)}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>{formatSar(bi.quantity * bi.unitPrice)}</Text>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {order.rfq ? (
        <Button title="View original RFQ" variant="ghost" onPress={() => router.push(`/rfq/${order.rfqId}`)} style={{ marginTop: spacing.sm }} />
      ) : null}
    </Screen>
  );
}

export default function OrderDetailScreen() {
  return (
    <RequireAuth>
      <OrderDetailContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.lg },
  title: { ...typography.h2, marginTop: 2 },
  totalLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5 },
  total: { fontSize: 28, fontWeight: "800", color: "#fff", marginTop: 4 },
  totalSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  cancelled: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  step: { flexDirection: "row", gap: spacing.md, minHeight: 52 },
  stepIndicator: { alignItems: "center", width: 28 },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.neutralLight, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: colors.primary },
  dotActive: { backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.primaryLight },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, paddingTop: 4, paddingBottom: spacing.md },
  stepLabel: { ...typography.body, color: colors.textMuted, fontWeight: "500" },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.md },
  itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemDesc: { ...typography.body, fontWeight: "500" },
  itemTotal: { ...typography.body, fontWeight: "600" },
});
