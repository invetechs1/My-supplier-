import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { Product, ShopOffer } from "@mysupplier/shared";
import {
  Screen,
  Button,
  Card,
  SectionHeader,
  Sparkline,
  LoadingView,
  ErrorView,
  KeyValue,
  ProductImage,
  ProductCard,
  QtyStepper,
  CartButton,
  StockPill,
  DealBadge,
  StatusBadge,
} from "@/components";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { useAddToCart, dealPercent, isPurchasable } from "@/hooks/useAddToCart";
import { colors, radius, spacing, typography } from "@/theme";

function stockLabel(offer: ShopOffer, unit: string, t: (k: "inStock" | "outOfStock" | "onRequest") => string): { text: string; color: string } {
  if (offer.stock === null) return { text: t("onRequest"), color: colors.textSecondary };
  if (offer.stock <= 0) return { text: t("outOfStock"), color: colors.danger };
  return { text: `${t("inStock")} · ${offer.stock.toLocaleString()} ${unit}`, color: colors.success };
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { isSupplier } = useAuth();
  const { add, adding } = useAddToCart();
  const { data, loading, error, refreshing, reload, refresh } = useApi(() => api.shopProduct(id), [id], Boolean(id));

  // Buy box = the API's best offer, falling back to the cheapest purchasable one.
  const buyBox = useMemo<ShopOffer | null>(() => {
    if (!data) return null;
    if (data.bestOffer && isPurchasable(data.bestOffer)) return data.bestOffer;
    return data.offers.find((o) => isPurchasable(o)) ?? null;
  }, [data]);

  const [qty, setQty] = useState(1);
  useEffect(() => {
    setQty(Math.max(1, buyBox?.minQty || 1));
  }, [buyBox?.listingId, buyBox?.minQty]);

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
        <ErrorView message={error ?? "Product not found"} onRetry={reload} />
      </Screen>
    );
  }

  const product = data;
  const otherOffers = product.offers.filter((o) => o.listingId !== buyBox?.listingId);
  const specs = product.specs ? Object.entries(product.specs) : [];
  const pct = dealPercent(product.avgPrice ?? product.summary.avg, buyBox?.price);
  const buyBoxOut = buyBox ? buyBox.stock !== null && buyBox.stock <= 0 : true;
  const buyBoxMax = buyBox?.stock ?? null;
  const productForPill: Product = { ...product, bestOffer: buyBox };

  const addToCart = async () => {
    if (!buyBox) return false;
    return add(buyBox, product, qty);
  };
  const buyNow = async () => {
    const ok = await addToCart();
    if (ok) router.push("/cart");
  };

  return (
    <Screen scroll padded={false} refreshing={refreshing} onRefresh={refresh} edges={["left", "right"]}>
      <Stack.Screen options={{ title: product.name, headerRight: () => <CartButton /> }} />

      <View style={styles.imageWrap}>
        {product.imageUrl ? (
          <ProductImage material={product} fill rounded={0} />
        ) : (
          <View style={styles.tileWrap}>
            <ProductImage material={product} size={180} rounded={radius.xl} />
          </View>
        )}
        <View style={styles.imageBadges}>
          <DealBadge product={{ ...product, bestOffer: buyBox }} />
        </View>
      </View>

      <View style={styles.section}>
        {product.brand ? <Text style={styles.brand}>{product.brand}</Text> : null}
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.nameAr}>{product.nameAr}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>SKU {product.sku}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.meta}>per {product.unit}</Text>
          {product.category?.name ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.meta}>{product.category.name}</Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Buy box */}
      <View style={styles.section}>
        <Card style={styles.buyBox}>
          {buyBox ? (
            <>
              <View style={styles.priceRow}>
                <Text style={styles.price}>{formatSar(buyBox.price)}</Text>
                <Text style={styles.priceUnit}>/ {product.unit}</Text>
                {pct > 0 ? <Text style={styles.savePct}>-{pct}% vs avg</Text> : null}
              </View>
              {product.summary.avg ? (
                <Text style={typography.caption}>
                  {t("average")} {formatSar(product.summary.avg)} · {product.summary.count} {product.summary.count === 1 ? t("seller") : t("sellers")}
                </Text>
              ) : null}
              <Text style={[typography.caption, { marginTop: 2 }]}>{t("priceIncludesVat")}</Text>

              <View style={styles.sellerBlock}>
                <View style={styles.sellerRow}>
                  <Ionicons name="storefront-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.sellerName} numberOfLines={1}>
                    {buyBox.companyName}
                  </Text>
                  {buyBox.verified ? <Ionicons name="checkmark-circle" size={16} color={colors.primary} /> : null}
                  {buyBox.rating > 0 ? (
                    <View style={styles.rating}>
                      <Ionicons name="star" size={12} color={colors.accent} />
                      <Text style={styles.ratingText}>{buyBox.rating.toFixed(1)}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.sellerMeta}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text style={typography.caption}>{buyBox.city}</Text>
                  <Text style={styles.dot}>·</Text>
                  <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                  <Text style={typography.caption}>
                    {t("leadTime")} {buyBox.leadTimeDays}d
                  </Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={typography.caption}>
                    {t("minQty")} {buyBox.minQty} {product.unit}
                  </Text>
                </View>
                <Text style={[styles.stock, { color: stockLabel(buyBox, product.unit, t).color }]}>{stockLabel(buyBox, product.unit, t).text}</Text>
              </View>

              <View style={styles.qtyRow}>
                <Text style={styles.qtyLabel}>{t("quantity")}</Text>
                <QtyStepper value={qty} onChange={setQty} min={Math.max(1, buyBox.minQty || 1)} max={buyBoxMax} disabled={buyBoxOut} />
                <Text style={styles.lineTotal}>{formatSar(buyBox.price * qty)}</Text>
              </View>

              <Button
                title={t("addToCart")}
                icon="cart-outline"
                size="lg"
                fullWidth
                disabled={buyBoxOut}
                loading={adding === buyBox.listingId}
                onPress={() => void addToCart()}
              />
              <Button
                title={t("buyNow")}
                variant="accent"
                size="lg"
                fullWidth
                disabled={buyBoxOut}
                onPress={() => void buyNow()}
                style={{ marginTop: spacing.sm }}
              />
            </>
          ) : (
            <>
              <Text style={styles.price}>{formatSar(product.summary.min ?? product.minPrice)}</Text>
              <Text style={typography.bodySmall}>
                {product.offers.length ? "Only reference prices are available for this product right now." : "No offers yet for this product."}
              </Text>
              <StockPill product={productForPill} />
              {!isSupplier ? (
                <Button
                  title={t("requestQuotes")}
                  icon="document-text-outline"
                  size="lg"
                  fullWidth
                  style={{ marginTop: spacing.md }}
                  onPress={() => router.push({ pathname: "/rfq/new", params: { materialId: product.id } })}
                />
              ) : null}
            </>
          )}
        </Card>
      </View>

      {/* Other sellers */}
      {otherOffers.length ? (
        <View style={styles.section}>
          <SectionHeader title={`${t("otherSellers")} (${otherOffers.length})`} style={{ marginTop: spacing.md }} />
          <Card style={{ paddingVertical: spacing.xs }}>
            {otherOffers.map((o, i) => {
              const purchasable = isPurchasable(o);
              const out = o.stock !== null && o.stock <= 0;
              const busy = adding === o.listingId;
              return (
                <View key={o.listingId} style={[styles.offerRow, i > 0 && styles.offerRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.sellerRow}>
                      <Text style={styles.offerSeller} numberOfLines={1}>
                        {o.companyName}
                      </Text>
                      {o.verified ? <Ionicons name="checkmark-circle" size={14} color={colors.primary} /> : null}
                      {o.source === "QUOTATION" ? <StatusBadge status="QUOTATION" small /> : null}
                    </View>
                    <View style={styles.sellerMeta}>
                      <Text style={typography.caption}>{o.city}</Text>
                      <Text style={styles.dot}>·</Text>
                      <Text style={typography.caption}>{o.leadTimeDays}d</Text>
                      <Text style={styles.dot}>·</Text>
                      <Text style={typography.caption}>min {o.minQty}</Text>
                      {purchasable ? (
                        <>
                          <Text style={styles.dot}>·</Text>
                          <Text style={[typography.caption, { color: stockLabel(o, product.unit, t).color }]}>
                            {o.stock === null ? t("onRequest") : out ? t("outOfStock") : t("inStock")}
                          </Text>
                        </>
                      ) : null}
                    </View>
                    {!purchasable ? (
                      <View style={styles.refPill}>
                        <Ionicons name="information-circle-outline" size={12} color={colors.info} />
                        <Text style={styles.refText}>
                          {t("referencePrice")}
                          {o.sourceName ? ` · ${o.sourceName}` : ""}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Text style={styles.offerPrice}>{formatSar(o.price)}</Text>
                    <Button
                      title={t("add")}
                      size="sm"
                      variant={purchasable ? "secondary" : "ghost"}
                      disabled={!purchasable || out}
                      loading={busy}
                      onPress={() => void add(o, product)}
                    />
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      {specs.length || product.description ? (
        <View style={styles.section}>
          <SectionHeader title="Specifications" style={{ marginTop: spacing.md }} />
          <Card>
            {product.description ? <Text style={[typography.bodySmall, { marginBottom: spacing.sm }]}>{product.description}</Text> : null}
            {specs.map(([k, v]) => (
              <KeyValue key={k} label={k} value={String(v)} />
            ))}
          </Card>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Price trend" style={{ marginTop: spacing.md }} />
        <Card>
          <Sparkline history={product.history} />
        </Card>
      </View>

      {product.related.length ? (
        <>
          <SectionHeader title="Related products" style={{ ...styles.section, marginTop: spacing.md }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {product.related.map((p) => (
              <ProductCard key={p.id} product={p} width={160} onPress={() => router.push(`/shop/product/${p.id}`)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {!isSupplier ? (
        <Pressable
          onPress={() => router.push({ pathname: "/rfq/new", params: { materialId: product.id } })}
          style={styles.cta}
        >
          <Ionicons name="flash-outline" size={18} color={colors.primary} />
          <Text style={styles.ctaText}>{t("requestQuotesInstead")}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>
      ) : null}
      <View style={{ height: spacing.xxl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  imageWrap: { backgroundColor: colors.surface },
  tileWrap: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl },
  imageBadges: { position: "absolute", top: spacing.md, left: spacing.lg },
  section: { paddingHorizontal: spacing.lg },
  brand: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", marginTop: spacing.lg },
  name: { ...typography.h1, fontSize: 22, marginTop: 2 },
  nameAr: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: spacing.sm, marginBottom: spacing.md },
  meta: { ...typography.caption },
  dot: { ...typography.caption, marginHorizontal: 5 },
  buyBox: { borderWidth: 1, borderColor: colors.primaryLight },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  price: { fontSize: 28, fontWeight: "800", color: colors.primary },
  priceUnit: { ...typography.bodySmall },
  savePct: { ...typography.caption, color: "#B07A00", backgroundColor: colors.accentLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, fontWeight: "700" },
  sellerBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sellerName: { ...typography.body, fontWeight: "600", flexShrink: 1 },
  rating: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 4 },
  ratingText: { ...typography.caption, fontWeight: "600", color: colors.textSecondary },
  sellerMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 4, gap: 2 },
  stock: { fontSize: 13, fontWeight: "600", marginTop: 6 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.md },
  qtyLabel: { ...typography.label },
  lineTotal: { flex: 1, textAlign: "right", fontSize: 16, fontWeight: "700", color: colors.text },
  offerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  offerRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  offerSeller: { ...typography.body, fontWeight: "600", flexShrink: 1 },
  offerPrice: { fontSize: 16, fontWeight: "700", color: colors.text },
  refPill: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  refText: { ...typography.caption, color: colors.info, fontWeight: "600" },
  rail: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xs },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
  },
  ctaText: { flex: 1, color: colors.primary, fontWeight: "600", fontSize: 14 },
});
