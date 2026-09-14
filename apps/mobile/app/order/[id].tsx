import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { OrderExtended, OrderStatus, PaymentMethod } from "@mysupplier/shared";
import { Screen, Button, StatusBadge, Card, SectionHeader, KeyValue, LoadingView, ErrorView, RequireAuth, ProductImage } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
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

function orderType(order: OrderExtended): "DIRECT" | "RFQ" {
  return order.type ?? (order.rfqId ? "RFQ" : "DIRECT");
}

function paymentMethodLabel(method: PaymentMethod | null | undefined, t: (k: "cod" | "bankTransfer" | "card") => string): string {
  if (method === "COD") return t("cod");
  if (method === "BANK_TRANSFER") return t("bankTransfer");
  if (method === "CARD") return t("card");
  return "—";
}

function OrderDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user, isSupplier } = useAuth();
  const { data, loading, error, refreshing, reload, refresh, setData } = useApi(() => api.order(id), [id], Boolean(id));
  const [busy, setBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);

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
  const type = orderType(order);
  const cancelled = order.status === "CANCELLED";
  const currentIdx = STEPS.findIndex((s) => s.status === order.status);
  const isBuyer = user?.id === order.buyerId;
  const isAdmin = user?.role === "ADMIN";
  const isOrderSupplier = isSupplier && user?.companyId === order.companyId;
  const items = order.items ?? [];
  const bidItems = order.bid?.items ?? [];
  const hasBreakdown = typeof order.subtotal === "number";
  const paymentStatus = order.paymentStatus ?? "UNPAID";
  const title = order.rfq?.title ?? (items.length ? `${items[0].name}${items.length > 1 ? ` +${items.length - 1} more` : ""}` : "Order");

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

  const markPaid = () => {
    Alert.alert(t("markAsPaid"), `Confirm that payment of ${formatSar(order.total)} was received for ${order.reference}?`, [
      { text: "Back", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          setPayBusy(true);
          try {
            const updated = await api.updateOrderPayment(order.id, "PAID");
            setData(updated);
          } catch (err) {
            Alert.alert("Error", getErrorMessage(err));
          } finally {
            setPayBusy(false);
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
          <View style={styles.refRow}>
            <Text style={typography.caption}>{order.reference}</Text>
            <StatusBadge status={type} small />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      <Card style={{ backgroundColor: colors.primary }}>
        <Text style={styles.totalLabel}>Order total</Text>
        <Text style={styles.total}>{formatSar(order.total)}</Text>
        <Text style={styles.totalSub}>
          {order.company?.name ?? "Supplier"} · placed {formatDate(order.createdAt)}
        </Text>
        {hasBreakdown ? (
          <View style={styles.breakdown}>
            <View style={styles.breakdownCol}>
              <Text style={styles.breakdownLabel}>{t("subtotal")}</Text>
              <Text style={styles.breakdownValue}>{formatSar(order.subtotal)}</Text>
            </View>
            <View style={styles.breakdownCol}>
              <Text style={styles.breakdownLabel}>VAT</Text>
              <Text style={styles.breakdownValue}>{formatSar(order.vat)}</Text>
            </View>
            <View style={styles.breakdownCol}>
              <Text style={styles.breakdownLabel}>{t("deliveryFee")}</Text>
              <Text style={styles.breakdownValue}>{formatSar(order.deliveryFee)}</Text>
            </View>
          </View>
        ) : null}
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
                <Text style={[styles.stepLabel, done && { color: colors.text }, active && { color: colors.primary }]}>{step.label}</Text>
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

      <SectionHeader title="Payment" />
      <Card>
        <View style={styles.paymentRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentMethod}>{paymentMethodLabel(order.paymentMethod, t)}</Text>
            <Text style={typography.caption}>
              {paymentStatus === "PAID" ? "Payment received" : paymentStatus === "REFUNDED" ? "Payment refunded" : type === "DIRECT" ? "Payment due on delivery / per supplier terms" : "Settled per bid terms"}
            </Text>
          </View>
          <StatusBadge status={paymentStatus} />
        </View>
        {(isOrderSupplier || isAdmin) && paymentStatus === "UNPAID" && !cancelled ? (
          <Button title={t("markAsPaid")} variant="secondary" icon="cash-outline" fullWidth loading={payBusy} onPress={markPaid} style={{ marginTop: spacing.md }} />
        ) : null}
      </Card>

      <SectionHeader title={t("deliveryDetails")} />
      <Card>
        <KeyValue label="Supplier" value={order.company?.name ?? "—"} />
        {order.company?.city ? <KeyValue label="Supplier city" value={order.company.city} /> : null}
        {order.company?.phone ? <KeyValue label="Supplier phone" value={order.company.phone} /> : null}
        {isOrderSupplier || isAdmin ? <KeyValue label="Buyer" value={order.rfq?.buyer?.company?.name ?? order.rfq?.buyer?.name ?? "Buyer"} /> : null}
        <KeyValue label="Delivery city" value={order.deliveryCity ?? order.rfq?.deliveryCity ?? "—"} />
        {order.deliveryAddress ?? order.rfq?.deliveryAddress ? <KeyValue label="Address" value={order.deliveryAddress ?? order.rfq?.deliveryAddress ?? ""} /> : null}
        {order.contactPhone ? <KeyValue label="Contact phone" value={order.contactPhone} /> : null}
        {order.rfq?.deliveryDate ? <KeyValue label="Requested delivery" value={formatDate(order.rfq.deliveryDate)} /> : null}
        {order.bid ? <KeyValue label="Delivery lead" value={`${order.bid.deliveryDays} days`} /> : null}
        {order.notes ? <KeyValue label={t("notes")} value={order.notes} /> : null}
        <KeyValue label="Last update" value={formatDateTime(order.updatedAt)} />
      </Card>

      {items.length ? (
        <>
          <SectionHeader title={`Items (${items.length})`} />
          <Card style={{ paddingVertical: spacing.xs }}>
            {items.map((it, i) => {
              const content = (
                <View style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                  {it.material ? <ProductImage material={it.material} size={44} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemDesc} numberOfLines={2}>
                      {it.name || it.material?.name || "Item"}
                    </Text>
                    <Text style={typography.caption}>
                      {it.quantity} {it.unit} × {formatSar(it.unitPrice)}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>{formatSar(it.lineTotal)}</Text>
                </View>
              );
              return it.materialId ? (
                <Pressable key={it.id} onPress={() => router.push(`/shop/product/${it.materialId}`)}>
                  {content}
                </Pressable>
              ) : (
                <View key={it.id}>{content}</View>
              );
            })}
            {hasBreakdown ? (
              <View style={styles.itemsSummary}>
                <KeyValue label={t("subtotal")} value={formatSar(order.subtotal)} />
                <KeyValue label={t("vat")} value={formatSar(order.vat)} />
                <KeyValue label={t("deliveryFee")} value={formatSar(order.deliveryFee)} />
                <View style={styles.itemsTotalRow}>
                  <Text style={styles.itemsTotalLabel}>{t("total")}</Text>
                  <Text style={styles.itemsTotalValue}>{formatSar(order.total)}</Text>
                </View>
              </View>
            ) : null}
          </Card>
        </>
      ) : bidItems.length ? (
        <>
          <SectionHeader title="Items" />
          <Card style={{ paddingVertical: spacing.xs }}>
            {bidItems.map((bi, i) => {
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

      {order.rfq || (type === "RFQ" && order.rfqId) ? (
        <Button title="View original RFQ" variant="ghost" onPress={() => router.push(`/rfq/${order.rfqId}`)} style={{ marginTop: spacing.sm }} />
      ) : null}
      {type === "DIRECT" && isBuyer ? (
        <Button title={t("continueShopping")} variant="ghost" icon="storefront-outline" onPress={() => router.push("/(tabs)/shop")} style={{ marginTop: spacing.sm }} />
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
  refRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.h2, marginTop: 2 },
  totalLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5 },
  total: { fontSize: 28, fontWeight: "800", color: "#fff", marginTop: 4 },
  totalSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  breakdown: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.35)" },
  breakdownCol: { flex: 1 },
  breakdownLabel: { fontSize: 11, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.4 },
  breakdownValue: { fontSize: 14, fontWeight: "700", color: "#fff", marginTop: 2 },
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
  paymentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  paymentMethod: { ...typography.body, fontWeight: "600" },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.md },
  itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemDesc: { ...typography.body, fontWeight: "500" },
  itemTotal: { ...typography.body, fontWeight: "600" },
  itemsSummary: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  itemsTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  itemsTotalLabel: { ...typography.h3 },
  itemsTotalValue: { fontSize: 17, fontWeight: "800", color: colors.primary },
});
