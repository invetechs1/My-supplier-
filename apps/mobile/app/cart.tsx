import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Screen, Button, Card, KeyValue, EmptyState, ErrorView, LoadingView, ProductImage, QtyStepper } from "@/components";
import { getErrorMessage, type CartLine as CartLineModel } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart, GUEST_DELIVERY_FEE_PER_SUPPLIER } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { colors, radius, spacing, typography } from "@/theme";

function CartLine({ item, busy }: { item: CartLineModel; busy: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const { updateQuantity, removeItem } = useCart();
  const min = Math.max(1, item.offer.minQty || 1);
  const max = item.offer.stock ?? null;
  const unitPrice = item.unitPrice ?? item.offer.price;
  const basePrice = item.basePrice ?? item.offer.price;
  const discounted = unitPrice < basePrice - 0.005;

  const change = async (qty: number) => {
    try {
      await updateQuantity(item.id, qty);
    } catch (err) {
      Alert.alert(t("cart"), getErrorMessage(err));
    }
  };
  const remove = () => {
    Alert.alert(t("remove"), `${t("remove")} ${item.material.name}?`, [
      { text: t("back"), style: "cancel" },
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
        <View style={styles.priceRow}>
          <Text style={[typography.caption, discounted && { color: colors.success, fontWeight: "700" }]}>
            {formatSar(unitPrice)} / {item.material.unit}
          </Text>
          {discounted ? <Text style={styles.strike}>{formatSar(basePrice)}</Text> : null}
          {item.material.brand ? <Text style={typography.caption}> · {item.material.brand}</Text> : null}
          {min > 1 ? (
            <Text style={typography.caption}>
              {" "}
              · {t("minQty")} {min}
            </Text>
          ) : null}
        </View>
        {item.saleApplied ? (
          <View style={styles.hint}>
            <Ionicons name="pricetag-outline" size={12} color={colors.danger} />
            <Text style={[styles.hintText, { color: colors.danger }]}>
              {t("sale")} · {t("was")} {formatSar(basePrice)}
            </Text>
          </View>
        ) : item.tierApplied ? (
          <View style={styles.hint}>
            <Ionicons name="layers-outline" size={12} color={colors.primary} />
            <Text style={styles.hintText}>
              {t("volumePrice")} (≥{item.tierApplied.minQty}) · {t("was")} {formatSar(basePrice)}
            </Text>
          </View>
        ) : null}
        {item.nextTier ? (
          <View style={styles.hint}>
            <Ionicons name="trending-down-outline" size={12} color={colors.success} />
            <Text style={[styles.hintText, { color: colors.success }]}>
              {t("add")} {item.nextTier.minQty - item.quantity} {t("moreToPay")} {formatSar(item.nextTier.price)} ({t("saveAmount")} {formatSar(item.nextTier.savePerUnit)} {t("perUnit")})
            </Text>
          </View>
        ) : null}
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

/** Promo code entry: validates through `GET /cart?coupon=` and keeps the code for checkout. */
function CouponField() {
  const { t } = useI18n();
  const { couponCode, coupon, couponError, setCoupon, busy } = useCart();
  const [code, setCode] = useState(couponCode ?? "");
  useEffect(() => setCode(couponCode ?? ""), [couponCode]);

  if (coupon) {
    return (
      <View style={styles.couponApplied}>
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <View style={{ flex: 1 }}>
          <Text style={styles.couponCode}>
            {coupon.code} · {t("couponApplied")}
          </Text>
          <Text style={typography.caption}>{coupon.description ?? (coupon.type === "PERCENT" ? `-${coupon.value}%` : `-${formatSar(coupon.value)}`)}</Text>
        </View>
        <Pressable onPress={() => void setCoupon(null)} hitSlop={8} disabled={busy}>
          <Text style={styles.couponRemove}>{t("removeCoupon")}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View>
      <View style={styles.couponRow}>
        <View style={styles.couponInputWrap}>
          <Ionicons name="ticket-outline" size={16} color={colors.textMuted} />
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder={t("couponPlaceholder")}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.couponInput}
            returnKeyType="done"
            onSubmitEditing={() => void setCoupon(code)}
          />
        </View>
        <Button title={t("apply")} size="md" variant="secondary" disabled={!code.trim() || busy} onPress={() => void setCoupon(code)} />
      </View>
      {couponError ? <Text style={styles.couponError}>{couponError}</Text> : null}
    </View>
  );
}

export default function CartScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { isSupplier } = useAuth();
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
          {summary.savings > 0 ? (
            <View style={styles.savingsBanner}>
              <Ionicons name="sparkles" size={16} color={colors.success} />
              <Text style={styles.savingsText}>
                {t("youSave")} {formatSar(summary.savings)}
              </Text>
            </View>
          ) : null}
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
                  {g.items.length} {g.items.length === 1 ? t("item") : t("items")}
                </Text>
                <Text style={styles.groupSubtotal}>{formatSar(g.subtotal)}</Text>
              </View>
            </Card>
          ))}

          <Card>
            <Text style={styles.summaryTitle}>{t("orderSummary")}</Text>
            {!isGuest ? <CouponField /> : null}
            <KeyValue label={t("subtotal")} value={formatSar(summary.subtotal)} />
            {summary.savings > 0 ? <KeyValue label={t("youSave")} value={`-${formatSar(summary.savings)}`} /> : null}
            {summary.discount > 0 ? <KeyValue label={t("discount")} value={`-${formatSar(summary.discount)}`} /> : null}
            <KeyValue label={t("vat")} value={formatSar(summary.vat)} />
            <KeyValue
              label={`${t("deliveryFee")} (${summary.supplierCount} ${summary.supplierCount === 1 ? t("seller") : t("sellers")})`}
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
          {!isGuest && !isSupplier ? (
            <Button
              title={t("makeRecurring")}
              variant="ghost"
              icon="calendar-outline"
              onPress={() => router.push({ pathname: "/recurring/new", params: { source: "cart" } })}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
          <Button title={t("continueShopping")} variant="ghost" onPress={() => router.push("/(tabs)/shop")} style={{ marginTop: spacing.xs }} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  savingsBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  savingsText: { color: colors.success, fontWeight: "700", fontSize: 14 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  groupName: { ...typography.body, fontWeight: "700", flexShrink: 1 },
  groupCity: { ...typography.caption, marginLeft: "auto" },
  line: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  lineBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  lineName: { ...typography.body, fontWeight: "600" },
  priceRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 2 },
  strike: { ...typography.caption, textDecorationLine: "line-through", marginLeft: 6 },
  hint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  hintText: { ...typography.caption, color: colors.primary, fontWeight: "600", flex: 1 },
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
  summaryTitle: { ...typography.h3, marginBottom: spacing.sm },
  couponRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  couponInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, backgroundColor: colors.surface },
  couponInput: { flex: 1, fontSize: 14, color: colors.text, fontWeight: "600", letterSpacing: 0.5 },
  couponError: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
  couponApplied: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.successLight, marginBottom: spacing.sm },
  couponCode: { ...typography.body, fontWeight: "700", color: colors.success },
  couponRemove: { ...typography.caption, color: colors.danger, fontWeight: "600" },
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
