import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import type { CartItem } from "@mysupplier/shared";
import { Screen, Button, Card, KeyValue, EmptyState, ErrorView, LoadingView, ProductImage, QtyStepper } from "@/components";
import { getErrorMessage } from "@/lib/api";
import { useCart, GUEST_DELIVERY_FEE_PER_SUPPLIER } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { colors, radius, spacing, typography } from "@/theme";

function CartLine({ item, busy }: { item: CartItem; busy: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const { updateQuantity, removeItem } = useCart();
  const min = Math.max(1, item.offer.minQty || 1);
  const max = item.offer.stock ?? null;

  const change = async (qty: number) => {
    try {
      await updateQuantity(item.id, qty);
    } catch (err) {
      Alert.alert(t("cart"), getErrorMessage(err));
    }
  };
  const remove = () => {
    Alert.alert(t("remove"), `${t("remove")} ${item.material.name}?`, [
      { text: "Back", style: "cancel" },
      {
        text: t("remove"),
        style: "destructive",
        onPress: async () => {
          try {
            await removeItem(item.id);
          } catch (err) {
            Alert.alert(t("cart"), getErrorMessage(err));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.line}>
      <Pressable onPress={() => router.push(`/shop/product/${item.material.id}`)}>
        <ProductImage material={item.material} size={72} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Pressable onPress={() => router.push(`/shop/product/${item.material.id}`)}>
          <Text style={styles.lineName} numberOfLines={2}>
            {item.material.name}
          </Text>
        </Pressable>
        <Text style={typography.caption} numberOfLines={1}>
          {item.material.brand ? `${item.material.brand} · ` : ""}
          {formatSar(item.offer.price)} / {item.material.unit}
          {min > 1 ? ` · ${t("minQty")} ${min}` : ""}
        </Text>
        <View style={styles.lineControls}>
          <QtyStepper value={item.quantity} onChange={(q) => void change(q)} min={min} max={max} size="sm" disabled={busy} />
          <Pressable onPress={remove} hitSlop={8} disabled={busy} accessibilityLabel={t("remove")} style={styles.trash}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
          <Text style={styles.lineTotal}>{formatSar(item.lineTotal)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function CartScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { items, groups, summary, loading, busy, error, isGuest, refresh } = useCart();

  return (
    <Screen scroll padded={false} edges={["left", "right"]} refreshing={false} onRefresh={() => void refresh()}>
      <Stack.Screen options={{ title: `${t("cart")}${items.length ? ` (${items.length})` : ""}` }} />

      {loading && items.length === 0 ? (
        <LoadingView />
      ) : error && items.length === 0 ? (
        <ErrorView message={error} onRetry={() => void refresh()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title={t("cartEmpty")}
          message={t("cartEmptyHint")}
          actionTitle={t("continueShopping")}
          onAction={() => router.push("/(tabs)/shop")}
          style={{ marginTop: spacing.xxl }}
        />
      ) : (
        <View style={styles.content}>
          {groups.map((g) => (
            <Card key={g.key} style={{ paddingVertical: spacing.md }}>
              <View style={styles.groupHeader}>
                <Ionicons name="storefront-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.groupName} numberOfLines={1}>
                  {g.supplierName}
                </Text>
                {g.verified ? <Ionicons name="checkmark-circle" size={15} color={colors.primary} /> : null}
                <Text style={styles.groupCity}>{g.city}</Text>
              </View>
              {g.items.map((item, i) => (
                <View key={item.id} style={i > 0 ? styles.lineBorder : undefined}>
                  <CartLine item={item} busy={busy} />
                </View>
              ))}
              <View style={styles.groupFooter}>
                <Text style={typography.caption}>
                  {g.items.length} item{g.items.length === 1 ? "" : "s"}
                </Text>
                <Text style={styles.groupSubtotal}>{formatSar(g.subtotal)}</Text>
              </View>
            </Card>
          ))}

          <Card>
            <Text style={styles.summaryTitle}>Order summary</Text>
            <KeyValue label={t("subtotal")} value={formatSar(summary.subtotal)} />
            <KeyValue label={t("vat")} value={formatSar(summary.vat)} />
            <KeyValue
              label={`${t("deliveryFee")} (${summary.supplierCount} supplier${summary.supplierCount === 1 ? "" : "s"})`}
              value={formatSar(summary.deliveryFee)}
            />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("total")}</Text>
              <Text style={styles.totalValue}>{formatSar(summary.total)}</Text>
            </View>
            {summary.estimated ? (
              <Text style={[typography.caption, { marginTop: spacing.xs }]}>
                Delivery {t("estimated")} at {formatSar(GUEST_DELIVERY_FEE_PER_SUPPLIER)} per supplier. Final totals are confirmed after you log in.
              </Text>
            ) : null}
          </Card>

          <Button
            title={isGuest ? `${t("login")} · ${t("checkout")}` : t("checkout")}
            icon={isGuest ? "log-in-outline" : "arrow-forward"}
            size="lg"
            fullWidth
            disabled={busy}
            onPress={() => router.push("/checkout")}
          />
          <Button title={t("continueShopping")} variant="ghost" onPress={() => router.push("/(tabs)/shop")} style={{ marginTop: spacing.sm }} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  groupName: { ...typography.body, fontWeight: "700", flexShrink: 1 },
  groupCity: { ...typography.caption, marginLeft: "auto" },
  line: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  lineBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  lineName: { ...typography.body, fontWeight: "600" },
  lineControls: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  trash: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.dangerLight, alignItems: "center", justifyContent: "center" },
  lineTotal: { flex: 1, textAlign: "right", fontSize: 15, fontWeight: "700", color: colors.text },
  groupFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  groupSubtotal: { fontSize: 14, fontWeight: "700", color: colors.primary },
  summaryTitle: { ...typography.h3, marginBottom: spacing.xs },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { ...typography.h3 },
  totalValue: { fontSize: 20, fontWeight: "800", color: colors.primary },
});
