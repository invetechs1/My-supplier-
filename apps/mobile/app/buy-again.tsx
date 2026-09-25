import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import type { FrequentlyOrderedItem, OrderExtended } from "@mysupplier/shared";
import { Screen, Button, Card, SectionHeader, EmptyState, ErrorView, LoadingView, RequireAuth, ProductImage, StatusBadge } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { effectivePriceOf } from "@/lib/pricing";
import { useApi } from "@/hooks/useApi";
import { useAddToCart, isPurchasable } from "@/hooks/useAddToCart";
import { colors, radius, spacing, typography } from "@/theme";

/** Typical order quantity: total bought / number of orders, at least the offer's minimum. */
function typicalQty(item: FrequentlyOrderedItem): number {
  const perOrder = Math.max(1, Math.round(item.quantity / Math.max(1, item.orders)));
  return Math.max(perOrder, item.bestOffer?.minQty || 1);
}

function BuyAgainContent() {
  const router = useRouter();
  const { t } = useI18n();
  const { refresh: refreshCart } = useCart();
  const { add, adding } = useAddToCart();
  const frequent = useApi(() => api.frequentlyOrdered(20), []);
  const orders = useApi(() => api.orders(1), []);
  const [reordering, setReordering] = useState<string | null>(null);

  const reorder = async (order: OrderExtended) => {
    setReordering(order.id);
    try {
      const res = await api.reorder(order.id);
      await refreshCart();
      const skipped = res.skipped.length;
      Alert.alert(
        t("reorder"),
        `${res.added} ${t("addedToCartCount")}${skipped ? `\n${skipped} ${t("itemsSkipped")}:\n${res.skipped.map((s) => `• ${s.name} (${s.reason})`).join("\n")}` : ""}`,
        [{ text: t("continueShopping"), style: "cancel" }, { text: t("cart"), onPress: () => router.push("/cart") }],
      );
    } catch (err) {
      Alert.alert(t("reorder"), getErrorMessage(err));
    } finally {
      setReordering(null);
    }
  };

  const recurringFromFrequent = () => {
    const lines = (frequent.data ?? [])
      .filter((f) => isPurchasable(f.bestOffer))
      .map((f) => ({ listingId: f.bestOffer!.listingId, quantity: typicalQty(f), name: f.material.name, unit: f.material.unit, companyName: f.bestOffer!.companyName }));
    router.push({ pathname: "/recurring/new", params: { source: "buy-again", items: JSON.stringify(lines) } });
  };

  if ((frequent.loading && !frequent.data) || (orders.loading && !orders.data)) return <LoadingView />;
  if (frequent.error && !frequent.data) return <ErrorView message={frequent.error} onRetry={frequent.reload} />;

  const items = frequent.data ?? [];
  const recent = (orders.data?.data ?? []).filter((o) => o.status !== "CANCELLED" && (o.items?.length ?? 0) > 0).slice(0, 8);

  return (
    <Screen
      scroll
      refreshing={frequent.refreshing || orders.refreshing}
      onRefresh={() => {
        frequent.refresh();
        orders.refresh();
      }}
      edges={["bottom", "left", "right"]}
    >
      <Stack.Screen options={{ title: t("buyAgain") }} />

      {items.length === 0 && recent.length === 0 ? (
        <EmptyState icon="repeat-outline" title={t("noOrdersYet")} message={t("noOrdersHint")} actionTitle={t("shop")} onAction={() => router.push("/(tabs)/shop")} style={{ marginTop: spacing.xxl }} />
      ) : null}

      {items.length ? (
        <>
          <SectionHeader title={t("frequentlyOrdered")} actionTitle={items.some((f) => isPurchasable(f.bestOffer)) ? t("setUpRecurring") : undefined} onAction={recurringFromFrequent} />
          <Card style={{ paddingVertical: spacing.xs }}>
            {items.map((f, i) => {
              const offer = f.bestOffer;
              const now = effectivePriceOf(offer);
              const canBuy = isPurchasable(offer) && offer?.stock !== 0;
              const qty = typicalQty(f);
              const cheaper = now !== null && now < f.lastUnitPrice - 0.005;
              const pricier = now !== null && now > f.lastUnitPrice + 0.005;
              return (
                <View key={f.materialId} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <Pressable onPress={() => router.push(`/shop/product/${f.materialId}`)}>
                    <ProductImage material={f.material} size={60} />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Pressable onPress={() => router.push(`/shop/product/${f.materialId}`)}>
                      <Text style={styles.name} numberOfLines={2}>
                        {f.material.name}
                      </Text>
                    </Pressable>
                    <Text style={typography.caption}>
                      {f.quantity.toLocaleString()} {f.material.unit} · {f.orders} {t("timesOrdered")} · {t("lastOrdered")} {formatDate(f.lastOrderedAt)}
                    </Text>
                    <View style={styles.priceRow}>
                      <Text style={typography.caption}>
                        {t("lastPrice")} {formatSar(f.lastUnitPrice)}
                      </Text>
                      {now !== null ? (
                        <Text style={[styles.now, cheaper && { color: colors.success }, pricier && { color: colors.danger }]}>
                          {t("currentPrice")} {formatSar(now)}
                          {cheaper ? " ↓" : pricier ? " ↑" : ""}
                        </Text>
                      ) : (
                        <Text style={[typography.caption, { color: colors.textMuted }]}>{t("noOfferAvailable")}</Text>
                      )}
                    </View>
                  </View>
                  <Button title={`${t("add")} ${qty}`} size="sm" disabled={!canBuy} loading={adding === offer?.listingId} onPress={() => offer && void add(offer, f.material, qty)} />
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {recent.length ? (
        <>
          <SectionHeader title={t("recentOrders")} actionTitle={t("seeAll")} onAction={() => router.push("/(tabs)/orders")} />
          {recent.map((o) => (
            <Card key={o.id}>
              <View style={styles.orderHead}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.caption}>
                    {o.reference} · {formatDate(o.createdAt)}
                  </Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {o.company?.name ?? "Supplier"}
                  </Text>
                  <Text style={typography.caption} numberOfLines={2}>
                    {o.items.map((it) => `${it.quantity} × ${it.name}`).join(", ")}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <StatusBadge status={o.status} small />
                  <Text style={styles.total}>{formatSar(o.total)}</Text>
                </View>
              </View>
              <View style={styles.orderActions}>
                <Button title={t("viewOrder")} size="sm" variant="ghost" onPress={() => router.push(`/order/${o.id}`)} />
                <Button title={t("reorder")} size="sm" icon="repeat-outline" loading={reordering === o.id} disabled={reordering !== null && reordering !== o.id} onPress={() => void reorder(o)} />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <Pressable onPress={() => router.push("/recurring")} style={styles.link}>
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <Text style={styles.linkText}>{t("recurringOrders")}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
      </Pressable>
    </Screen>
  );
}

export default function BuyAgainScreen() {
  return (
    <RequireAuth roles={["BUYER"]}>
      <BuyAgainContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { ...typography.body, fontWeight: "600" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2, flexWrap: "wrap" },
  now: { ...typography.caption, fontWeight: "700", color: colors.text },
  orderHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  total: { fontSize: 15, fontWeight: "700", color: colors.primary },
  orderActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  link: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg },
  linkText: { flex: 1, color: colors.primary, fontWeight: "600", fontSize: 14 },
});
