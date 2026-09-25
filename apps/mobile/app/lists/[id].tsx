import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { WishlistItem } from "@mysupplier/shared";
import { Screen, Button, Card, EmptyState, ErrorView, LoadingView, RequireAuth, ProductImage, QtyStepper, BottomSheet, TextField, StockPill } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { effectivePriceOf } from "@/lib/pricing";
import { useApi } from "@/hooks/useApi";
import { useAddToCart, isPurchasable } from "@/hooks/useAddToCart";
import { colors, radius, spacing, typography } from "@/theme";

function ListDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { refresh: refreshCart } = useCart();
  const { add, adding } = useAddToCart();
  const list = useApi(() => api.wishlist(id), [id], Boolean(id));
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState("");

  const setItems = (updater: (items: WishlistItem[]) => WishlistItem[]) => list.setData((prev) => (prev ? { ...prev, items: updater(prev.items) } : prev));

  const changeQty = async (item: WishlistItem, quantity: number) => {
    setItems((items) => items.map((i) => (i.id === item.id ? { ...i, quantity } : i)));
    try {
      await api.updateWishlistItem(id, item.id, { quantity });
    } catch (err) {
      Alert.alert(t("lists"), getErrorMessage(err));
      list.silentReload();
    }
  };

  const removeItem = async (item: WishlistItem) => {
    setItems((items) => items.filter((i) => i.id !== item.id));
    try {
      await api.removeWishlistItem(id, item.id);
    } catch (err) {
      Alert.alert(t("lists"), getErrorMessage(err));
      list.silentReload();
    }
  };

  const addAll = async () => {
    setBusy(true);
    try {
      const res = await api.wishlistAddToCart(id);
      await refreshCart();
      const skipped = res.skipped.length;
      Alert.alert(
        t("addAllToCart"),
        `${res.added} ${t("itemsAdded")}${skipped ? `\n${skipped} ${t("itemsSkipped")}` : ""}`,
        [{ text: t("continueShopping"), style: "cancel" }, { text: t("cart"), onPress: () => router.push("/cart") }],
      );
    } catch (err) {
      Alert.alert(t("addAllToCart"), getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    setBusy(true);
    try {
      const updated = await api.renameWishlist(id, trimmed);
      list.setData((prev) => (prev ? { ...prev, name: updated.name } : prev));
      setRenameOpen(false);
    } catch (err) {
      Alert.alert(t("rename"), getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert(t("deleteList"), t("deleteListConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteWishlist(id);
            router.back();
          } catch (err) {
            Alert.alert(t("deleteList"), getErrorMessage(err));
          }
        },
      },
    ]);
  };

  if (list.loading && !list.data) return <LoadingView />;
  if (list.error || !list.data) return <ErrorView message={list.error ?? "List not found"} onRetry={list.reload} />;
  const data = list.data;
  const purchasable = data.items.filter((i) => isPurchasable(i.material?.bestOffer)).length;

  return (
    <Screen scroll padded={false} refreshing={list.refreshing} onRefresh={list.refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen
        options={{
          title: data.name,
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable
                onPress={() => {
                  setName(data.name);
                  setRenameOpen(true);
                }}
                hitSlop={8}
                accessibilityLabel={t("rename")}
              >
                <Ionicons name="create-outline" size={22} color={colors.primary} />
              </Pressable>
              {!data.isDefault ? (
                <Pressable onPress={remove} hitSlop={8} accessibilityLabel={t("deleteList")}>
                  <Ionicons name="trash-outline" size={22} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />
      <View style={styles.content}>
        {data.items.length === 0 ? (
          <EmptyState icon="heart-outline" title={t("emptyList")} message={t("emptyListHint")} actionTitle={t("shop")} onAction={() => router.push("/(tabs)/shop")} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <Card style={{ paddingVertical: spacing.xs }}>
              {data.items.map((item, i) => {
                const m = item.material;
                const offer = m?.bestOffer ?? null;
                const price = effectivePriceOf(offer) ?? m?.minPrice ?? null;
                const canBuy = isPurchasable(offer) && offer?.stock !== 0;
                return (
                  <View key={item.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <Pressable onPress={() => router.push(`/shop/product/${item.materialId}`)}>
                      {m ? <ProductImage material={m} size={64} /> : <View style={{ width: 64, height: 64 }} />}
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Pressable onPress={() => router.push(`/shop/product/${item.materialId}`)}>
                        <Text style={styles.name} numberOfLines={2}>
                          {m?.name ?? item.materialId}
                        </Text>
                      </Pressable>
                      <View style={styles.priceRow}>
                        <Text style={styles.price}>{formatSar(price)}</Text>
                        {m ? <Text style={typography.caption}> / {m.unit}</Text> : null}
                        {m ? <StockPill product={m} small /> : null}
                      </View>
                      {item.note ? <Text style={typography.caption}>{item.note}</Text> : null}
                      <View style={styles.controls}>
                        <QtyStepper value={item.quantity} onChange={(q) => void changeQty(item, q)} min={1} size="sm" />
                        <Pressable onPress={() => void removeItem(item)} hitSlop={8} style={styles.trash} accessibilityLabel={t("remove")}>
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </Pressable>
                        <View style={{ flex: 1 }} />
                        <Button title={t("add")} size="sm" variant="secondary" disabled={!canBuy} loading={adding === offer?.listingId} onPress={() => offer && m && void add(offer, m, Math.max(item.quantity, offer.minQty || 1))} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </Card>
            <Button title={`${t("addAllToCart")} (${purchasable})`} icon="cart-outline" size="lg" fullWidth loading={busy} disabled={!purchasable} onPress={() => void addAll()} />
            <Button title={t("setUpRecurring")} variant="ghost" icon="calendar-outline" onPress={() => router.push({ pathname: "/recurring/new", params: { source: "list", listId: id } })} style={{ marginTop: spacing.sm }} />
          </>
        )}
      </View>

      <BottomSheet visible={renameOpen} onClose={() => setRenameOpen(false)} title={t("rename")}>
        <TextField label={t("listName")} value={name} onChangeText={setName} autoFocus maxLength={60} returnKeyType="done" onSubmitEditing={() => void rename()} />
        <Button title={t("save")} size="lg" fullWidth loading={busy} disabled={name.trim().length < 2} onPress={() => void rename()} />
      </BottomSheet>
    </Screen>
  );
}

export default function ListDetailScreen() {
  return (
    <RequireAuth>
      <ListDetailContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { ...typography.body, fontWeight: "600" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
  price: { fontSize: 15, fontWeight: "700", color: colors.primary },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  trash: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.dangerLight, alignItems: "center", justifyContent: "center" },
});
